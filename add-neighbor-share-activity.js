/**
 * 어려움을 겪는 이웃과 나눔 활동 종목·세목 추가
 * 활동요약: 활동횟수, 상가방문, 위령기도, 장례미사, 장지수행,
 *           병자성사, 봉성체, 대세자, 보례자, 병원 및 복지시설, 기타
 * 사용: node add-neighbor-share-activity.js [--render]
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

const GROUP = '어려움을 겪는 이웃과 나눔 활동';

const ITEMS = [
    { item: '상가방문', desc: '상가 방문·돌봄' },
    { item: '위령기도', desc: '위령기도' },
    { item: '장례미사', desc: '장례미사' },
    { item: '장지수행', desc: '장지 수행' },
    { item: '추모미사 참례', desc: '추모미사 참례' },
    { item: '병자성사', desc: '병자성사 주선·동반' },
    { item: '봉성체 주선', desc: '봉성체 주선' },
    { item: '병원봉사', desc: '병원 봉사' },
    { item: '환자방문', desc: '환자 방문' },
    { item: '복지시설 봉사', desc: '복지시설 봉사' },
    { item: '복지시설 위문', desc: '복지시설 위문' },
    { item: '재해 및 사고 피해자 방문', desc: '재해·사고 피해자 방문' },
    { item: '재해 및 사고 피해자 봉사', desc: '재해·사고 피해자 봉사' },
    { item: '재소자 방문', desc: '재소자 방문' },
    { item: '재소자 돌봄', desc: '재소자 돌봄' },
    { item: '교통사고자돌봄', desc: '교통사고자 돌봄' }
];

const FIELDS = [
    { name: '횟수', display: '활동횟수', required: true },
    { name: '상가방문', display: '상가방문', required: false },
    { name: '위령기도', display: '위령기도', required: false },
    { name: '장례미사', display: '장례미사', required: false },
    { name: '장지수행', display: '장지수행', required: false },
    { name: '병자성사', display: '병자성사', required: false },
    { name: '봉성체', display: '봉성체', required: false },
    { name: '대세자', display: '대세자', required: false },
    { name: '보례자', display: '보례자', required: false },
    { name: '병원 및 복지시설', display: '병원 및 복지시설', required: false },
    { name: '기타', display: '기타', required: false }
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
