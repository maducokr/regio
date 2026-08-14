/**
 * 모의 회원 로그인 진단: DB 자격증명 vs parseLoginId / 로그인 매칭
 * node diagnose-sample-login.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: +(process.env.DB_PORT || 5432)
});

const PASSNO_PATTERN = /^[!@#$%^&*][a-zA-Z]{3}\d{4}$/;

function extractRealNameFromMemberName(memberName) {
    const trimmed = String(memberName || '').trim();
    const compound = trimmed.match(/^[TG]([1-6])([78])(.*)$/i);
    if (compound) return compound[3] || '';
    const simple = trimmed.match(/^[TG]([1-8])(.*)$/i);
    if (simple) return simple[2] || '';
    return trimmed;
}

function buildLoginId(row) {
    const phone4 = String(row.phone_last4 || '').replace(/\D/g, '').slice(-4).padStart(4, '0');
    return `${extractRealNameFromMemberName(row.name)}${phone4}`;
}

function parseLoginId(loginId) {
    const trimmed = String(loginId || '').trim();
    const plainMatch = trimmed.match(/^(.+?)(\d{4})$/);
    if (plainMatch) {
        const namePart = String(plainMatch[1] || '').trim();
        if (namePart.length >= 2 && !/\d/.test(namePart)) {
            return {
                positionCode: null,
                name: namePart,
                phone_last4: plainMatch[2],
                style: 'plain'
            };
        }
    }
    return null;
}

function memberMatchesLoginRealName(memberName, loginRealName) {
    const real = extractRealNameFromMemberName(memberName);
    const target = String(loginRealName || '').trim();
    if (!target) return false;
    return real === target || real.replace(/\d+$/, '') === target;
}

(async () => {
    const { rows } = await pool.query(
        `SELECT id, name, phone_last4, passno, resident_id_front6
         FROM member
         WHERE id BETWEEN 3 AND 103
         ORDER BY id`
    );

    console.log(`회원 수: ${rows.length}`);
    let ok = 0;
    let fail = 0;
    const failures = [];

    for (const row of rows) {
        const loginId = buildLoginId(row);
        const password = String(row.passno || '').trim();
        const parsed = parseLoginId(loginId);

        if (!parsed || parsed.style !== 'plain') {
            fail += 1;
            failures.push({ id: row.id, loginId, reason: 'parseLoginId 실패', name: row.name, passno: password });
            continue;
        }

        if (!PASSNO_PATTERN.test(password)) {
            fail += 1;
            failures.push({ id: row.id, loginId, reason: `비번 형식 아님: ${password}`, name: row.name, passno: password });
            continue;
        }

        const result = await pool.query(
            `SELECT id, name, passno, phone_last4
             FROM member
             WHERE phone_last4 = $1
               AND (passno = $2 OR phone_last4 || resident_id_front6 = $2)`,
            [parsed.phone_last4, password]
        );
        const matched = result.rows.filter((r) => memberMatchesLoginRealName(r.name, parsed.name));

        if (matched.length === 1 && matched[0].id === row.id) {
            ok += 1;
        } else {
            fail += 1;
            failures.push({
                id: row.id,
                loginId,
                password,
                name: row.name,
                phone_last4: row.phone_last4,
                reason: matched.length === 0
                    ? 'DB 매칭 0건'
                    : `매칭 ${matched.length}건 (ids=${matched.map((m) => m.id).join(',')})`
            });
        }
    }

    console.log(`성공 예상: ${ok}`);
    console.log(`실패: ${fail}`);
    if (failures.length) {
        console.log('\n실패 상세 (최대 20):');
        failures.slice(0, 20).forEach((f) => console.log(JSON.stringify(f)));
    }

    // 샘플 3명 실제 HTTP 로그인 (서버 떠 있으면)
    const samples = rows.slice(0, 3);
    for (const row of samples) {
        const loginId = buildLoginId(row);
        const password = String(row.passno || '').trim();
        try {
            const res = await fetch('http://127.0.0.1:3000/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: loginId, password })
            });
            const text = await res.text();
            console.log(`\nHTTP 로그인 id=${row.id} ${loginId} / ${password} => ${res.status} ${text.slice(0, 200)}`);
        } catch (err) {
            console.log(`\nHTTP 로그인 불가 (서버 미기동?): ${err.message}`);
            break;
        }
    }

    await pool.end();
})().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
