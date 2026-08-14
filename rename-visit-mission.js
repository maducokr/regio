// '복음선교-방문' 활동종목을 '복음선교-방문선교'로 변경하는 스크립트
// - activity_categories.category_name
// - activity_field_mapping.category_name (횟수, 교리반인도)
// - member 테이블의 동명 컬럼
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const OLD = '복음선교-방문';
const NEW = '복음선교-방문선교';

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const cat = await client.query(
            `UPDATE activity_categories SET category_name = $1 WHERE category_name = $2 RETURNING id`,
            [NEW, OLD]
        );
        console.log(`[categories] 종목명 변경: ${cat.rowCount}건`);

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
        console.log('\n✅ 복음선교-방문 → 복음선교-방문선교 변경 완료.');

        const check = await client.query(
            `SELECT category_name FROM activity_categories WHERE category_group = '복음선교' ORDER BY id`
        );
        console.log('\n현재 복음선교 카테고리:');
        check.rows.forEach(r => console.log(' -', r.category_name));
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
