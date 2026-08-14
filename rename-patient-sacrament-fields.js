/**
 * 어려운자돌봄-교우 환자 방문 및 돌봄
 * 성사 → 병자성사, 첫영성체 → 병자영성체
 * node rename-patient-sacrament-fields.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const CATEGORY = '어려운자돌봄-교우 환자 방문 및 돌봄';
const UPDATES = [
    { fieldNames: ['성사', 'sacrament'], display: '병자성사', keepField: '성사' },
    { fieldNames: ['첫영성체', 'first_communion'], display: '병자영성체', keepField: '첫영성체' }
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
        for (const u of UPDATES) {
            const r = await client.query(
                `UPDATE activity_field_mapping
                 SET field_name = $1, field_display_name = $2
                 WHERE category_name = $3
                   AND field_name = ANY($4::text[])
                 RETURNING field_name, field_display_name`,
                [u.keepField, u.display, CATEGORY, u.fieldNames]
            );
            if (r.rowCount) {
                console.log(`✅ ${u.display}:`, r.rows);
            } else {
                await client.query(
                    `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
                     VALUES ($1, $2, $3, false)
                     ON CONFLICT (category_name, field_name) DO UPDATE
                       SET field_display_name = EXCLUDED.field_display_name`,
                    [CATEGORY, u.keepField, u.display]
                );
                console.log(`✅ ${u.display}: inserted`);
            }
        }
    } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
})();
