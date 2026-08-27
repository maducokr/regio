/**
 * 광주(파란색) 복음선교 세목명 변경
 * - 복음선교-통신교리자 → 복음선교-통신교리자돌봄
 * - 복음선교-타인이 인도한 예비자 → 복음선교-타인이 인도한 예비신자 돌봄
 * - 복음선교-교리반 인도 예비자 → 복음선교-교리반 인도 예비신자 돌봄
 *
 * 사용: node rename-gwangju-evangelism-care.js [--render]
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

const RENAMES = [
    {
        from: '복음선교-통신교리자',
        to: '복음선교-통신교리자돌봄',
        desc: '통신교리자돌봄 (광주)'
    },
    {
        from: '복음선교-타인이 인도한 예비자',
        to: '복음선교-타인이 인도한 예비신자 돌봄',
        desc: '타인이 인도한 예비신자 돌봄 (광주)'
    },
    {
        from: '복음선교-교리반 인도 예비자',
        to: '복음선교-교리반 인도 예비신자 돌봄',
        desc: '교리반 인도 예비신자 돌봄 (광주)'
    }
];

async function columnExists(client, col) {
    const r = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'member' AND column_name = $1`,
        [col]
    );
    return r.rows.length > 0;
}

async function renameCategory(client, from, to, desc, mapTableExists) {
    try {
        if (await columnExists(client, from)) {
            if (!(await columnExists(client, to))) {
                await client.query(`ALTER TABLE member RENAME COLUMN "${from}" TO "${to}"`);
                console.log(`[member] 컬럼 이름변경: ${from} → ${to}`);
            } else {
                console.log(`[member] 대상 컬럼 이미 존재, 변경 생략: ${to}`);
            }
        }
    } catch (colErr) {
        console.warn(`[member] 컬럼 생략 (${from}): ${colErr.message}`);
    }

    const existingTo = await client.query(
        `SELECT id FROM activity_categories WHERE category_name = $1`,
        [to]
    );
    const existingFrom = await client.query(
        `SELECT id FROM activity_categories WHERE category_name = $1`,
        [from]
    );

    if (existingFrom.rows.length && existingTo.rows.length) {
        const fromId = existingFrom.rows[0].id;
        const toId = existingTo.rows[0].id;
        await client.query(
            `UPDATE activity_records SET category_id = $1 WHERE category_id = $2`,
            [toId, fromId]
        );
        if (mapTableExists) {
            await client.query(
                `DELETE FROM activity_field_mapping WHERE category_name = $1`,
                [from]
            );
        }
        await client.query(`DELETE FROM activity_categories WHERE id = $1`, [fromId]);
        await client.query(
            `UPDATE activity_categories
             SET category_group = '복음선교', description = COALESCE(NULLIF(description, ''), $1)
             WHERE id = $2`,
            [desc, toId]
        );
        console.log(`[categories] 병합: ${from} → ${to}`);
    } else if (existingFrom.rows.length) {
        await client.query(
            `UPDATE activity_categories
             SET category_name = $1, category_group = '복음선교', description = $2
             WHERE category_name = $3`,
            [to, desc, from]
        );
        console.log(`[categories] 이름변경: ${from} → ${to}`);
    } else {
        await client.query(
            `INSERT INTO activity_categories (category_name, category_group, description)
             VALUES ($1, '복음선교', $2)
             ON CONFLICT (category_name) DO UPDATE
             SET category_group = EXCLUDED.category_group,
                 description = EXCLUDED.description`,
            [to, desc]
        );
        console.log(`[categories] 신규/확인: ${to}`);
    }

    if (mapTableExists) {
        await client.query(
            `UPDATE activity_field_mapping SET category_name = $1 WHERE category_name = $2`,
            [to, from]
        );
    }
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

        for (const item of RENAMES) {
            await renameCategory(client, item.from, item.to, item.desc, mapExists);
        }

        await client.query('COMMIT');
        console.log(`\n✅ 광주 복음선교 세목명 ${RENAMES.length}건 변경 완료. (${useRender ? 'Render' : 'local'})`);
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
