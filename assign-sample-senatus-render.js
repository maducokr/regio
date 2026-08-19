/**
 * Render PostgreSQL에 모의 회원(id 3~103) 세나뚜스 배당
 * 3~26 서울, 27~63 대구, 64~103 광주
 *
 * node assign-sample-senatus-render.js
 */
require('dotenv').config({ path: '.env.render' });
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    console.error('.env.render 에 DATABASE_URL 이 없습니다.');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    const hostHint = String(process.env.DATABASE_URL).replace(/:[^:@/]+@/, ':****@').split('@')[1] || '';
    console.log('대상 DB:', hostHint);

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

    const choi = await pool.query(
        `SELECT id, name, senatus_name FROM member WHERE id = 53 OR name LIKE '%최유나%'`
    );
    console.log('최유나:', choi.rows);

    await pool.end();
})().catch((err) => {
    console.error('오류:', err.message);
    process.exitCode = 1;
});
