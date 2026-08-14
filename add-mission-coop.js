// 기타활동-선교회협조 종목 추가 (필드: 횟수)
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const NAME = '기타활동-선교회협조';
const DESC = '선교회 협조 활동';

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `INSERT INTO activity_categories (category_name, category_group, description)
             VALUES ($1, '기타활동', $2)
             ON CONFLICT (category_name) DO NOTHING`,
            [NAME, DESC]
        );
        console.log(`[categories] 추가/확인: ${NAME}`);

        const mapExists = (await client.query(
            `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='activity_field_mapping') AS ex`
        )).rows[0].ex;

        if (mapExists) {
            await client.query(
                `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
                 VALUES ($1, '횟수', '횟수(회,단,시간)', true)
                 ON CONFLICT (category_name, field_name) DO NOTHING`,
                [NAME]
            );
            console.log(`[field_mapping] 매핑 추가/확인: ${NAME}`);
        }

        await client.query('COMMIT');
        console.log('\n✅ 기타활동-선교회협조 반영 완료.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 오류, 롤백:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
