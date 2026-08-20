/**
 * 본당협조활동 종목·세목 추가
 * 활동요약: 횟수, 첫 영성체 교리반 인도(명), 유아세례 외 영세(명)
 * 사용: node add-parish-coop-activity.js [--render]
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

const GROUP = '본당협조활동';

/** 요청 목록 중 중복(주일학교 봉사·본당 대청소)은 1회만 등록 */
const ITEMS = [
    { item: '본당 행사 준비 및 협조', desc: '본당 행사 준비·협조' },
    { item: '전례 봉사', desc: '전례 봉사' },
    { item: '성시간 참석', desc: '성시간 참석' },
    { item: '본당 교육 및 피정에 참석권유', desc: '본당 교육·피정 참석 권유' },
    { item: '본당 교육 및 피정 봉사', desc: '본당 교육·피정 봉사' },
    { item: '주일학교 봉사', desc: '주일학교 봉사' },
    { item: '본당 대청소에 참여', desc: '본당 대청소 참여' },
    { item: '본당시설의 청소', desc: '본당시설 청소' },
    { item: '본당시설의 정비', desc: '본당시설 정비' },
    { item: '본당 보수공사에 노력봉사', desc: '본당 보수공사 노력봉사' },
    { item: '본당 교세조사', desc: '본당 교세조사' },
    { item: '교육·피정에 차량봉사', desc: '교육·피정 차량봉사' },
    { item: '교육·피정에 교통정리', desc: '교육·피정 교통정리' },
    { item: '첫영성체 교리반에 인도', desc: '첫영성체 교리반 인도' }
];

const FIELDS = [
    { name: '횟수', display: '횟수(회,단,시간,명)', required: true },
    { name: '첫 영성체 교리반 인도', display: '첫 영성체 교리반 인도', required: false },
    { name: '유아세례 외 영세', display: '유아세례 외 영세', required: false }
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
