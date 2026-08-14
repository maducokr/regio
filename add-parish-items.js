// 본당교회협조 신규 항목 3개를 실제 DB에 반영
// - 청소및미화, 미사안내봉사, 기타본당협조 (각 필드: 횟수)
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const NEW_ITEMS = [
    { name: '본당교회협조-청소및미화', desc: '청소 및 미화 활동' },
    { name: '본당교회협조-미사안내봉사', desc: '미사 안내 봉사' },
    { name: '본당교회협조-기타본당협조', desc: '기타 본당 협조 활동' },
];

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const mapTableExists = (await client.query(
            `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='activity_field_mapping') AS ex`
        )).rows[0].ex;

        for (const item of NEW_ITEMS) {
            await client.query(
                `INSERT INTO activity_categories (category_name, category_group, description)
                 VALUES ($1, '본당교회협조', $2)
                 ON CONFLICT (category_name) DO NOTHING`, [item.name, item.desc]);
            console.log(`[categories] 추가/확인: ${item.name}`);

            if (mapTableExists) {
                await client.query(
                    `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
                     VALUES ($1, '횟수', '횟수(회,단,시간)', true)
                     ON CONFLICT (category_name, field_name) DO NOTHING`, [item.name]);
                console.log(`[field_mapping] 매핑 추가/확인: ${item.name}`);
            }
        }

        await client.query('COMMIT');
        console.log('\n✅ 본당교회협조 신규 항목 DB 반영 완료.');

        const cats = await client.query(
            `SELECT category_name FROM activity_categories WHERE category_name LIKE '본당교회협조%' ORDER BY id`);
        console.log('\n현재 본당교회협조 카테고리:');
        cats.rows.forEach(r => console.log(' -', r.category_name));
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
