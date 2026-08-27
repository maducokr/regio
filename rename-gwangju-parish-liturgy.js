/**
 * 광주(파란색) 본당협조 전례 협조 세목명 변경
 * 본당협조-전례 협조 → 본당협조-전례 협조(미사안내,주보접기,성가대 등)
 *
 * 사용: node rename-gwangju-parish-liturgy.js [--render]
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

const FROM = '본당협조-전례 협조';
const TO = '본당협조-전례 협조(미사안내,주보접기,성가대 등)';
const DESC = '전례 협조(미사안내,주보접기,성가대 등) (광주)';

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
            if (await columnExists(client, FROM)) {
                if (!(await columnExists(client, TO))) {
                    await client.query(`ALTER TABLE member RENAME COLUMN "${FROM}" TO "${TO}"`);
                    console.log(`[member] 컬럼 이름변경: ${FROM} → ${TO}`);
                }
            }
        } catch (colErr) {
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
                 SET category_name = $1, category_group = '본당협조', description = $2
                 WHERE category_name = $3`,
                [TO, DESC, FROM]
            );
            console.log(`[categories] 이름변경: ${FROM} → ${TO}`);
        } else {
            await client.query(
                `INSERT INTO activity_categories (category_name, category_group, description)
                 VALUES ($1, '본당협조', $2)
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

        const mapExists = (await client.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'activity_field_mapping'
             ) AS ex`
        )).rows[0].ex;
        if (mapExists) {
            const hasCount = await client.query(
                `SELECT 1 FROM activity_field_mapping WHERE category_name = $1 AND field_name IN ('횟수', 'count')`,
                [TO]
            );
            if (!hasCount.rows.length) {
                await client.query(
                    `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
                     VALUES ($1, '횟수', '횟수', false)`,
                    [TO]
                );
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ 전례 협조 세목명 변경 완료. (${useRender ? 'Render' : 'local'})`);
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
