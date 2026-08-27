/**
 * 광주 세나뚜스(파란색) 활동 세목 추가
 * - 영성생활-성체조배
 * - 교우돌봄-신영세자전례기도지도
 * - 교우돌봄-교우신심활동권면
 * - 교우돌봄-혼인장애자 미사참례권면
 * - 교우돌봄-전입교우단체가입권유
 * - 교우돌봄-청소년돌봄
 * - 이웃돌봄-다문화가족돌봄
 * - 이웃돌봄-죽을 위험 중의 세례자 돌봄
 *
 * 사용: node add-gwangju-spiritual-believer-extra.js [--render]
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

const ITEMS = [
    {
        group: '영성생활',
        item: '성체조배',
        desc: '성체조배 (광주)',
        fields: [{ name: '횟수', display: '횟수(회,단,회,분)', required: false }]
    },
    {
        group: '교우돌봄',
        item: '신영세자전례기도지도',
        desc: '신영세자 전례·기도 지도 (광주)',
        fields: [{ name: '횟수', display: '횟수(회,단,시간,명)', required: false }]
    },
    {
        group: '교우돌봄',
        item: '교우신심활동권면',
        desc: '교우 신심활동 권면 (광주)',
        fields: [
            { name: '횟수', display: '횟수(회,단,시간,명)', required: false },
            { name: '단체가입', display: '단체가입', required: false }
        ]
    },
    {
        group: '교우돌봄',
        item: '혼인장애자 미사참례권면',
        desc: '혼인장애자 미사참례 권면 (광주)',
        fields: [
            { name: '횟수', display: '횟수(회,단,시간,명)', required: false },
            { name: '해소', display: '해소', required: false }
        ]
    },
    {
        group: '교우돌봄',
        item: '전입교우단체가입권유',
        desc: '전입교우 단체가입 권유 (광주)',
        fields: [
            { name: '횟수', display: '횟수(회,단,시간,명)', required: false },
            { name: '단체가입', display: '단체가입', required: false }
        ]
    },
    {
        group: '교우돌봄',
        item: '청소년돌봄',
        desc: '청소년 돌봄 (광주)',
        fields: [{ name: '횟수', display: '횟수(회,단,시간,명)', required: false }]
    },
    {
        group: '이웃돌봄',
        item: '다문화가족돌봄',
        desc: '다문화가족 돌봄 (광주)',
        fields: [{ name: '횟수', display: '횟수(회,단,시간,명)', required: false }]
    },
    {
        group: '이웃돌봄',
        item: '죽을 위험 중의 세례자 돌봄',
        desc: '죽을 위험 중의 세례자 돌봄 (광주)',
        fields: [
            { name: '횟수', display: '횟수(회,단,시간,명)', required: false },
            { name: '교리반인도', display: '교리반인도', required: false }
        ]
    }
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

        for (const row of ITEMS) {
            const name = `${row.group}-${row.item}`;
            await client.query(
                `INSERT INTO activity_categories (category_name, category_group, description)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (category_name) DO UPDATE
                 SET category_group = EXCLUDED.category_group,
                     description = EXCLUDED.description`,
                [name, row.group, row.desc]
            );
            console.log(`[categories] ${name}`);
            if (mapExists) {
                for (const f of row.fields) {
                    await ensureMapping(client, name, f.name, f.display, f.required);
                }
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ 광주(파란색) 세목 ${ITEMS.length}개 반영 완료. (${useRender ? 'Render' : 'local'})`);

        for (const row of ITEMS) {
            const name = `${row.group}-${row.item}`;
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
