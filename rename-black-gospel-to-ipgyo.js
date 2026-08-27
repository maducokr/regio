/**
 * 검은색(비광주) 복음선교 → 입교권면 이름 변경
 * 광주(파란색) 복음선교 세목은 유지
 *
 * 사용: node rename-black-gospel-to-ipgyo.js [--render]
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

/** 광주(파란색) — 이름 변경 대상에서 제외 */
const GWANGJU_KEEP = new Set([
    '복음선교-비신자 입교 권면',
    '복음선교-개종권면',
    '복음선교-교리 중단자 권면',
    '복음선교-가두선교',
    '복음선교-교리반 인도 예비신자 돌봄',
    '복음선교-통신교리자돌봄',
    '복음선교-타인이 인도한 예비신자 돌봄',
    '복음선교-교리반 봉사 및 협조',
    '복음선교-접촉활동'
]);

const RENAMES = [
    { from: '복음선교-외인 입교권면', to: '입교권면-외인 입교권면', desc: '외인 입교권면' },
    { from: '복음선교-방문선교', to: '입교권면-방문선교', desc: '방문선교' },
    { from: '복음선교-예비신자관리돌봄', to: '입교권면-예비신자관리돌봄', desc: '예비신자관리돌봄' },
    { from: '복음선교-통신교리자 돌봄', to: '입교권면-통신교리자 돌봄', desc: '통신교리자 돌봄' },
    { from: '복음선교-교리반협조', to: '입교권면-교리반협조', desc: '교리반협조' },
    { from: '복음선교-교리반 인도', to: '입교권면-교리반 인도', desc: '교리반 인도' },
    { from: '복음선교-교리반인도예비자', to: '입교권면-교리반인도예비자', desc: '교리반인도예비자' }
];

const NEW_GROUP = '입교권면';

async function columnExists(client, col) {
    const r = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'member' AND column_name = $1`,
        [col]
    );
    return r.rows.length > 0;
}

async function renameOne(client, from, to, desc) {
    if (GWANGJU_KEEP.has(from)) {
        console.log(`[skip] 광주 유지: ${from}`);
        return;
    }

    try {
        await client.query('SAVEPOINT sp_member');
        if (await columnExists(client, from)) {
            if (!(await columnExists(client, to))) {
                await client.query(`ALTER TABLE member RENAME COLUMN "${from}" TO "${to}"`);
                console.log(`[member] 컬럼 이름변경: ${from} → ${to}`);
            }
        }
        await client.query('RELEASE SAVEPOINT sp_member');
    } catch (colErr) {
        try { await client.query('ROLLBACK TO SAVEPOINT sp_member'); } catch (_) { /* ignore */ }
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
        await client.query(`DELETE FROM activity_field_mapping WHERE category_name = $1`, [from]).catch(() => {});
        await client.query(`DELETE FROM activity_categories WHERE id = $1`, [fromId]);
        console.log(`[categories] 병합: ${from} → ${to}`);
    } else if (existingFrom.rows.length) {
        await client.query(
            `UPDATE activity_categories
             SET category_name = $1, category_group = $2, description = $3
             WHERE category_name = $4`,
            [to, NEW_GROUP, desc, from]
        );
        console.log(`[categories] 이름변경: ${from} → ${to}`);
    } else {
        await client.query(
            `INSERT INTO activity_categories (category_name, category_group, description)
             VALUES ($1, $2, $3)
             ON CONFLICT (category_name) DO UPDATE
             SET category_group = EXCLUDED.category_group,
                 description = EXCLUDED.description`,
            [to, NEW_GROUP, desc]
        );
        console.log(`[categories] 신규/확인: ${to}`);
    }

    await client.query(
        `UPDATE activity_field_mapping SET category_name = $1 WHERE category_name = $2`,
        [to, from]
    ).catch(() => {});
}

async function main() {
    const client = await activePool.connect();
    try {
        await client.query('BEGIN');
        for (const row of RENAMES) {
            await renameOne(client, row.from, row.to, row.desc);
        }
        await client.query('COMMIT');
        console.log(`\n✅ 검은색 복음선교 → 입교권면 변경 완료. (${useRender ? 'Render' : 'local'})`);
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
