/**
 * 특별활동-호구조사 세목 추가
 * 사용: node add-special-household-survey.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    })
    : new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'regio',
        password: process.env.DB_PASSWORD || '5854',
        port: parseInt(process.env.DB_PORT || '5432', 10)
    });

const CAT = {
    name: '특별활동-호구조사',
    group: '특별활동',
    desc: '호구조사(호별방문) 활동'
};

async function ensureMapping(client) {
    const exists = await client.query(
        `SELECT 1 FROM activity_field_mapping
         WHERE category_name = $1 AND field_name = '횟수'`,
        [CAT.name]
    );
    if (exists.rows.length) return;
    await client.query(
        `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
         VALUES ($1, '횟수', '횟수(회,단,시간,명)', true)`,
        [CAT.name]
    );
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `INSERT INTO activity_categories (category_name, category_group, description)
             VALUES ($1, $2, $3)
             ON CONFLICT (category_name) DO UPDATE
             SET category_group = EXCLUDED.category_group,
                 description = EXCLUDED.description`,
            [CAT.name, CAT.group, CAT.desc]
        );
        console.log(`[categories] 추가/확인: ${CAT.name}`);

        const mapExists = (await client.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'activity_field_mapping'
             ) AS ex`
        )).rows[0].ex;
        if (mapExists) {
            await ensureMapping(client);
            console.log(`[field_mapping] 확인: ${CAT.name}`);
        }

        const memberCol = await client.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'member' AND column_name = $1`,
            [CAT.name]
        );
        if (!memberCol.rows.length) {
            await client.query(`ALTER TABLE member ADD COLUMN "${CAT.name}" INTEGER DEFAULT 0`);
            console.log(`[member] 컬럼 추가: ${CAT.name}`);
        }

        await client.query('COMMIT');
        console.log('\n✅ 특별활동-호구조사 반영 완료.');
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
