// activity_field_mapping: 횟수(회,단,시간) → 횟수(회,단,시간,명)
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
    const client = await pool.connect();
    try {
        const result = await client.query(
            `UPDATE activity_field_mapping
             SET field_display_name = '횟수(회,단,시간,명)'
             WHERE field_display_name = '횟수(회,단,시간)'
                OR (field_name IN ('횟수', 'count') AND field_display_name LIKE '횟수(회,단,시간)%' AND field_display_name <> '횟수(회,단,시간,명)')`
        );
        console.log(`✅ activity_field_mapping ${result.rowCount}건 업데이트 완료`);
    } catch (err) {
        console.error('업데이트 실패:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
})();
