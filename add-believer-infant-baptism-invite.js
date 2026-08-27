/**
 * 검은색 교우돌봄 세목 추가
 * - 교우돌봄-유아세례권면
 * 활동요약: 횟수, 유아세례
 * 사용: node add-believer-infant-baptism-invite.js [--render]
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
const NAME = `${GROUP}-유아세례권면`;
const DESC = '유아세례 권면';
const FIELDS = [
    { name: '횟수', display: '횟수(회,단,시간,명)', required: true },
    { name: '유아세례', display: '유아세례', required: false }
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

        await client.query(
            `INSERT INTO activity_categories (category_name, category_group, description)
             VALUES ($1, $2, $3)
             ON CONFLICT (category_name) DO UPDATE
             SET category_group = EXCLUDED.category_group,
                 description = EXCLUDED.description`,
            [NAME, GROUP, DESC]
        );
        console.log(`[categories] ${NAME}`);

        if (mapExists) {
            for (const f of FIELDS) {
                await ensureMapping(client, NAME, f.name, f.display, f.required);
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ 교우돌봄-유아세례권면 반영 완료. (${useRender ? 'Render' : 'local'})`);

        try {
            await client.query('BEGIN');
            const memberCol = await client.query(
                `SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'member' AND column_name = $1`,
                [NAME]
            );
            if (!memberCol.rows.length) {
                await client.query(`ALTER TABLE member ADD COLUMN "${NAME}" INTEGER DEFAULT 0`);
                console.log(`[member] 컬럼 추가: ${NAME}`);
            }
            await client.query('COMMIT');
        } catch (colErr) {
            try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
            console.warn(`[member] 컬럼 생략 (${NAME}): ${colErr.message}`);
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
