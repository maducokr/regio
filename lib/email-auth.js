const crypto = require('crypto');

let nodemailer = null;
try {
    nodemailer = require('nodemailer');
} catch (error) {
    nodemailer = null;
}

const CODE_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 30 * 60 * 1000;

function isGmailAddress(email) {
    const normalized = String(email || '').trim().toLowerCase();
    return /^[^\s@]+@(gmail|googlemail)\.com$/.test(normalized);
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function generateToken() {
    return crypto.randomBytes(24).toString('hex');
}

function maskEmail(email) {
    const normalized = normalizeEmail(email);
    const [local, domain] = normalized.split('@');
    if (!local || !domain) return '***';
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}***@${domain}`;
}

function isEmailConfigured() {
    return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && nodemailer);
}

async function createTransporter() {
    if (!isEmailConfigured()) return null;
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        }
    });
}

async function sendVerificationEmail(email, code, purposeLabel) {
    const normalized = normalizeEmail(email);
    if (!isEmailConfigured()) {
        console.log(`[DEV 이메일 인증] ${purposeLabel} → ${normalized} 코드: ${code}`);
        return { devMode: true };
    }

    const transporter = await createTransporter();
    await transporter.sendMail({
        from: `"Regio" <${process.env.GMAIL_USER}>`,
        to: normalized,
        subject: `[Regio] ${purposeLabel} 인증코드`,
        text: `Regio ${purposeLabel} 인증코드: ${code}\n10분 내에 입력해주세요.`,
        html: `<p>Regio <strong>${purposeLabel}</strong> 인증코드입니다.</p><p style="font-size:26px;font-weight:bold;letter-spacing:4px;">${code}</p><p>10분 내에 입력해주세요.</p>`
    });
    return { devMode: false };
}

async function ensureEmailAuthSchema(pool) {
    await pool.query(`
        ALTER TABLE member
            ADD COLUMN IF NOT EXISTS email VARCHAR(255),
            ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS google_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS curia_officer VARCHAR(50)
    `);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS member_email_unique_idx
        ON member (LOWER(email))
        WHERE email IS NOT NULL
    `);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS member_google_id_unique_idx
        ON member (google_id)
        WHERE google_id IS NOT NULL
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS email_verifications (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            code VARCHAR(6) NOT NULL,
            purpose VARCHAR(32) NOT NULL,
            context JSONB,
            verification_token VARCHAR(64),
            verified_at TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS email_verifications_lookup_idx
        ON email_verifications (LOWER(email), purpose, expires_at DESC)
    `);
}

async function invalidatePendingCodes(pool, email, purpose) {
    await pool.query(
        `UPDATE email_verifications
         SET expires_at = CURRENT_TIMESTAMP
         WHERE LOWER(email) = LOWER($1) AND purpose = $2 AND verified_at IS NULL`,
        [email, purpose]
    );
}

async function createEmailVerification(pool, email, purpose, context) {
    const normalized = normalizeEmail(email);
    if (!isGmailAddress(normalized)) {
        throw new Error('GMAIL_ONLY');
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await invalidatePendingCodes(pool, normalized, purpose);
    await pool.query(
        `INSERT INTO email_verifications (email, code, purpose, context, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [normalized, code, purpose, context ? JSON.stringify(context) : null, expiresAt]
    );

    const purposeLabel = ({
        register: '회원가입',
        find_password: '비밀번호 찾기',
        withdraw: '탈단',
        delete_member: '회원 삭제'
    })[purpose] || purpose;
    const sendResult = await sendVerificationEmail(normalized, code, purposeLabel);
    return {
        email: normalized,
        emailHint: maskEmail(normalized),
        devMode: sendResult.devMode,
        ...(sendResult.devMode ? { devCode: code } : {})
    };
}

async function verifyEmailCode(pool, email, code, purpose) {
    const normalized = normalizeEmail(email);
    const result = await pool.query(
        `SELECT id, code, context, expires_at, verified_at
         FROM email_verifications
         WHERE LOWER(email) = LOWER($1) AND purpose = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [normalized, purpose]
    );

    if (result.rows.length === 0) {
        throw new Error('CODE_NOT_FOUND');
    }

    const row = result.rows[0];
    if (row.verified_at) {
        throw new Error('CODE_ALREADY_USED');
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
        throw new Error('CODE_EXPIRED');
    }
    if (String(row.code) !== String(code).trim()) {
        throw new Error('CODE_INVALID');
    }

    const verificationToken = generateToken();
    const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await pool.query(
        `UPDATE email_verifications
         SET verified_at = CURRENT_TIMESTAMP,
             verification_token = $1,
             expires_at = $2
         WHERE id = $3`,
        [verificationToken, tokenExpiresAt, row.id]
    );

    return {
        verification_token: verificationToken,
        context: row.context
    };
}

async function consumeVerificationToken(pool, email, purpose, verificationToken) {
    const normalized = normalizeEmail(email);
    const result = await pool.query(
        `SELECT id, context, expires_at
         FROM email_verifications
         WHERE LOWER(email) = LOWER($1)
           AND purpose = $2
           AND verification_token = $3
           AND verified_at IS NOT NULL
         ORDER BY verified_at DESC
         LIMIT 1`,
        [normalized, purpose, verificationToken]
    );

    if (result.rows.length === 0) {
        throw new Error('TOKEN_INVALID');
    }

    const row = result.rows[0];
    if (new Date(row.expires_at).getTime() < Date.now()) {
        throw new Error('TOKEN_EXPIRED');
    }

    await pool.query('DELETE FROM email_verifications WHERE id = $1', [row.id]);
    return row.context;
}

module.exports = {
    isGmailAddress,
    normalizeEmail,
    maskEmail,
    isEmailConfigured,
    ensureEmailAuthSchema,
    createEmailVerification,
    verifyEmailCode,
    consumeVerificationToken
};
