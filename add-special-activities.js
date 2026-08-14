// 신규 활동그룹 '특별활동' 4개 종목을 실제 DB에 반영하는 스크립트
// - 재해피해자돌봄, 사고피해자돌봄, 복지시설노력봉사, 병원방문
// - 각 종목 입력필드: 횟수(회,단,시간)
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const GROUP = '특별활동';
const NEW_ITEMS = [
    { name: '특별활동-재해피해자돌봄', desc: '재해 피해자 돌봄 활동' },
    { name: '특별활동-사고피해자돌봄', desc: '사고 피해자 돌봄 활동' },
    { name: '특별활동-복지시설노력봉사', desc: '복지시설 노력봉사 활동' },
    { name: '특별활동-병원방문', desc: '병원 방문 활동' },
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
                 VALUES ($1, $2, $3)
                 ON CONFLICT (category_name) DO NOTHING`,
                [item.name, GROUP, item.desc]
            );
            console.log(`[categories] 추가/확인: ${item.name}`);

            if (mapTableExists) {
                await client.query(
                    `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
                     VALUES ($1, '횟수', '횟수(회,단,시간)', true)
                     ON CONFLICT (category_name, field_name) DO NOTHING`,
                    [item.name]
                );
                console.log(`[field_mapping] 매핑 추가/확인: ${item.name} (횟수)`);
            }
        }

        await client.query('COMMIT');
        console.log('\n✅ 특별활동 신규 항목 DB 반영 완료.');

        const cats = await client.query(
            `SELECT category_name FROM activity_categories WHERE category_group = $1 ORDER BY id`,
            [GROUP]
        );
        console.log(`\n현재 ${GROUP} 카테고리:`);
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
