// 소공동체활동 4개 종목을 본당교회협조 그룹으로 이동(이름·그룹 변경)
// - 소공동체활동-반모임참석 → 본당교회협조-반모임참석
// - 소공동체활동-반모임참석권유 → 본당교회협조-반모임 참석권유 (기존 종목과 병합)
// - 소공동체활동-구역반장교육및모임참석 → 본당교회협조-구역반장교육및모임참석
// - 소공동체활동-직장공동체활동 → 본당교회협조-직장공동체활동
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const MOVES = [
    {
        from: '소공동체활동-반모임참석',
        to: '본당교회협조-반모임참석',
        desc: '반모임 참석 활동',
    },
    {
        from: '소공동체활동-반모임참석권유',
        to: '본당교회협조-반모임 참석권유',
        desc: '반모임 참석 권유',
    },
    {
        from: '소공동체활동-구역반장교육및모임참석',
        to: '본당교회협조-구역반장교육및모임참석',
        desc: '구역반장 교육 및 모임 참석',
    },
    {
        from: '소공동체활동-직장공동체활동',
        to: '본당교회협조-직장공동체활동',
        desc: '직장 공동체 활동',
    },
];

const NEW_GROUP = '본당교회협조';

async function tableExists(client, name) {
    const r = await client.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1) AS ex`,
        [name]
    );
    return !!r.rows[0].ex;
}

async function columnExists(client, table, column) {
    const r = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [table, column]
    );
    return r.rows.length > 0;
}

async function renameCategory(client, from, to, desc) {
    const existingTo = await client.query(
        `SELECT id FROM activity_categories WHERE category_name = $1`,
        [to]
    );
    const existingFrom = await client.query(
        `SELECT id FROM activity_categories WHERE category_name = $1`,
        [from]
    );

    if (existingFrom.rows.length === 0 && existingTo.rows.length > 0) {
        await client.query(
            `UPDATE activity_categories
             SET category_group = $1, description = COALESCE(description, $2)
             WHERE category_name = $3`,
            [NEW_GROUP, desc, to]
        );
        console.log(`[categories] 이미 이동됨(확인): ${to}`);
        return existingTo.rows[0].id;
    }

    if (existingFrom.rows.length === 0 && existingTo.rows.length === 0) {
        const ins = await client.query(
            `INSERT INTO activity_categories (category_name, category_group, description)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [to, NEW_GROUP, desc]
        );
        console.log(`[categories] 신규 추가: ${to}`);
        return ins.rows[0].id;
    }

    if (existingTo.rows.length > 0 && existingFrom.rows.length > 0) {
        // 대상이 이미 있으면 활동기록을 병합 후 원본 삭제
        const fromId = existingFrom.rows[0].id;
        const toId = existingTo.rows[0].id;
        if (await tableExists(client, 'activity_records')) {
            const merged = await client.query(
                `UPDATE activity_records SET category_id = $1 WHERE category_id = $2`,
                [toId, fromId]
            );
            console.log(`[activity_records] 병합 ${from} → ${to}: ${merged.rowCount}건`);
        }
        await client.query(`DELETE FROM activity_field_mapping WHERE category_name = $1`, [from]).catch(() => {});
        await client.query(`DELETE FROM activity_categories WHERE id = $1`, [fromId]);
        await client.query(
            `UPDATE activity_categories SET category_group = $1, description = COALESCE(description, $2) WHERE id = $3`,
            [NEW_GROUP, desc, toId]
        );
        console.log(`[categories] 중복 병합 후 삭제: ${from} → ${to}`);
        return toId;
    }

    const upd = await client.query(
        `UPDATE activity_categories
         SET category_name = $1, category_group = $2, description = COALESCE(description, $3)
         WHERE category_name = $4
         RETURNING id`,
        [to, NEW_GROUP, desc, from]
    );
    console.log(`[categories] 이동: ${from} → ${to} (${upd.rowCount}건)`);
    return upd.rows[0].id;
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const mapExists = await tableExists(client, 'activity_field_mapping');

        for (const item of MOVES) {
            await renameCategory(client, item.from, item.to, item.desc);

            if (mapExists) {
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
                console.log(`[field_mapping] 확인: ${item.to}`);
            }

            // member 테이블에 동명 컬럼이 있으면 이름 변경
            if (await columnExists(client, 'member', item.from)) {
                if (!(await columnExists(client, 'member', item.to))) {
                    await client.query(`ALTER TABLE member RENAME COLUMN "${item.from}" TO "${item.to}"`);
                    console.log(`[member] 컬럼 변경: "${item.from}" → "${item.to}"`);
                } else {
                    console.log(`[member] 대상 컬럼 이미 존재, 건너뜀: "${item.to}"`);
                }
            }

            // 활동배당 텍스트에 옛 종목명이 있으면 교체
            if (await tableExists(client, 'activity_assignments')) {
                const a = await client.query(
                    `UPDATE activity_assignments SET "활동배당" = $1 WHERE "활동배당" = $2`,
                    [item.to, item.from]
                );
                if (a.rowCount > 0) {
                    console.log(`[activity_assignments] 배당명 변경: ${item.from} → ${item.to} (${a.rowCount}건)`);
                }
            }
        }

        // 남은 소공동체활동 그룹이 있으면 본당교회협조로 보정
        const leftovers = await client.query(
            `UPDATE activity_categories
             SET category_group = $1,
                 category_name = CASE
                     WHEN category_name LIKE '소공동체활동-%'
                     THEN '본당교회협조-' || substring(category_name from length('소공동체활동-') + 1)
                     ELSE category_name
                 END
             WHERE category_group = '소공동체활동' OR category_name LIKE '소공동체활동-%'
             RETURNING category_name, category_group`,
            [NEW_GROUP]
        );
        if (leftovers.rowCount > 0) {
            console.log(`[categories] 잔여 소공동체활동 보정: ${leftovers.rowCount}건`);
            leftovers.rows.forEach((r) => console.log('   -', r.category_name));
        }

        await client.query('COMMIT');
        console.log('\n✅ 소공동체활동 → 본당교회협조 이동 완료.');

        const cats = await client.query(
            `SELECT category_name, category_group
             FROM activity_categories
             WHERE category_name LIKE '본당교회협조-%'
                OR category_name LIKE '소공동체활동-%'
                OR category_group IN ('본당교회협조', '소공동체활동')
             ORDER BY category_group, id`
        );
        console.log('\n현재 관련 카테고리:');
        cats.rows.forEach((r) => console.log(` - [${r.category_group}] ${r.category_name}`));
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 오류, 롤백:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
