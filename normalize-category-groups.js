// activity_categories.category_group 영문 그룹명을 한글로 정규화하는 스크립트
// (예전 영문판 스키마로 들어간 'Gospel Mission' 등을 '복음선교'로 통일)
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const GROUP_MAP = {
    'Prayer Life': '기도생활',
    'With the Earth': '지구와함께',
    'Gospel Mission': '복음선교',
    'Member Care': '교우돌봄',
    'Care for the Needy': '어려운자돌봄',
    'Legion Activities': '레지오활동',
    'Parish Cooperation': '본당교회협조',
    'Others': '기타',
};

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (const [eng, kor] of Object.entries(GROUP_MAP)) {
            const r = await client.query(
                `UPDATE activity_categories SET category_group = $1 WHERE category_group = $2`,
                [kor, eng]
            );
            if (r.rowCount > 0) console.log(`[group] '${eng}' → '${kor}': ${r.rowCount}건`);
        }

        // 종목명(category_name)의 접두사로 그룹을 보정 (혹시 누락/불일치 대비)
        const fixByPrefix = await client.query(`
            UPDATE activity_categories
            SET category_group = split_part(category_name, '-', 1)
            WHERE category_name LIKE '%-%'
              AND category_group <> split_part(category_name, '-', 1)
            RETURNING category_name, category_group
        `);
        if (fixByPrefix.rowCount > 0) {
            console.log(`[group] 접두사 기준 보정: ${fixByPrefix.rowCount}건`);
            fixByPrefix.rows.forEach(r => console.log('   -', r.category_name, '→', r.category_group));
        }

        await client.query('COMMIT');
        console.log('\n✅ category_group 정규화 완료.');

        const groups = await client.query(
            `SELECT category_group, COUNT(*) AS cnt FROM activity_categories GROUP BY category_group ORDER BY category_group`
        );
        console.log('\n현재 그룹 분포:');
        groups.rows.forEach(r => console.log(' -', r.category_group, ':', r.cnt));
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
