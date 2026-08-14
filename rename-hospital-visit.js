// '특별활동-병원방문봉사' → '특별활동-병원방문' (봉사 삭제)
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const OLD = '특별활동-병원방문봉사';
const NEW = '특별활동-병원방문';
const NEW_DESC = '병원 방문 활동';

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existingNew = await client.query(
            `SELECT id FROM activity_categories WHERE category_name = $1`,
            [NEW]
        );
        if (existingNew.rows.length > 0) {
            // 대상명이 이미 있으면 옛 종목 활동을 새 종목으로 옮긴 뒤 옛 종목 삭제
            const oldCat = await client.query(
                `SELECT id FROM activity_categories WHERE category_name = $1`,
                [OLD]
            );
            if (oldCat.rows.length > 0) {
                const oldId = oldCat.rows[0].id;
                const newId = existingNew.rows[0].id;
                const moved = await client.query(
                    `UPDATE activity_records SET category_id = $1 WHERE category_id = $2`,
                    [newId, oldId]
                );
                console.log(`[activity_records] 이관: ${moved.rowCount}건`);
                await client.query(`DELETE FROM activity_field_mapping WHERE category_name = $1`, [OLD]);
                await client.query(`DELETE FROM activity_categories WHERE id = $1`, [oldId]);
                console.log(`[categories] 중복 옛 종목 삭제: ${OLD}`);
            } else {
                console.log(`[categories] 이미 반영됨: ${NEW}`);
            }
        } else {
            const cat = await client.query(
                `UPDATE activity_categories
                 SET category_name = $1, description = $2
                 WHERE category_name = $3
                 RETURNING id`,
                [NEW, NEW_DESC, OLD]
            );
            console.log(`[categories] 종목명 변경: ${cat.rowCount}건`);
        }

        const mapTableExists = (await client.query(
            `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='activity_field_mapping') AS ex`
        )).rows[0].ex;
        if (mapTableExists) {
            const map = await client.query(
                `UPDATE activity_field_mapping SET category_name = $1 WHERE category_name = $2 RETURNING field_name`,
                [NEW, OLD]
            );
            console.log(`[field_mapping] 매핑 변경: ${map.rowCount}건`);
        }

        const colExists = await client.query(
            `SELECT 1 FROM information_schema.columns WHERE table_name='member' AND column_name=$1`,
            [OLD]
        );
        if (colExists.rows.length > 0) {
            const newColExists = await client.query(
                `SELECT 1 FROM information_schema.columns WHERE table_name='member' AND column_name=$1`,
                [NEW]
            );
            if (newColExists.rows.length === 0) {
                await client.query(`ALTER TABLE member RENAME COLUMN "${OLD}" TO "${NEW}"`);
                console.log(`[member] 컬럼 변경: "${OLD}" → "${NEW}"`);
            } else {
                console.log(`[member] 대상 컬럼이 이미 존재하여 건너뜀: "${NEW}"`);
            }
        } else {
            console.log(`[member] 변경할 컬럼 없음: "${OLD}"`);
        }

        await client.query('COMMIT');
        console.log(`\n✅ ${OLD} → ${NEW} 변경 완료.`);

        const check = await client.query(
            `SELECT category_name FROM activity_categories
             WHERE category_group = '특별활동' OR category_name LIKE '%병원방문%'
             ORDER BY id`
        );
        console.log('\n관련 카테고리:');
        check.rows.forEach((r) => console.log(' -', r.category_name));
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
