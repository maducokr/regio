/**
 * 이웃에 가톨릭 알리기활동 종목·세목 추가
 * 활동요약: 횟수(count), 교리반인도(catechism_guide)
 * 사용: node add-neighbor-catholic-activity.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const useRender = process.argv.includes('--render');
if (useRender) {
    require('dotenv').config({ path: require('path').join(__dirname, '.env.render'), override: true });
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

const GROUP = '이웃에 가톨릭 알리기활동';

/** 세목 (요청 표기 중 '교리리반' → '교리반' 교정) */
const ITEMS = [
    { item: '이웃에 신앙전하기', desc: '이웃·가족에게 가톨릭 신앙 전하기' },
    { item: '교리반수강권유', desc: '교리반 수강 권유' },
    { item: '통신교리수강권유', desc: '통신교리 수강 권유' },
    { item: '교리반중단자재수강권유', desc: '교리반 중단자 재수강 권유' },
    { item: '가두선교', desc: '가두 선교' },
    { item: '주택방문', desc: '주택 방문 선교' },
    { item: '선교책자전달', desc: '선교 책자 전달' },
    { item: '접촉활동', desc: '예비신자·이웃 접촉 활동' }
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
                await ensureMapping(client, name, '교리반인도', '교리반인도', false);
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ ${GROUP} 세목 ${ITEMS.length}개 반영 완료. (${useRender ? 'Render' : 'local'})`);

        // member 레거시 컬럼은 트랜잭션 밖에서 시도 (권한 없으면 무시)
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
