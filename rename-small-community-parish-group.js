/**
 * 본당교회협조 소공동체 세목 → 검은색 종목「소공동체 활동 (본당과 직장)」으로 이동
 *
 * - 소공동체 모임 참석, 구역·반장교육 참석, 반모임 참석 권유: 이름·그룹 변경
 * - 반모임참석·구역반장교육및모임참석·직장공동체활동: 기타 로 병합
 * - 기타: 신규 추가
 *
 * 사용: node rename-small-community-parish-group.js [--render]
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

const GROUP = '소공동체 활동 (본당과 직장)';

const RENAMES = [
    { from: '본당교회협조-소공동체모임참석', to: `${GROUP}-소공동체 모임 참석`, desc: '소공동체 모임 참석' },
    { from: '본당교회협조-구역반장교육참석', to: `${GROUP}-구역·반장교육 참석`, desc: '구역·반장교육 참석' },
    { from: '본당교회협조-반모임 참석권유', to: `${GROUP}-반모임 참석 권유`, desc: '반모임 참석 권유' }
];

const MERGE_INTO_ETC = [
    '본당교회협조-반모임참석',
    '본당교회협조-구역반장교육및모임참석',
    '본당교회협조-직장공동체활동'
];

const ETC = `${GROUP}-기타`;

async function tableExists(client, name) {
    const r = await client.query(
        `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
         ) AS ex`,
        [name]
    );
    return !!r.rows[0].ex;
}

async function columnExists(client, col) {
    const r = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'member' AND column_name = $1`,
        [col]
    );
    return r.rows.length > 0;
}

async function ensureMapping(client, categoryName) {
    const exists = await client.query(
        `SELECT 1 FROM activity_field_mapping
         WHERE category_name = $1 AND field_name IN ('횟수', 'count')`,
        [categoryName]
    );
    if (exists.rows.length) return;
    await client.query(
        `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
         VALUES ($1, '횟수', '횟수(회,단,시간,명)', true)`,
        [categoryName]
    );
}

async function mergeInto(client, from, to) {
    const existingTo = await client.query(`SELECT id FROM activity_categories WHERE category_name = $1`, [to]);
    const existingFrom = await client.query(`SELECT id FROM activity_categories WHERE category_name = $1`, [from]);
    if (!existingFrom.rows.length) return;
    if (!existingTo.rows.length) {
        await client.query(
            `UPDATE activity_categories
             SET category_name = $1, category_group = $2, description = '기타'
             WHERE category_name = $3`,
            [to, GROUP, from]
        );
        await client.query(
            `UPDATE activity_field_mapping SET category_name = $1 WHERE category_name = $2`,
            [to, from]
        ).catch(() => {});
        console.log(`[categories] 병합(이름변경): ${from} → ${to}`);
        return;
    }
    const fromId = existingFrom.rows[0].id;
    const toId = existingTo.rows[0].id;
    if (await tableExists(client, 'activity_records')) {
        await client.query(`UPDATE activity_records SET category_id = $1 WHERE category_id = $2`, [toId, fromId]);
    }
    await client.query(`DELETE FROM activity_field_mapping WHERE category_name = $1`, [from]).catch(() => {});
    await client.query(`DELETE FROM activity_categories WHERE id = $1`, [fromId]);
    console.log(`[categories] 병합: ${from} → ${to}`);
}

async function renameCategory(client, from, to, desc) {
    const existingTo = await client.query(`SELECT id FROM activity_categories WHERE category_name = $1`, [to]);
    const existingFrom = await client.query(`SELECT id FROM activity_categories WHERE category_name = $1`, [from]);

    if (!existingFrom.rows.length && existingTo.rows.length) {
        console.log(`[categories] 이미 반영: ${to}`);
        return;
    }
    if (existingFrom.rows.length && existingTo.rows.length) {
        await mergeInto(client, from, to);
        return;
    }
    if (!existingFrom.rows.length && !existingTo.rows.length) {
        await client.query(
            `INSERT INTO activity_categories (category_name, category_group, description)
             VALUES ($1, $2, $3)`,
            [to, GROUP, desc]
        );
        console.log(`[categories] 신규: ${to}`);
        return;
    }
    await client.query(
        `UPDATE activity_categories
         SET category_name = $1, category_group = $2, description = $3
         WHERE category_name = $4`,
        [to, GROUP, desc, from]
    );
    await client.query(
        `UPDATE activity_field_mapping SET category_name = $1 WHERE category_name = $2`,
        [to, from]
    ).catch(() => {});
    console.log(`[categories] 이동: ${from} → ${to}`);
}

async function tryMemberRename(client, from, to) {
    try {
        await client.query('SAVEPOINT member_col');
        if (await columnExists(client, from) && !(await columnExists(client, to))) {
            await client.query(`ALTER TABLE member RENAME COLUMN "${from}" TO "${to}"`);
            console.log(`[member] 컬럼: ${from} → ${to}`);
        }
        await client.query('RELEASE SAVEPOINT member_col');
    } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT member_col').catch(() => {});
        console.warn(`[member] 컬럼 생략 (${from}): ${err.message}`);
    }
}

async function main() {
    const client = await activePool.connect();
    try {
        await client.query('BEGIN');
        const mapExists = await tableExists(client, 'activity_field_mapping');

        await client.query(
            `INSERT INTO activity_categories (category_name, category_group, description)
             VALUES ($1, $2, '기타')
             ON CONFLICT (category_name) DO UPDATE
             SET category_group = EXCLUDED.category_group,
                 description = EXCLUDED.description`,
            [ETC, GROUP]
        );
        if (mapExists) await ensureMapping(client, ETC);
        console.log(`[categories] 확인: ${ETC}`);

        for (const from of MERGE_INTO_ETC) {
            await mergeInto(client, from, ETC);
            await tryMemberRename(client, from, ETC);
        }

        for (const item of RENAMES) {
            await renameCategory(client, item.from, item.to, item.desc);
            if (mapExists) await ensureMapping(client, item.to);
            await tryMemberRename(client, item.from, item.to);
        }

        if (await tableExists(client, 'activity_assignments')) {
            for (const item of RENAMES) {
                await client.query(
                    `UPDATE activity_assignments SET "활동배당" = $1 WHERE "활동배당" = $2`,
                    [item.to, item.from]
                );
            }
            for (const from of MERGE_INTO_ETC) {
                await client.query(
                    `UPDATE activity_assignments SET "활동배당" = $1 WHERE "활동배당" = $2`,
                    [ETC, from]
                );
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ 소공동체 활동 (본당과 직장) 종목 반영 완료. (${useRender ? 'Render' : 'local'})`);
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
