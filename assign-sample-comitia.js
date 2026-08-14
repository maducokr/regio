/**
 * 샘플 회원(3~138) 세 그룹에 꼬미시움 명칭 부여
 * - 3~56   → 제1꼬미시움
 * - 60~105 → 제2꼬미시움
 * - 106~138 → 제3꼬미시움
 */
const { Pool } = require('pg');

try {
    require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
} catch (_) {
    /* optional */
}

const pool = new Pool({
    user: process.env.DB_ADMIN_USER || process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    max: 1,
    application_name: 'regio-assign-comitia'
});

const GROUPS = [
    { min: 3, max: 56, name: '제1꼬미시움' },
    { min: 60, max: 105, name: '제2꼬미시움' },
    { min: 106, max: 138, name: '제3꼬미시움' }
];

async function main() {
    const client = await pool.connect();
    try {
        await client.query('ALTER TABLE member ADD COLUMN IF NOT EXISTS comitia_name VARCHAR(200)');
        await client.query('BEGIN');

        for (const g of GROUPS) {
            const r = await client.query(
                `UPDATE member
                 SET comitia_name = $1
                 WHERE id BETWEEN $2 AND $3
                 RETURNING id`,
                [g.name, g.min, g.max]
            );
            console.log(`✅ ${g.min}~${g.max}: "${g.name}" → ${r.rowCount}명`);
        }

        await client.query('COMMIT');

        const check = await client.query(`
            SELECT
                CASE
                    WHEN id BETWEEN 3 AND 56 THEN '3-56'
                    WHEN id BETWEEN 60 AND 105 THEN '60-105'
                    WHEN id BETWEEN 106 AND 138 THEN '106-138'
                    ELSE 'other'
                END AS grp,
                comitia_name,
                COUNT(*)::int AS cnt
            FROM member
            WHERE id BETWEEN 3 AND 138
            GROUP BY 1, 2
            ORDER BY 1, 2
        `);
        console.log('\n📊 결과:');
        check.rows.forEach((row) => {
            console.log(`  ${row.grp} | ${row.comitia_name || '(없음)'} | ${row.cnt}명`);
        });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
});
