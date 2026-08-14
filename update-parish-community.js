// 본당교회협조 소공동체 관련 변경을 실제 DB에 반영
// 1) 본당교회협조-소공동체활동 → 본당교회협조-소공동체모임참석 (이름 변경)
// 2) 본당교회협조-구역반장교육참석 (신규 추가, 필드: 횟수)
// 3) 본당교회협조-반모임 참석권유 (신규 추가, 필드: 횟수)
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const RENAME = { from: '본당교회협조-소공동체활동', to: '본당교회협조-소공동체모임참석' };
const NEW_ITEMS = [
    { name: '본당교회협조-구역반장교육참석', desc: '구역반장 교육 참석' },
    { name: '본당교회협조-반모임 참석권유', desc: '반모임 참석 권유' },
];

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const mapTableExists = (await client.query(
            `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='activity_field_mapping') AS ex`
        )).rows[0].ex;

        // 1) 이름 변경 (activity_categories + activity_field_mapping)
        const c = await client.query(
            `UPDATE activity_categories SET category_name = $1, description = '소공동체 모임 참석' WHERE category_name = $2`,
            [RENAME.to, RENAME.from]);
        console.log(`[categories] 이름변경 행수: ${c.rowCount} (${RENAME.from} → ${RENAME.to})`);
        // 대상이 없었다면 신규 보장
        await client.query(
            `INSERT INTO activity_categories (category_name, category_group, description)
             VALUES ($1::varchar, '본당교회협조', '소공동체 모임 참석')
             ON CONFLICT (category_name) DO NOTHING`, [RENAME.to]);

        if (mapTableExists) {
            const m = await client.query(
                `UPDATE activity_field_mapping SET category_name = $1 WHERE category_name = $2`,
                [RENAME.to, RENAME.from]);
            console.log(`[field_mapping] 이름변경 행수: ${m.rowCount}`);
            await client.query(
                `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
                 VALUES ($1, '횟수', '횟수(회,단,시간)', true)
                 ON CONFLICT (category_name, field_name) DO NOTHING`, [RENAME.to]);
        }

        // 2~3) 신규 항목 추가
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
        console.log('\n✅ 소공동체 관련 변경 DB 반영 완료.');

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
