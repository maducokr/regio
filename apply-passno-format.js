// 기존 member.passno를 특수문자+영문3자+숫자4자 형식으로 변환
require('dotenv').config();
const { Pool } = require('pg');

const PASSNO_SPECIALS = '!@#$%^&*';
const PASSNO_PATTERN = /^[!@#$%^&*][a-zA-Z]{3}\d{4}$/;

function generatePassno(phoneLast4, seed = 0) {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const p4 = String(phoneLast4 || '0000').replace(/\D/g, '').slice(-4).padStart(4, '0');
    const n = (Number(seed) || parseInt(p4, 10) || 0) >>> 0;
    const special = PASSNO_SPECIALS[n % PASSNO_SPECIALS.length];
    let chars = '';
    for (let i = 0; i < 3; i++) {
        chars += letters[(n + i * 11) % 26];
    }
    return `${special}${chars}${p4}`;
}

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: +(process.env.DB_PORT || 5432)
});

(async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT id, name, phone_last4, passno FROM member ORDER BY id`
        );

        let updated = 0;
        let skipped = 0;

        for (const row of rows) {
            const current = String(row.passno || '').trim();
            if (PASSNO_PATTERN.test(current)) {
                skipped++;
                continue;
            }
            const newPassno = generatePassno(row.phone_last4, row.id);
            await client.query('UPDATE member SET passno = $1 WHERE id = $2', [newPassno, row.id]);
            console.log(`${row.name} (id=${row.id}): ${current} → ${newPassno}`);
            updated++;
        }

        await client.query('COMMIT');
        console.log(`\n완료: ${updated}명 변환, ${skipped}명 이미 새 형식`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('오류:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
})();
