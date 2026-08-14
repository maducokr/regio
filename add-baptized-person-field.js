/**
 * 교리반인도 / 타인이인도한예비신자 / 통신교리자 에
 * 세례자 () 명 (baptism) 필드 추가·표시명 통일
 *
 * node add-baptized-person-field.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10)
});

const DISPLAY = '세례자 () 명';
const FIELD = '세례';

const RENAME = {
    from: '예비자 돌봄-예비자 돌봄',
    to: '예비자 돌봄-타인이인도한예비신자',
    desc: '타인이 인도한 예비신자 돌봄 활동'
};

const ADD_TO = [
    '예비자 돌봄-교리반 인도',
    '예비자 돌봄-타인이인도한예비신자',
    '예비자 돌봄-통신교리자',
    '복음선교-교리반 인도',
    '복음선교-교리반인도예비자',
    '복음선교-통신교리자 돌봄',
    '복음선교-예비신자관리돌봄'
];

async function upsertBaptismField(client, categoryName) {
    const existing = await client.query(
        `SELECT id, field_name, field_display_name
         FROM activity_field_mapping
         WHERE category_name = $1
           AND field_name IN ('세례', 'baptism', '세례자')`,
        [categoryName]
    );
    if (existing.rows.length) {
        await client.query(
            `UPDATE activity_field_mapping
             SET field_name = $1, field_display_name = $2, is_required = false
             WHERE category_name = $3
               AND field_name IN ('세례', 'baptism', '세례자')`,
            [FIELD, DISPLAY, categoryName]
        );
        return 'updated';
    }
    await client.query(
        `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
         VALUES ($1, $2, $3, false)
         ON CONFLICT (category_name, field_name) DO UPDATE
           SET field_display_name = EXCLUDED.field_display_name,
               is_required = EXCLUDED.is_required`,
        [categoryName, FIELD, DISPLAY]
    );
    return 'inserted';
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 카테고리명 변경: 예비자 돌봄 → 타인이인도한예비신자
        const renamed = await client.query(
            `UPDATE activity_categories
             SET category_name = $1, description = COALESCE(description, $2)
             WHERE category_name = $3
             RETURNING id`,
            [RENAME.to, RENAME.desc, RENAME.from]
        );
        if (renamed.rowCount) {
            await client.query(
                `UPDATE activity_field_mapping
                 SET category_name = $1
                 WHERE category_name = $2`,
                [RENAME.to, RENAME.from]
            );
            console.log(`✅ 카테고리 변경: ${RENAME.from} → ${RENAME.to}`);
        } else {
            await client.query(
                `INSERT INTO activity_categories (category_name, category_group, description)
                 VALUES ($1, '예비자 돌봄', $2)
                 ON CONFLICT (category_name) DO NOTHING`,
                [RENAME.to, RENAME.desc]
            );
            console.log(`ℹ️ 카테고리 확인: ${RENAME.to}`);
        }

        for (const cat of ADD_TO) {
            const catOk = await client.query(
                `SELECT 1 FROM activity_categories WHERE category_name = $1`,
                [cat]
            );
            if (!catOk.rows.length) {
                console.log(`⏭️ 카테고리 없음, 생략: ${cat}`);
                continue;
            }
            const action = await upsertBaptismField(client, cat);
            console.log(`✅ ${cat}: 세례자 필드 ${action}`);
        }

        await client.query('COMMIT');
        console.log('\n완료.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
