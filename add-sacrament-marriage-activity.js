/**
 * 성사권유 및 혼인장애자를 위한 활동 종목·세목 추가
 * 활동자료: 횟수, 회두, 판공, 견진, 유아세례, 혼인장애 해소
 * 사용: node add-sacrament-marriage-activity.js
 * Render: node add-sacrament-marriage-activity.js --render
 */
require('dotenv').config();
const { Pool } = require('pg');
const path = require('path');

const useRender = process.argv.includes('--render');
if (useRender) {
    require('dotenv').config({ path: path.join(__dirname, '.env.render'), override: true });
}

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: String(process.env.DB_PASSWORD || '5854'),
    port: parseInt(process.env.DB_PORT || '5432', 10)
});

const activePool = useRender && process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })
    : pool;

const GROUP = '성사권유 및 혼인장애자를 위한 활동';

const ITEMS = [
    { item: '쉬는 교우 방문 성사보기 권유', desc: '쉬는 교우 방문·성사보기 권유' },
    { item: '쉬는 교우에게 본당 행사 참가 권유', desc: '쉬는 교우 본당 행사 참가 권유' },
    { item: '쉬는 교우신앙상담', desc: '쉬는 교우 신앙 상담' },
    { item: '판공성사 권유', desc: '판공성사 권유' },
    { item: '성사표 전달', desc: '성사표 전달' },
    { item: '견진성사 권유', desc: '견진성사 권유' },
    { item: '견진성사대부모 주선', desc: '견진성사 대부모 주선' },
    { item: '유아세례 권유', desc: '유아세례 권유' },
    { item: '유아세례 시 대부모 주선', desc: '유아세례 시 대부모 주선' },
    { item: '유아세례 행정 협조', desc: '유아세례 행정 협조' },
    { item: '혼인장애자를 방문', desc: '혼인장애자 방문' },
    { item: '혼인장애를 해소협조', desc: '혼인장애 해소 협조' },
    { item: '냉담자 접촉활동', desc: '냉담자 접촉 활동' }
];

const FIELDS = [
    { name: '횟수', display: '횟수(회,단,시간,명)', required: true },
    { name: '회두', display: '회두', required: false },
    { name: '판공', display: '판공', required: false },
    { name: '견진', display: '견진', required: false },
    { name: '유아세례', display: '유아세례', required: false },
    { name: '혼인장애 해소', display: '혼인장애 해소', required: false }
];

async function ensureMapping(client, categoryName, fieldName, displayName, required) {
    const exists = await client.query(
        `SELECT 1 FROM activity_field_mapping
         WHERE category_name = $1 AND field_name = $2`,
        [categoryName, fieldName]
    );
    if (exists.rows.length) return;
    await client.query(
        `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
         VALUES ($1, $2, $3, $4)`,
        [categoryName, fieldName, displayName, required]
    );
}

async function main() {
    const client = await activePool.connect();
    try {
        await client.query('BEGIN');

        const mapExists = (await client.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'activity_field_mapping'
             ) AS ex`
        )).rows[0].ex;

        for (const { item, desc } of ITEMS) {
            const name = `${GROUP}-${item}`;
            await client.query(
                `INSERT INTO activity_categories (category_name, category_group, description)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (category_name) DO UPDATE
                 SET category_group = EXCLUDED.category_group,
                     description = EXCLUDED.description`,
                [name, GROUP, desc]
            );
            console.log(`[categories] ${name}`);

            if (mapExists) {
                for (const f of FIELDS) {
                    await ensureMapping(client, name, f.name, f.display, f.required);
                }
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ ${GROUP} 세목 ${ITEMS.length}개 반영 완료. (${useRender ? 'Render' : 'local'})`);

        for (const { item } of ITEMS) {
            const name = `${GROUP}-${item}`;
            try {
                const memberCol = await client.query(
                    `SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'member' AND column_name = $1`,
                    [name]
                );
                if (!memberCol.rows.length) {
                    await client.query(`ALTER TABLE member ADD COLUMN "${name}" INTEGER DEFAULT 0`);
                    console.log(`[member] 컬럼 추가: ${name}`);
                }
            } catch (colErr) {
                console.warn(`[member] 컬럼 생략 (${name}): ${colErr.message}`);
            }
        }
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        console.error('❌ 오류, 롤백:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await activePool.end();
        if (useRender && activePool !== pool) await pool.end().catch(() => {});
    }
}

main();
