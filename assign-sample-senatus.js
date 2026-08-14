/**
 * 샘플 회원(3~138) 세나뚜스 명칭 부여 → 서울
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
    application_name: 'regio-assign-senatus'
});

async function main() {
    const client = await pool.connect();
    try {
        await client.query('ALTER TABLE member ADD COLUMN IF NOT EXISTS senatus_name VARCHAR(50)');
        const updated = await client.query(
            `UPDATE member SET senatus_name = $1 WHERE id BETWEEN 3 AND 138`,
            ['서울']
        );
        console.log(`updated: ${updated.rowCount}`);
        const check = await client.query(
            `SELECT senatus_name, COUNT(*)::int AS cnt
             FROM member WHERE id BETWEEN 3 AND 138
             GROUP BY senatus_name ORDER BY 1`
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
