const { Pool } = require('pg');
try { require('dotenv').config(); } catch (_) {}
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    max: 1
});
(async () => {
    const r = await pool.query(
        `DELETE FROM activity_field_mapping
         WHERE category_name = ANY($1::text[])
           AND field_name = '입단'
         RETURNING category_name`,
        [['레지오활동-행동단원 모집', '레지오활동-협조단원 모집. 돌봄']]
    );
    console.log('deleted', r.rowCount);
    await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
