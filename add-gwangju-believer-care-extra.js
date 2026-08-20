/**
 * 교우돌봄(광주 세나뚜스) 추가 세목
 * 활동요약: 단체 가입, 쉬는 교우 회두, 혼인 장애 해소, 판공 성사, 견진 성사, 유아 세례 (명)
 * 사용: node add-gwangju-believer-care-extra.js [--render]
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

const GROUP = '교우돌봄';

const ITEMS = [
    { item: '신 세례자 방문', desc: '신 세례자 방문 (광주)' },
    { item: '쉬는 교우 방문', desc: '쉬는 교우 방문 (광주)' },
    { item: '교우 가정 방문', desc: '교우 가정 방문 (광주)' },
    { item: '혼인 장애자 방문', desc: '혼인 장애자 방문 (광주)' },
    { item: '성사 권면', desc: '성사 권면 (광주)' },
    { item: '전입 교우 방문', desc: '전입 교우 방문 (광주)' },
    { item: '첫 영성체', desc: '첫 영성체 (광주)' },
    { item: '유아 세례 권면', desc: '유아 세례 권면 (광주)' }
];

const FIELDS = [
    { name: '횟수', display: '횟수', required: false },
    { name: '단체 가입', display: '단체 가입', required: false },
    { name: '쉬는 교우 회두', display: '쉬는 교우 회두', required: false },
    { name: '혼인 장애 해소', display: '혼인 장애 해소', required: false },
    { name: '판공 성사', display: '판공 성사', required: false },
    { name: '견진 성사', display: '견진 성사', required: false },
    { name: '유아 세례', display: '유아 세례', required: false }
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
        console.log(`\n✅ ${GROUP}(광주) 세목 ${ITEMS.length}개 반영 완료. (${useRender ? 'Render' : 'local'})`);

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
