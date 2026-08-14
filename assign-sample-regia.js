/**
 * 샘플 회원(3~138) 레지아 명칭 부여 → 7레지아
 */
const { Pool } = require('pg');

try {
    require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
} catch (_) {
    /* optional */
}

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    max: 1,
    application_name: 'regio-assign-regia'
});

async function main() {
    const client = await pool.connect();
    try {
        await client.query('ALTER TABLE member ADD COLUMN IF NOT EXISTS regia_name VARCHAR(200)');
        const updated = await client.query(
            `UPDATE member
             SET regia_name = $1
             WHERE id BETWEEN 3 AND 138`,
            ['7레지아']
        );
        console.log(`updated: ${updated.rowCount}`);

        const check = await client.query(
            `SELECT regia_name,
                    COUNT(*)::int AS cnt,
                    MIN(id) AS min_id,
                    MAX(id) AS max_id
             FROM member
             WHERE id BETWEEN 3 AND 138
             GROUP BY regia_name
             ORDER BY regia_name`
        );
        console.table(check.rows);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
