require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const LEGACY_MIN = 3;
const LEGACY_MAX = 138;

(async () => {
    const client = await pool.connect();
    try {
        const preview = await client.query(`
            SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE name ~ '^T[1-6]')::int AS to_change
            FROM member
        `);
        console.log('현황:', preview.rows[0]);

        const result = await client.query(`
            UPDATE member
            SET name = regexp_replace(name, '^T([1-6])', 'G\\1')
            WHERE name ~ '^T[1-6]'
            RETURNING id, name
        `);

        console.log(`✅ member.name ${result.rowCount}건 T→G 변경 완료 (전체 회원)`);
        if (result.rows.length) {
            console.log('변경 샘플:', result.rows.slice(0, 10));
        }
    } finally {
        client.release();
        await pool.end();
    }
})();
