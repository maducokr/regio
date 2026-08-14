/**
 * 비번찾기 테스트용: 임의(샘플) 회원 100명에 Gmail 부여
 *
 * DB에 email UNIQUE(LOWER) 제약이 있어 동일 주소 중복은 불가.
 * 대신 test+01@gmail.com ~ test+100@gmail.com (Gmail +별칭)을 부여하면
 * 실제 수신은 모두 test@gmail.com 으로 모입니다.
 *
 * node assign-test-gmail-100.js
 */
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_ADMIN_USER || process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || '5854',
    port: +(process.env.DB_PORT || 5432)
});

const BASE = 'test';
const DOMAIN = 'gmail.com';
const LIMIT = 100;

function aliasEmail(n) {
    return `${BASE}+${String(n).padStart(2, '0')}@${DOMAIN}`;
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 관리자·이미 실사용 이메일이 있는 회원 제외, T/G 샘플 우선
        const { rows } = await client.query(
            `SELECT id, name, email
             FROM member
             WHERE name ~* '^[TG]'
               AND name NOT ILIKE '%김학숭%'
               AND (
                    email IS NULL
                    OR LOWER(email) LIKE 'test+%@gmail.com'
                    OR LOWER(email) = 'test@gmail.com'
               )
             ORDER BY id
             LIMIT $1`,
            [LIMIT]
        );

        if (rows.length === 0) {
            throw new Error('대상 회원이 없습니다.');
        }

        let updated = 0;
        const samples = [];
        for (let i = 0; i < rows.length; i += 1) {
            const row = rows[i];
            const email = aliasEmail(i + 1);
            await client.query(
                `UPDATE member
                 SET email = $1, email_verified = true
                 WHERE id = $2`,
                [email, row.id]
            );
            updated += 1;
            if (samples.length < 8) {
                samples.push({ id: row.id, name: row.name, email });
            }
        }

        await client.query('COMMIT');
        console.log(`✅ ${updated}명에게 test+NN@gmail.com 부여 (email_verified=true)`);
        console.log('   ※ 동일 test@gmail.com 중복은 UNIQUE 제약으로 불가 → +별칭 사용');
        console.log('   ※ Gmail 수신함은 test@gmail.com 하나로 모입니다.');
        console.log('샘플:');
        for (const s of samples) {
            console.log(`  #${s.id} ${s.name} → ${s.email}`);
        }
        if (updated > samples.length) {
            console.log(`  … 외 ${updated - samples.length}명`);
        }
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        console.error('❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
