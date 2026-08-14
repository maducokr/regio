// 복음선교-가두방문 → 복음선교-가두선교 이름 변경을 실제 DB에 반영
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const FROM = '복음선교-가두방문';
const TO = '복음선교-가두선교';

async function columnExists(client, col) {
    const r = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name='member' AND column_name=$1`, [col]);
    return r.rows.length > 0;
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // member 컬럼 이름 변경
        if (await columnExists(client, FROM)) {
            if (!(await columnExists(client, TO))) {
                await client.query(`ALTER TABLE member RENAME COLUMN "${FROM}" TO "${TO}"`);
                console.log(`[member] 컬럼 이름변경: ${FROM} → ${TO}`);
            } else {
                console.log(`[member] 대상 컬럼 이미 존재, 생략: ${TO}`);
            }
        } else if (!(await columnExists(client, TO))) {
            await client.query(`ALTER TABLE member ADD COLUMN "${TO}" INTEGER DEFAULT 0`);
            console.log(`[member] 컬럼 신규 추가: ${TO}`);
        } else {
            console.log(`[member] 변경 불필요(이미 ${TO})`);
        }

        // activity_categories 이름 변경
        const c = await client.query(
            `UPDATE activity_categories SET category_name = $1, description = '가두 선교 활동' WHERE category_name = $2`,
            [TO, FROM]);
        console.log(`[categories] 변경 행수: ${c.rowCount}`);

        // activity_field_mapping 이름 변경
        const mapTableExists = (await client.query(
            `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='activity_field_mapping') AS ex`
        )).rows[0].ex;
        if (mapTableExists) {
            const m = await client.query(
                `UPDATE activity_field_mapping SET category_name = $1 WHERE category_name = $2`, [TO, FROM]);
            console.log(`[field_mapping] 변경 행수: ${m.rowCount}`);
        }

        await client.query('COMMIT');
        console.log('\n✅ 가두방문 → 가두선교 변경 완료.');

        const cats = await client.query(
            `SELECT category_name FROM activity_categories WHERE category_name LIKE '복음선교%' ORDER BY id`);
        console.log('\n현재 복음선교 카테고리:');
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
