// 입교 권면 5종목을 복음선교 대응 종목으로 병합·이동
// - 입교 권면-외인 권면 → 복음선교-외인 입교권면
// - 입교 권면-개종 권면 → 복음선교-개종권면
// - 입교 권면-교리 중단자 재권면 → 복음선교-교리 중단자 권면
// - 입교 권면-가두 선교 → 복음선교-가두선교
// - 입교 권면-방문 선교 → 복음선교-방문선교
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
    { from: '입교 권면-외인 권면', to: '복음선교-외인 입교권면', desc: '외인 입교 권면 활동' },
    { from: '입교 권면-개종 권면', to: '복음선교-개종권면', desc: '개종 권면 활동' },
    { from: '입교 권면-교리 중단자 재권면', to: '복음선교-교리 중단자 권면', desc: '교리 중단자 권면 활동' },
    { from: '입교 권면-가두 선교', to: '복음선교-가두선교', desc: '가두 선교 활동' },
    { from: '입교 권면-방문 선교', to: '복음선교-방문선교', desc: '방문 선교 활동' },
];

async function tableExists(client, name) {
    const r = await client.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1) AS ex`,
        [name]
    );
    return !!r.rows[0].ex;
}

async function mergeCategory(client, from, to, desc) {
    const fromRow = await client.query(
        `SELECT id FROM activity_categories WHERE category_name = $1`,
        [from]
    );
    let toRow = await client.query(
        `SELECT id FROM activity_categories WHERE category_name = $1`,
        [to]
    );

    if (!toRow.rows.length) {
        const ins = await client.query(
            `INSERT INTO activity_categories (category_name, category_group, description)
             VALUES ($1, '복음선교', $2)
             RETURNING id`,
            [to, desc]
        );
        toRow = ins;
        console.log(`[categories] 신규: ${to}`);
    } else {
        await client.query(
            `UPDATE activity_categories
             SET category_group = '복음선교', description = COALESCE(description, $1)
             WHERE category_name = $2`,
            [desc, to]
        );
    }

    const toId = toRow.rows[0].id;

    if (!fromRow.rows.length) {
        console.log(`[categories] 원본 없음(이미 이동): ${from}`);
        return;
    }

    const fromId = fromRow.rows[0].id;
    if (fromId === toId) return;

    if (await tableExists(client, 'activity_records')) {
        const merged = await client.query(
            `UPDATE activity_records SET category_id = $1 WHERE category_id = $2`,
            [toId, fromId]
        );
        console.log(`[activity_records] ${from} → ${to}: ${merged.rowCount}건`);
    }

    if (await tableExists(client, 'activity_field_mapping')) {
        await client.query(`DELETE FROM activity_field_mapping WHERE category_name = $1`, [from]);
        await client.query(
            `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
             VALUES ($1, '횟수', '횟수(회,단,시간)', true)
             ON CONFLICT (category_name, field_name) DO NOTHING`,
            [to]
        );
        await client.query(
            `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
             VALUES ($1, '교리반인도', '교리반인도', false)
             ON CONFLICT (category_name, field_name) DO NOTHING`,
            [to]
        );
    }

    if (await tableExists(client, 'activity_assignments')) {
        await client.query(
            `UPDATE activity_assignments SET "활동배당" = $1 WHERE "활동배당" = $2`,
            [to, from]
        ).catch(() => {});
    }

    await client.query(`DELETE FROM activity_categories WHERE id = $1`, [fromId]);
    console.log(`[categories] 삭제: ${from}`);
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const item of MOVES) {
            await mergeCategory(client, item.from, item.to, item.desc);
        }
        await client.query('COMMIT');
        console.log('\n✅ 입교 권면 → 복음선교 병합 완료');

        const left = await client.query(
            `SELECT category_name FROM activity_categories
             WHERE category_name LIKE '입교 권면-%' OR category_group = '입교 권면'
             ORDER BY category_name`
        );
        console.log('\n남은 입교 권면:', left.rows.map((r) => r.category_name));
        const gospel = await client.query(
            `SELECT category_name FROM activity_categories
             WHERE category_name = ANY($1::text[])
             ORDER BY category_name`,
            [MOVES.map((m) => m.to)]
        );
        console.log('대상 복음선교:', gospel.rows.map((r) => r.category_name));
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
