/**
 * 모의 회원(id 3~103) 세나뚜스 배당
 * 3~26 서울, 27~63 대구, 64~103 광주
 *
 * node assign-sample-senatus.js
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

(async () => {
    const ranges = [
        { name: '서울', min: 3, max: 26 },
        { name: '대구', min: 27, max: 63 },
        { name: '광주', min: 64, max: 103 }
    ];

    const total = await pool.query(
        'SELECT COUNT(*)::int AS n FROM member WHERE id BETWEEN 3 AND 103'
    );
    console.log('대상 회원수(3~103):', total.rows[0].n);

    for (const r of ranges) {
        const result = await pool.query(
            `UPDATE member
             SET senatus_name = $1
             WHERE id BETWEEN $2 AND $3
             RETURNING id`,
            [r.name, r.min, r.max]
        );
        const ids = result.rows.map((row) => row.id);
        console.log(`${r.name} (${r.min}~${r.max}): ${result.rowCount}명`, ids.join(','));
    }

    const summary = await pool.query(
        `SELECT senatus_name,
                COUNT(*)::int AS n,
                MIN(id) AS id_min,
                MAX(id) AS id_max
         FROM member
         WHERE id BETWEEN 3 AND 103
         GROUP BY senatus_name
         ORDER BY MIN(id)`
    );
    console.log('집계:');
    for (const row of summary.rows) {
        console.log(`  ${row.senatus_name || '(없음)'}: ${row.n}명 (id ${row.id_min}~${row.id_max})`);
    }

    await pool.end();
})().catch((err) => {
    console.error('오류:', err.message);
    process.exitCode = 1;
});
