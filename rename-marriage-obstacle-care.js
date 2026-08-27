/**
 * 검은색 교우돌봄 세목명 변경
 * 교우돌봄-혼인 장애자 돌봄 → 교우돌봄-혼인장애자안내
 *
 * 사용: node rename-marriage-obstacle-care.js [--render]
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

const FROM = '교우돌봄-혼인 장애자 돌봄';
const TO = '교우돌봄-혼인장애자안내';
const DESC = '혼인장애자 안내';

async function columnExists(client, col) {
    const r = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'member' AND column_name = $1`,
        [col]
    );
    return r.rows.length > 0;
}

async function main() {
    const client = await activePool.connect();
    try {
        await client.query('BEGIN');

        try {
            await client.query('SAVEPOINT member_col');
            if (await columnExists(client, FROM)) {
                if (!(await columnExists(client, TO))) {
                    await client.query(`ALTER TABLE member RENAME COLUMN "${FROM}" TO "${TO}"`);
                    console.log(`[member] 컬럼 이름변경: ${FROM} → ${TO}`);
                }
            }
            await client.query('RELEASE SAVEPOINT member_col');
        } catch (colErr) {
            await client.query('ROLLBACK TO SAVEPOINT member_col').catch(() => {});
            console.warn(`[member] 컬럼 생략: ${colErr.message}`);
        }

        const existingTo = await client.query(
            `SELECT id FROM activity_categories WHERE category_name = $1`,
            [TO]
        );
        const existingFrom = await client.query(
            `SELECT id FROM activity_categories WHERE category_name = $1`,
            [FROM]
        );

        if (existingFrom.rows.length && existingTo.rows.length) {
            const fromId = existingFrom.rows[0].id;
            const toId = existingTo.rows[0].id;
            await client.query(
                `UPDATE activity_records SET category_id = $1 WHERE category_id = $2`,
                [toId, fromId]
            );
            await client.query(`DELETE FROM activity_field_mapping WHERE category_name = $1`, [FROM]).catch(() => {});
            await client.query(`DELETE FROM activity_categories WHERE id = $1`, [fromId]);
            console.log(`[categories] 병합: ${FROM} → ${TO}`);
        } else if (existingFrom.rows.length) {
            await client.query(
                `UPDATE activity_categories
                 SET category_name = $1, category_group = '교우돌봄', description = $2
                 WHERE category_name = $3`,
                [TO, DESC, FROM]
            );
            console.log(`[categories] 이름변경: ${FROM} → ${TO}`);
        } else {
            await client.query(
                `INSERT INTO activity_categories (category_name, category_group, description)
                 VALUES ($1, '교우돌봄', $2)
                 ON CONFLICT (category_name) DO UPDATE
                 SET category_group = EXCLUDED.category_group,
                     description = EXCLUDED.description`,
                [TO, DESC]
            );
            console.log(`[categories] 신규/확인: ${TO}`);
        }

        await client.query(
            `UPDATE activity_field_mapping SET category_name = $1 WHERE category_name = $2`,
            [TO, FROM]
        ).catch(() => {});

        await client.query('COMMIT');
        console.log(`\n✅ 혼인장애자안내 세목명 변경 완료. (${useRender ? 'Render' : 'local'})`);
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
