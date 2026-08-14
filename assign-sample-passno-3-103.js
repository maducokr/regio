/**
 * 모의 회원 id 3~103 비밀번호를 특수문자+영문3자+숫자4자 형식으로 임의 배정
 * 예: @abc1234
 *
 * node assign-sample-passno-3-103.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const ID_MIN = 3;
const ID_MAX = 103;
const PASSNO_SPECIALS = '!@#$%^&*';
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function randomPassno() {
    const special = PASSNO_SPECIALS[Math.floor(Math.random() * PASSNO_SPECIALS.length)];
    let letters = '';
    for (let i = 0; i < 3; i++) {
        letters += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    }
    const digits = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `${special}${letters}${digits}`;
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
            `SELECT id, name, phone_last4, passno
             FROM member
             WHERE id BETWEEN $1 AND $2
             ORDER BY id`,
            [ID_MIN, ID_MAX]
        );

        if (!rows.length) {
            console.log(`회원 ${ID_MIN}~${ID_MAX} 없음`);
            await client.query('ROLLBACK');
            return;
        }

        const used = new Set();
        let updated = 0;

        for (const row of rows) {
            let passno = randomPassno();
            let guard = 0;
            while (used.has(passno) && guard < 50) {
                passno = randomPassno();
                guard += 1;
            }
            used.add(passno);

            const prev = String(row.passno || '').trim();
            await client.query('UPDATE member SET passno = $1 WHERE id = $2', [passno, row.id]);
            console.log(`id=${row.id} ${row.name}: ${prev || '(없음)'} → ${passno}`);
            updated += 1;
        }

        await client.query('COMMIT');
        console.log(`\n완료: ${updated}명 (id ${ID_MIN}~${ID_MAX}) 비번 임의 배정`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('오류:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
})();
