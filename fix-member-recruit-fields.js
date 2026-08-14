/**
 * 행동단원 모집 / 협조단원 모집. 돌봄:
 * 입단 오른쪽에 횟수(회,단,시간,명) 추가
 * (activity_field_mapping: category_name 기준)
 */
const { Pool } = require('pg');

try {
    require('dotenv').config();
} catch (_) {
    /* optional */
}

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    max: 1,
    application_name: 'regio-fix-member-recruit-fields'
});

const TARGETS = [
    '레지오활동-행동단원 모집',
    '레지오활동-협조단원 모집. 돌봄'
];

async function upsert(client, categoryName, fieldName, displayName, required) {
    const existing = await client.query(
        `SELECT id FROM activity_field_mapping
         WHERE category_name = $1 AND field_name = $2`,
        [categoryName, fieldName]
    );
    if (existing.rows.length) {
        await client.query(
            `UPDATE activity_field_mapping
             SET field_display_name = $3, is_required = $4
             WHERE category_name = $1 AND field_name = $2`,
            [categoryName, fieldName, displayName, required]
        );
        console.log(`updated: ${categoryName} / ${fieldName}`);
    } else {
        await client.query(
            `INSERT INTO activity_field_mapping
             (category_name, field_name, field_display_name, is_required)
             VALUES ($1, $2, $3, $4)`,
            [categoryName, fieldName, displayName, required]
        );
        console.log(`inserted: ${categoryName} / ${fieldName}`);
    }
}

async function main() {
    const client = await pool.connect();
    try {
        for (const categoryName of TARGETS) {
            // 입력/저장 코드는 membership, count 영문 필드명 사용
            await upsert(client, categoryName, 'membership', '입단', true);
            await upsert(client, categoryName, 'count', '횟수(회,단,시간,명)', true);
            // 구 한글 필드명이 있으면 표시명만 정리
            await client.query(
                `UPDATE activity_field_mapping
                 SET field_display_name = '입단'
                 WHERE category_name = $1 AND field_name IN ('입단', 'membership')`,
                [categoryName]
            );
            await client.query(
                `UPDATE activity_field_mapping
                 SET field_display_name = '횟수(회,단,시간,명)'
                 WHERE category_name = $1 AND field_name IN ('횟수', 'count')`,
                [categoryName]
            );
        }

        const check = await client.query(
            `SELECT category_name, field_name, field_display_name, is_required
             FROM activity_field_mapping
             WHERE category_name = ANY($1::text[])
             ORDER BY category_name, field_name`,
            [TARGETS]
        );
        console.table(check.rows);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
