// 추모미사(memorial_mass) 필드 추가를 실제 DB에 반영
// - activity_records.memorial_mass 컬럼 추가
// - activity_field_mapping 에 어려운자돌봄-교우 상가 방문 및 돌봄 / 추모미사 매핑 추가
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const CATEGORY = '어려운자돌봄-교우 상가 방문 및 돌봄';

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1) activity_records.memorial_mass 컬럼 추가
        const colExists = await client.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_name='activity_records' AND column_name='memorial_mass'`);
        if (colExists.rows.length === 0) {
            await client.query(`ALTER TABLE activity_records ADD COLUMN memorial_mass INTEGER DEFAULT 0`);
            console.log('[activity_records] memorial_mass 컬럼 추가');
        } else {
            console.log('[activity_records] memorial_mass 컬럼 이미 존재');
        }

        // 2) activity_field_mapping 매핑 추가 (테이블 있을 때만)
        const mapTableExists = (await client.query(
            `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='activity_field_mapping') AS ex`
        )).rows[0].ex;
        if (mapTableExists) {
            await client.query(
                `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
                 VALUES ($1, '추모미사', '추모미사', false)
                 ON CONFLICT (category_name, field_name) DO NOTHING`, [CATEGORY]);
            console.log('[activity_field_mapping] 추모미사 매핑 추가/확인');
        } else {
            console.log('[activity_field_mapping] 테이블 없음 - 건너뜀');
        }

        await client.query('COMMIT');
        console.log('\n✅ 추모미사 필드 DB 반영 완료.');

        // 결과 확인
        if (mapTableExists) {
            const rows = await client.query(
                `SELECT field_name, field_display_name, is_required
                 FROM activity_field_mapping WHERE category_name = $1 ORDER BY id`, [CATEGORY]);
            console.log(`\n'${CATEGORY}' 필드 목록:`);
            rows.rows.forEach(r => console.log(` - ${r.field_name} (${r.field_display_name})`));
        }
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
