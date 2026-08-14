// 자연보호및 기타활동 분리
// - 자연보호: 생태 환경보호 활동, 자연보호활동, 환경정화
// - 기타활동: 나머지
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const OLD_PREFIX = '자연보호및 기타활동-';

const MOVES = [
    // 자연보호
    { from: '자연보호및 기타활동-생태 환경보호 활동', to: '자연보호-생태 환경보호 활동', group: '자연보호', desc: '생태 환경보호 활동' },
    { from: '자연보호및 기타활동-자연보호활동', to: '자연보호-자연보호활동', group: '자연보호', desc: '자연보호 활동' },
    { from: '자연보호및 기타활동-환경정화', to: '자연보호-환경정화', group: '자연보호', desc: '환경정화 활동' },
    // 기타활동
    { from: '자연보호및 기타활동-청소 미화', to: '기타활동-청소 미화', group: '기타활동', desc: '청소 미화 활동' },
    { from: '자연보호및 기타활동-출판물 보급', to: '기타활동-출판물 보급', group: '기타활동', desc: '출판물 보급 활동' },
    { from: '자연보호및 기타활동-특별활동', to: '기타활동-특별활동', group: '기타활동', desc: '특별활동' },
    { from: '자연보호및 기타활동-접촉활동', to: '기타활동-접촉활동', group: '기타활동', desc: '접촉활동' },
    { from: '자연보호및 기타활동-차량봉사및교통정리', to: '기타활동-차량봉사및교통정리', group: '기타활동', desc: '차량봉사 및 교통정리' },
    { from: '자연보호및 기타활동-기타', to: '기타활동-기타', group: '기타활동', desc: '기타 활동' },
    { from: '자연보호및 기타활동-기타사목활동', to: '기타활동-기타사목활동', group: '기타활동', desc: '기타 사목활동' },
    { from: '자연보호및 기타활동-기타교구행사참석', to: '기타활동-기타교구행사참석', group: '기타활동', desc: '기타 교구행사 참석' },
];

async function tableExists(client, name) {
    const r = await client.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1) AS ex`,
        [name]
    );
    return !!r.rows[0].ex;
}

async function renameOne(client, item) {
    const fromRow = await client.query(
        `SELECT id FROM activity_categories WHERE category_name = $1`,
        [item.from]
    );
    const toRow = await client.query(
        `SELECT id FROM activity_categories WHERE category_name = $1`,
        [item.to]
    );

    if (!fromRow.rows.length && toRow.rows.length) {
        await client.query(
            `UPDATE activity_categories SET category_group = $1, description = COALESCE(description, $2) WHERE category_name = $3`,
            [item.group, item.desc, item.to]
        );
        console.log(`[categories] 이미 이동됨: ${item.to}`);
        return;
    }

    if (!fromRow.rows.length && !toRow.rows.length) {
        await client.query(
            `INSERT INTO activity_categories (category_name, category_group, description)
             VALUES ($1, $2, $3)`,
            [item.to, item.group, item.desc]
        );
        console.log(`[categories] 신규: ${item.to}`);
        return;
    }

    if (fromRow.rows.length && toRow.rows.length) {
        const fromId = fromRow.rows[0].id;
        const toId = toRow.rows[0].id;
        if (await tableExists(client, 'activity_records')) {
            const m = await client.query(
                `UPDATE activity_records SET category_id = $1 WHERE category_id = $2`,
                [toId, fromId]
            );
            console.log(`[activity_records] 병합 ${item.from} → ${item.to}: ${m.rowCount}건`);
        }
        if (await tableExists(client, 'activity_field_mapping')) {
            await client.query(`DELETE FROM activity_field_mapping WHERE category_name = $1`, [item.from]);
        }
        await client.query(`DELETE FROM activity_categories WHERE id = $1`, [fromId]);
        await client.query(
            `UPDATE activity_categories SET category_group = $1, description = COALESCE(description, $2) WHERE id = $3`,
            [item.group, item.desc, toId]
        );
        console.log(`[categories] 중복 병합 삭제: ${item.from}`);
        return;
    }

    await client.query(
        `UPDATE activity_categories
         SET category_name = $1, category_group = $2, description = COALESCE(description, $3)
         WHERE category_name = $4`,
        [item.to, item.group, item.desc, item.from]
    );
    console.log(`[categories] 이동: ${item.from} → ${item.to}`);

    if (await tableExists(client, 'activity_field_mapping')) {
        await client.query(
            `UPDATE activity_field_mapping SET category_name = $1 WHERE category_name = $2`,
            [item.to, item.from]
        );
        await client.query(
            `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
             VALUES ($1, '횟수', '횟수(회,단,시간)', true)
             ON CONFLICT (category_name, field_name) DO NOTHING`,
            [item.to]
        );
    }

    if (await tableExists(client, 'activity_assignments')) {
        await client.query(
            `UPDATE activity_assignments SET "활동배당" = $1 WHERE "활동배당" = $2`,
            [item.to, item.from]
        ).catch(() => {});
    }
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (const item of MOVES) {
            await renameOne(client, item);
        }

        // 잔여 자연보호및 기타활동 → 접두·그룹 보정
        const leftovers = await client.query(
            `SELECT id, category_name FROM activity_categories
             WHERE category_group = '자연보호및 기타활동'
                OR category_name LIKE $1`,
            [`${OLD_PREFIX}%`]
        );
        for (const row of leftovers.rows) {
            const semok = String(row.category_name).startsWith(OLD_PREFIX)
                ? String(row.category_name).slice(OLD_PREFIX.length)
                : getSemokFallback(row.category_name);
            const nature = ['생태 환경보호 활동', '자연보호활동', '환경정화'].includes(semok);
            const group = nature ? '자연보호' : '기타활동';
            const to = `${group}-${semok}`;
            if (to === row.category_name) {
                await client.query(
                    `UPDATE activity_categories SET category_group = $1 WHERE id = $2`,
                    [group, row.id]
                );
                continue;
            }
            await renameOne(client, {
                from: row.category_name,
                to,
                group,
                desc: semok
            });
        }

        await client.query('COMMIT');
        console.log('\n✅ 자연보호 / 기타활동 분리 완료');

        const check = await client.query(
            `SELECT category_group, category_name
             FROM activity_categories
             WHERE category_group IN ('자연보호', '기타활동', '자연보호및 기타활동')
                OR category_name LIKE '자연보호-%'
                OR category_name LIKE '기타활동-%'
                OR category_name LIKE '자연보호및 기타활동-%'
             ORDER BY category_group, id`
        );
        check.rows.forEach((r) => console.log(` - [${r.category_group}] ${r.category_name}`));
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 오류, 롤백:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

function getSemokFallback(name) {
    const s = String(name || '');
    const i = s.indexOf('-');
    return i >= 0 ? s.slice(i + 1) : s;
}

main();
