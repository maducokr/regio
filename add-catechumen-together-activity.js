/**
 * 예비신자와 함께하는 활동 종목·세목 추가
 * 활동요약: 횟수(count), 영세자(baptism)
 * 사용: node add-catechumen-together-activity.js
 * Render: node add-catechumen-together-activity.js --render
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

const GROUP = '예비신자와 함께하는 활동';

const ITEMS = [
    { item: '교리반에 동반 참석', desc: '예비신자와 교리반 동반 참석' },
    { item: '미사동반 참례', desc: '예비신자와 미사 동반 참례' },
    { item: '본당행사 동반 참석', desc: '예비신자와 본당행사 동반 참석' },
    { item: '본당생활 안내', desc: '예비신자 본당생활 안내' },
    { item: '기도 등 신앙생활 지도', desc: '기도 등 신앙생활 지도' },
    { item: '교리반의 출석 점검', desc: '교리반 출석 점검' },
    { item: '예비자행정지원', desc: '예비자 행정 지원' },
    { item: '교리반간식 봉사', desc: '교리반 간식 봉사' },
    { item: '교리 시간에 예비신자의 아기를 돌봄', desc: '교리 시간 예비신자 아기 돌봄' },
    { item: '기타', desc: '예비신자와 함께하는 기타 활동' }
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
                await ensureMapping(client, name, '영세자', '영세자', false);
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
