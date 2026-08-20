/**
 * 가정을 위한 활동, 교우 돌봄 종목·세목 추가
 * 활동요약: 횟수(count), 단체가입(group_join)
 * 사용: node add-family-believer-care-activity.js
 * Render: node add-family-believer-care-activity.js --render
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

const GROUP = '가정을 위한 활동, 교우 돌봄';

/** 세목 (요청 '가족일살기도' → '가족일상기도' 교정) */
const ITEMS = [
    { item: '가족일상기도', desc: '가족 일상 기도' },
    { item: '외짝교우 부부성경봉독', desc: '외짝교우 부부 성경 봉독' },
    { item: '외짝교우 부부기도', desc: '외짝교우 부부 기도' },
    { item: '외짝교우 부부미사참례', desc: '외짝교우 부부 미사 참례' },
    { item: '가족불우이웃시설봉사', desc: '가족 불우이웃·시설 봉사' },
    { item: '출가자녀와기도', desc: '출가 자녀와 기도' },
    { item: '출가자녀와봉사활동', desc: '출가 자녀와 봉사 활동' },
    { item: '2대3대와함께미사', desc: '2대·3대와 함께 미사' },
    { item: '신심단체 가입 권유', desc: '신심단체 가입 권유' },
    { item: '다문화가정도움지원', desc: '다문화 가정 도움·지원' },
    { item: '신영세자방문 기도', desc: '신영세자 방문 기도' },
    { item: '신영세자방문 돌봄', desc: '신영세자 방문 돌봄' },
    { item: '신영세자영적대화', desc: '신영세자 영적 대화' },
    { item: '가족간축복', desc: '가족 간 축복' },
    { item: '기타', desc: '가정을 위한 활동·교우 돌봄 기타' }
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
                await ensureMapping(client, name, '횟수', '횟수(회,단,시간,명)', true);
                await ensureMapping(client, name, '단체가입', '단체가입', false);
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
