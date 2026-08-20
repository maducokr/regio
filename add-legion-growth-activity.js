/**
 * 레지오의 발전을 위한 활동 종목·세목 추가
 * 활동요약: 행동단원 모집(명), 협조단원 모집(명), 횟수
 * 사용: node add-legion-growth-activity.js [--render]
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

const GROUP = '레지오의 발전을 위한 활동';

const ITEMS = [
    { item: '소년 Pr. 설립 권유', desc: '소년 Pr. 설립 권유' },
    { item: '소년 Pr. 설립 지도', desc: '소년 Pr. 설립 지도' },
    { item: '행동 단원 가입 권유', desc: '행동 단원 가입 권유' },
    { item: '행동 단원 모집', desc: '행동 단원 모집' },
    { item: '협조단원 가입 권유', desc: '협조단원 가입 권유' },
    { item: '협조단원 모집', desc: '협조단원 모집' },
    { item: '활동소홀 단원 돌보기', desc: '활동소홀 단원 돌보기' },
    { item: 'Pr.설립 권유', desc: 'Pr. 설립 권유' },
    { item: '레지오 교육▪행사▪피정참석', desc: '레지오 교육·행사·피정 참석' },
    { item: '레지오 교육▪행사▪피정 봉사', desc: '레지오 교육·행사·피정 봉사' },
    { item: 'Pr.주회 순방', desc: 'Pr. 주회 순방' },
    { item: '평의회 순방', desc: '평의회 순방' },
    { item: '평의회 참석', desc: '평의회 참석' },
    { item: '교본공부', desc: '교본공부' },
    { item: '레지오 행사▪교육▪피정에 차량봉사', desc: '레지오 행사·교육·피정 차량봉사' },
    { item: '레지오 행사▪교육▪피정 교통정리', desc: '레지오 행사·교육·피정 교통정리' },
    { item: '기타', desc: '기타 레지오 발전 활동' }
];

const FIELDS = [
    { name: '행동단원 모집', display: '행동단원 모집', required: false },
    { name: '협조단원 모집', display: '협조단원 모집', required: false },
    { name: '횟수', display: '횟수(회,단,시간,명)', required: true }
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
