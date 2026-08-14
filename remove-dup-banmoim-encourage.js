// 본당교회협조-반모임참석권유(중복) → 본당교회협조-반모임 참석권유 로 병합 후 삭제
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const KEEP = '본당교회협조-반모임 참석권유';
const DROP = '본당교회협조-반모임참석권유';

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const keep = await client.query(
            `SELECT id FROM activity_categories WHERE category_name = $1`,
            [KEEP]
        );
        const drop = await client.query(
            `SELECT id FROM activity_categories WHERE category_name = $1`,
            [DROP]
        );

        if (drop.rows.length === 0) {
            console.log(`삭제 대상 없음: ${DROP}`);
            await client.query('COMMIT');
            return;
        }

        let keepId = keep.rows[0]?.id;
        if (!keepId) {
            const ins = await client.query(
                `INSERT INTO activity_categories (category_name, category_group, description)
                 VALUES ($1, '본당교회협조', '반모임 참석 권유')
                 RETURNING id`,
                [KEEP]
            );
            keepId = ins.rows[0].id;
            console.log(`[categories] 유지 종목 신규 생성: ${KEEP}`);
        }

        const dropId = drop.rows[0].id;
        const merged = await client.query(
            `UPDATE activity_records SET category_id = $1 WHERE category_id = $2`,
            [keepId, dropId]
        );
        console.log(`[activity_records] 병합: ${merged.rowCount}건`);

        await client.query(
            `DELETE FROM activity_field_mapping WHERE category_name = $1`,
            [DROP]
        ).catch(() => {});

        await client.query(
            `UPDATE activity_assignments SET "활동배당" = $1 WHERE "활동배당" = $2`,
            [KEEP, DROP]
        ).catch(() => {});

        await client.query(`DELETE FROM activity_categories WHERE id = $1`, [dropId]);
        console.log(`[categories] 삭제: ${DROP}`);

        await client.query(
            `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
             VALUES ($1, '횟수', '횟수(회,단,시간)', true)
             ON CONFLICT (category_name, field_name) DO NOTHING`,
            [KEEP]
        ).catch(() => {});

        await client.query('COMMIT');
        console.log(`\n✅ 유지: ${KEEP}`);
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
