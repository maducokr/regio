/**
 * 모의 회원(id 3~103) Pr명칭·꾸리아명칭 앞에 영문 tt 일률 부여
 * 이미 tt로 시작하면 건너뜀
 *
 * node assign-sample-pr-curia-tt-prefix.js
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

async function showDistinct(client, column, label) {
    const result = await client.query(
        `SELECT DISTINCT ${column} AS v, COUNT(*)::int AS cnt
         FROM member
         WHERE id BETWEEN $1 AND $2
         GROUP BY ${column}
         ORDER BY ${column}`,
        [ID_MIN, ID_MAX]
    );
    console.log(`${label}:`);
    result.rows.forEach((r) => console.log(`  ${r.v || '(없음)'} (${r.cnt}명)`));
}

(async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('=== 변경 전 ===');
        await showDistinct(client, 'pr_name', 'Pr명칭');
        await showDistinct(client, 'curia_name', '꾸리아명칭');

        const prResult = await client.query(
            `UPDATE member
             SET pr_name = $3 || pr_name
             WHERE id BETWEEN $1 AND $2
               AND pr_name IS NOT NULL
               AND TRIM(pr_name) <> ''
               AND pr_name NOT ILIKE $4
             RETURNING id`,
            [ID_MIN, ID_MAX, PREFIX, `${PREFIX}%`]
        );

        const curiaResult = await client.query(
            `UPDATE member
             SET curia_name = $3 || curia_name
             WHERE id BETWEEN $1 AND $2
               AND curia_name IS NOT NULL
               AND TRIM(curia_name) <> ''
               AND curia_name NOT ILIKE $4
             RETURNING id`,
            [ID_MIN, ID_MAX, PREFIX, `${PREFIX}%`]
        );

        await client.query('COMMIT');

        console.log(`\nPr명칭 갱신: ${prResult.rows.length}명`);
        console.log(`꾸리아명칭 갱신: ${curiaResult.rows.length}명`);

        console.log('\n=== 변경 후 ===');
        await showDistinct(pool, 'pr_name', 'Pr명칭');
        await showDistinct(pool, 'curia_name', '꾸리아명칭');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('오류:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
})();
