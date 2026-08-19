/**
 * 예비자 돌봄 → 예비신자 돌봄 그룹/세목 정리
 * - 그룹: 예비자 돌봄 → 예비신자 돌봄
 * - 세목: 예비신자 돌봄, 통신교리자 돌봄, 교리반 봉사
 *
 * 사용: node rename-catechumen-care.js
 * Render: DATABASE_URL 이 있으면 해당 DB에 적용
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    })
    : new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'regio',
        password: process.env.DB_PASSWORD || '5854',
        port: parseInt(process.env.DB_PORT || '5432', 10)
    });

const NEW_GROUP = '예비신자 돌봄';
const RENAMES = [
    {
        from: '예비자 돌봄-타인이인도한예비신자',
        to: '예비신자 돌봄-예비신자 돌봄',
        desc: '예비신자 돌봄 활동'
    },
    {
        from: '예비자 돌봄-통신교리자',
        to: '예비신자 돌봄-통신교리자 돌봄',
        desc: '통신교리자 돌봄 활동'
    },
    {
        from: '예비자 돌봄-교리반 인도',
        to: '예비신자 돌봄-교리반 봉사',
        desc: '교리반 봉사 활동'
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
    if (await columnExists(client, from)) {
        if (!(await columnExists(client, to))) {
            await client.query(`ALTER TABLE member RENAME COLUMN "${from}" TO "${to}"`);
            console.log(`[member] 컬럼 이름변경: ${from} → ${to}`);
        } else {
            console.log(`[member] 대상 컬럼 이미 존재, 변경 생략: ${to}`);
        }
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
        // 둘 다 있으면 from 쪽 기록을 to 로 옮기고 from 삭제
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
             SET category_group = $1, description = COALESCE(NULLIF(description, ''), $2)
             WHERE id = $3`,
            [NEW_GROUP, desc, toId]
        );
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

    if (mapTableExists) {
        await client.query(
            `UPDATE activity_field_mapping SET category_name = $1 WHERE category_name = $2`,
            [to, from]
        );
        const hasCount = await client.query(
            `SELECT 1 FROM activity_field_mapping WHERE category_name = $1 AND field_name = '횟수'`,
            [to]
        );
        if (!hasCount.rows.length) {
            await client.query(
                `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
                 VALUES ($1, '횟수', '횟수(회,단,시간,명)', true)`,
                [to]
            );
        }
        const hasBaptism = await client.query(
            `SELECT 1 FROM activity_field_mapping WHERE category_name = $1 AND field_name = '세례'`,
            [to]
        );
        if (!hasBaptism.rows.length) {
            await client.query(
                `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
                 VALUES ($1, '세례', '세례자 () 명', false)`,
                [to]
            );
        }
        console.log(`[field_mapping] 확인: ${to}`);
    }
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const mapTableExists = (await client.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'activity_field_mapping'
             ) AS ex`
        )).rows[0].ex;

        for (const item of RENAMES) {
            await renameCategory(client, item.from, item.to, item.desc, mapTableExists);
        }

        // 남은 옛 그룹명 정리
        const leftover = await client.query(
            `UPDATE activity_categories
             SET category_group = $1
             WHERE category_group = '예비자 돌봄'
                OR category_name LIKE '예비자 돌봄-%'
             RETURNING category_name, category_group`,
            [NEW_GROUP]
        );
        leftover.rows.forEach((r) => {
            console.log(`[group] ${r.category_name} → ${r.category_group}`);
        });

        await client.query('COMMIT');
        console.log('\n✅ 예비신자 돌봄 명칭 정리 완료.');

        const cats = await client.query(
            `SELECT category_name, category_group
             FROM activity_categories
             WHERE category_group = $1 OR category_name LIKE '예비%돌봄%'
             ORDER BY id`,
            [NEW_GROUP]
        );
        console.log(`\n현재 ${NEW_GROUP} 관련 카테고리:`);
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
