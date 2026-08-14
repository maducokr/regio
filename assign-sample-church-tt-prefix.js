/**
 * 모의 회원(id 3~103) 소속성당(church_name) 앞에 영문 tt 일률 부여
 * 이미 tt로 시작하면 건너뜀
 *
 * node assign-sample-church-tt-prefix.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const ID_MIN = 3;
const ID_MAX = 103;
const PREFIX = 'tt';

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

        const before = await client.query(
            `SELECT DISTINCT church_name, COUNT(*)::int AS cnt
             FROM member
             WHERE id BETWEEN $1 AND $2
             GROUP BY church_name
             ORDER BY church_name`,
            [ID_MIN, ID_MAX]
        );
        console.log('변경 전 성당:');
        before.rows.forEach((r) => console.log(`  ${r.church_name || '(없음)'} (${r.cnt}명)`));

        const result = await client.query(
            `UPDATE member
             SET church_name = $3 || church_name
             WHERE id BETWEEN $1 AND $2
               AND church_name IS NOT NULL
               AND TRIM(church_name) <> ''
               AND church_name NOT ILIKE $4
             RETURNING id, name, church_name`,
            [ID_MIN, ID_MAX, PREFIX, `${PREFIX}%`]
        );

        await client.query('COMMIT');

        console.log(`\n갱신: ${result.rows.length}명`);
        const after = await pool.query(
            `SELECT DISTINCT church_name, COUNT(*)::int AS cnt
             FROM member
             WHERE id BETWEEN $1 AND $2
             GROUP BY church_name
             ORDER BY church_name`,
            [ID_MIN, ID_MAX]
        );
        console.log('변경 후 성당:');
        after.rows.forEach((r) => console.log(`  ${r.church_name || '(없음)'} (${r.cnt}명)`));
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('오류:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
})();
