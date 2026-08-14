/**
 * member.gender / member.pr_type 컬럼 추가
 * - 신규가입: 등록 API가 gender(남/여), pr_type(성인/직속/청년/소년) 저장
 * - 샘플 회원(id 3~138): 성별·PR분류 일괄 부여
 *
 * 사용: node apply-gender-pr-type.js
 * (컬럼 추가가 필요하면 DB_ADMIN_USER=postgres 로 실행)
 */
const { Pool } = require('pg');

try {
    require('dotenv').config();
} catch (_) {
    /* optional */
}

const PR_TYPES = ['성인', '직속', '청년', '소년'];

function createPool(asAdmin) {
    const user = asAdmin
        ? (process.env.DB_ADMIN_USER || 'postgres')
        : (process.env.DB_USER || 'postgres');
    const password = asAdmin
        ? (process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || '5854')
        : (process.env.DB_PASSWORD || '5854');
    return new Pool({
        user,
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'regio',
        password,
        port: parseInt(process.env.DB_PORT || '5432', 10),
        max: 1,
        application_name: 'regio-apply-gender-pr-type'
    });
}

async function ensureColumns(client) {
    await client.query(`ALTER TABLE member ADD COLUMN IF NOT EXISTS gender VARCHAR(10)`);
    await client.query(`ALTER TABLE member ADD COLUMN IF NOT EXISTS pr_type VARCHAR(20)`);
}

function assignGenderById(id) {
    // 3~138 샘플: 짝수 여 / 홀수 남 (약 1:1)
    return Number(id) % 2 === 0 ? '여' : '남';
}

async function main() {
    let pool = createPool(true);
    let client;
    try {
        client = await pool.connect();
        await ensureColumns(client);
        console.log('✅ gender / pr_type 컬럼 추가·확인 완료 (admin)');
    } catch (err) {
        if (client) client.release();
        await pool.end();
        console.warn('⚠️ admin 컬럼 추가 실패, 앱 계정으로 재시도:', err.message);
        pool = createPool(false);
        client = await pool.connect();
        await ensureColumns(client);
        console.log('✅ gender / pr_type 컬럼 추가·확인 완료 (app)');
    }

    try {
        const members = await client.query(
            `SELECT id, name, pr_name, gender, pr_type
             FROM member
             WHERE id BETWEEN 3 AND 138
             ORDER BY id`
        );

        if (members.rows.length === 0) {
            console.log('대상 회원(3~138)이 없습니다.');
            return;
        }

        // PR 이름별 분류: 등장 순서대로 성인→직속→청년→소년 순환 배정
        const prNames = [];
        const seen = new Set();
        for (const row of members.rows) {
            const pr = String(row.pr_name || '').trim() || '(미지정)';
            if (!seen.has(pr)) {
                seen.add(pr);
                prNames.push(pr);
            }
        }
        const prTypeByName = new Map();
        prNames.forEach((pr, index) => {
            prTypeByName.set(pr, PR_TYPES[index % PR_TYPES.length]);
        });

        let genderUpdated = 0;
        let prTypeUpdated = 0;
        for (const row of members.rows) {
            const gender = assignGenderById(row.id);
            const prKey = String(row.pr_name || '').trim() || '(미지정)';
            const prType = prTypeByName.get(prKey) || '성인';

            const result = await client.query(
                `UPDATE member
                 SET gender = $1, pr_type = $2
                 WHERE id = $3
                 RETURNING id`,
                [gender, prType, row.id]
            );
            if (result.rowCount > 0) {
                if (row.gender !== gender) genderUpdated += 1;
                if (row.pr_type !== prType) prTypeUpdated += 1;
            }
        }

        console.log(`✅ 회원 ${members.rows.length}명 처리 완료`);
        console.log(`   gender 변경: ${genderUpdated}명, pr_type 변경: ${prTypeUpdated}명`);

        const genderStats = await client.query(
            `SELECT gender, COUNT(*)::int AS cnt
             FROM member
             WHERE id BETWEEN 3 AND 138
             GROUP BY gender
             ORDER BY gender`
        );
        console.log('성별 분포:');
        console.table(genderStats.rows);

        const prTypeStats = await client.query(
            `SELECT pr_type, COUNT(*)::int AS cnt, COUNT(DISTINCT pr_name)::int AS pr_cnt
             FROM member
             WHERE id BETWEEN 3 AND 138
             GROUP BY pr_type
             ORDER BY CASE pr_type
                WHEN '성인' THEN 1 WHEN '직속' THEN 2 WHEN '청년' THEN 3 WHEN '소년' THEN 4
                ELSE 9 END`
        );
        console.log('PR 분류 분포:');
        console.table(prTypeStats.rows);

        const prMap = await client.query(
            `SELECT pr_name, pr_type, COUNT(*)::int AS cnt
             FROM member
             WHERE id BETWEEN 3 AND 138
             GROUP BY pr_name, pr_type
             ORDER BY pr_type, pr_name`
        );
        console.log('PR별 분류:');
        console.table(prMap.rows);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
