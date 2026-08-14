/**
 * 본당교회협조-피정참가권장
 * 피정참가 () 명, 교육참가 () 명 필드 추가
 *
 * node add-retreat-education-attend-fields.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const CATEGORY = '본당교회협조-피정참가권장';
const FIELDS = [
    { field_name: 'membership', field_display_name: '피정참가 () 명', is_required: false },
    { field_name: 'establishment', field_display_name: '교육참가 () 명', is_required: false }
];

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
        for (const f of FIELDS) {
            const r = await client.query(
                `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (category_name, field_name) DO UPDATE
                   SET field_display_name = EXCLUDED.field_display_name,
                       is_required = EXCLUDED.is_required
                 RETURNING field_name, field_display_name`,
                [CATEGORY, f.field_name, f.field_display_name, f.is_required]
            );
            console.log('✅', r.rows[0]);
        }
        // 횟수 필드가 없으면 유지용으로 확인
        const count = await client.query(
            `SELECT field_name FROM activity_field_mapping
             WHERE category_name = $1 AND field_name IN ('횟수', 'count')`,
            [CATEGORY]
        );
        if (!count.rowCount) {
            await client.query(
                `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
                 VALUES ($1, 'count', '횟수(회,단,시간,명)', true)
                 ON CONFLICT (category_name, field_name) DO NOTHING`,
                [CATEGORY]
            );
            console.log('✅ count 필드 추가');
        }
    } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
})();
