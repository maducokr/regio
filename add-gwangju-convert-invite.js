/**
 * 복음선교(광주 세나뚜스) 개종권면 추가
 * 활동요약: 횟수, 교리반 인도, 세례자, 자기 소개서
 * 사용: node add-gwangju-convert-invite.js [--render]
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

const NAME = '복음선교-개종권면';
const GROUP = '복음선교';
const DESC = '개종권면 (광주)';

const FIELDS = [
    { name: '횟수', display: '횟수', required: false },
    { name: '교리반 인도', display: '교리반 인도', required: false },
    { name: '세례자', display: '세례자', required: false },
    { name: '자기 소개서', display: '자기 소개서', required: false }
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
        await client.query(
            `INSERT INTO activity_categories (category_name, category_group, description)
             VALUES ($1, $2, $3)
             ON CONFLICT (category_name) DO UPDATE
             SET category_group = EXCLUDED.category_group,
                 description = EXCLUDED.description`,
            [NAME, GROUP, DESC]
        );
        console.log(`[categories] ${NAME}`);

        const mapExists = (await client.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'activity_field_mapping'
             ) AS ex`
        )).rows[0].ex;
        if (mapExists) {
            for (const f of FIELDS) {
                await ensureMapping(client, NAME, f.name, f.display, f.required);
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ 개종권면(광주) 반영 완료. (${useRender ? 'Render' : 'local'})`);

        try {
            const memberCol = await client.query(
                `SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'member' AND column_name = $1`,
                [NAME]
            );
            if (!memberCol.rows.length) {
                await client.query(`ALTER TABLE member ADD COLUMN "${NAME}" INTEGER DEFAULT 0`);
                console.log(`[member] 컬럼 추가: ${NAME}`);
            }
        } catch (colErr) {
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
