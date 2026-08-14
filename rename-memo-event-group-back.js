/**
 * 메모(내용)및 행사 → 메모및 행사
 * node rename-memo-event-group-back.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const FROM = '메모(내용)및 행사';
const TO = '메모및 행사';

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
        await client.query('BEGIN');

        const cats = await client.query(
            `UPDATE activity_categories
             SET category_name = REPLACE(category_name, $1, $2),
                 category_group = CASE
                     WHEN category_group = $1 THEN $2
                     ELSE REPLACE(COALESCE(category_group, ''), $1, $2)
                 END
             WHERE category_name LIKE $1 || '-%'
                OR category_group = $1
             RETURNING category_name, category_group`,
            [FROM, TO]
        );
        console.log(`✅ activity_categories ${cats.rowCount}건`);
        cats.rows.forEach((r) => console.log(' -', r.category_name, '/', r.category_group));

        const maps = await client.query(
            `UPDATE activity_field_mapping
             SET category_name = REPLACE(category_name, $1, $2)
             WHERE category_name LIKE $1 || '-%'
             RETURNING category_name, field_name`,
            [FROM, TO]
        );
        console.log(`✅ activity_field_mapping ${maps.rowCount}건`);

        await client.query('COMMIT');
        console.log('완료:', `${FROM} → ${TO}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
})();
