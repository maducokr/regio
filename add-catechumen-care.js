// 활동그룹 '예비신자 돌봄' 3개 세목을 DB에 반영
// - 예비신자 돌봄, 통신교리자 돌봄, 교리반 봉사
// - 기존 '예비자 돌봄' 항목이 있으면 rename-catechumen-care.js 사용
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const GROUP = '예비신자 돌봄';
const NEW_ITEMS = [
    { name: '예비신자 돌봄-예비신자 돌봄', desc: '예비신자 돌봄 활동' },
    { name: '예비신자 돌봄-통신교리자 돌봄', desc: '통신교리자 돌봄 활동' },
    { name: '예비신자 돌봄-교리반 봉사', desc: '교리반 봉사 활동' },
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
                 ON CONFLICT (category_name) DO UPDATE
                 SET category_group = EXCLUDED.category_group,
                     description = EXCLUDED.description`,
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
        console.log('\n✅ 예비신자 돌봄 항목 DB 반영 완료.');

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
