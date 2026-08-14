/**
 * 복음선교-가두선교 횟수 표시명: 횟수(회,단,시간,명) → 횟수(회,단,시간,명,건)
 * node update-gadu-count-geon.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10)
});

(async () => {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `UPDATE activity_field_mapping
             SET field_display_name = '횟수(회,단,시간,명,건)'
             WHERE category_name = '복음선교-가두선교'
               AND field_name IN ('횟수', 'count')
             RETURNING category_name, field_name, field_display_name`
        );
        console.log(`✅ ${result.rowCount}건 업데이트`);
        console.log(result.rows);
    } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
})();
