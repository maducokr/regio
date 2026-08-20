/**
 * 상급평의회가 지시한 활동 종목·세목 추가
 * 활동요약: 활동 회수, 성경 통독(장), 묵주 기도(단), 성경 쓰기(장)
 * 사용: node add-higher-council-activity.js [--render]
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

const GROUP = '상급평의회가 지시한 활동';

const ITEMS = [
    { item: '성경통독', desc: '성경 통독' },
    { item: '성경쓰기', desc: '성경 쓰기' },
    { item: '주회 전후 미사', desc: '주회 전후 미사' },
    { item: '미사전 독서‧복음 묵상', desc: '미사 전 독서·복음 묵상' },
    { item: '성모님의 군단 및 빛 잡지 읽기', desc: '성모님의 군단·빛 잡지 읽기' },
    { item: '평일미사 참례', desc: '평일미사 참례' },
    { item: '평일미사 참례 권유', desc: '평일미사 참례 권유' },
    { item: '기타 상급평의회에서 지시한 활동', desc: '기타 상급평의회 지시 활동' }
];

const FIELDS = [
    { name: '활동 회수', display: '활동 회수', required: true },
    { name: '성경 통독', display: '성경 통독', required: false },
    { name: '묵주 기도', display: '묵주 기도', required: false },
    { name: '성경 쓰기', display: '성경 쓰기', required: false }
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
