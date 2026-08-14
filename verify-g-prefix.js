require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

(async () => {
    const r = await pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE id BETWEEN 3 AND 138 AND name ~ '^T[1-6]')::int AS legacy_t,
            COUNT(*) FILTER (WHERE id NOT BETWEEN 3 AND 138 AND name ~ '^G[1-6]')::int AS nonlegacy_g,
            COUNT(*) FILTER (WHERE id NOT BETWEEN 3 AND 138 AND name ~ '^T[1-6]')::int AS nonlegacy_t_remaining
        FROM member
    `);
    console.log('DB 상태:', r.rows[0]);
    const sample = await pool.query(`
        SELECT id, name FROM member WHERE id IN (3, 138, 139, 140) ORDER BY id
    `);
    console.log('샘플:', sample.rows);
    await pool.end();
})();
