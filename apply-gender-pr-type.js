/**
 * member.gender / member.pr_type 컬럼 추가
 * - 신규가입: 등록 API가 gender(남/여), pr_type(성인/직속/청년/소년) 저장
 * - 샘플 회원(id 3~138): 성별·PR분류 일괄 부여
 *   · 은총의 모후(tt은총의모후 / 은총의모후) → 소년
 *   · 그 외 샘플 Pr → 성인
 *
 * 사용: node apply-gender-pr-type.js [--render]
 * (컬럼 추가가 필요하면 DB_ADMIN_USER=postgres 로 실행)
 */
const path = require('path');
const { Pool } = require('pg');

try {
    require('dotenv').config();
} catch (_) {
    /* optional */
}

const useRender = process.argv.includes('--render');
if (useRender) {
    require('dotenv').config({ path: path.join(__dirname, '.env.render'), override: true });
}

const SAMPLE_ID_MIN = 3;
const SAMPLE_ID_MAX = 138;

function isJuniorPr(prName) {
    const clean = String(prName || '').replace(/\s+/g, '').replace(/^tt/i, '');
    return clean === '은총의모후';
}

function resolvePrType(prName) {
    return isJuniorPr(prName) ? '소년' : '성인';
}

function createPool(asAdmin) {
    if (useRender && process.env.DATABASE_URL) {
        return new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 1,
            application_name: 'regio-apply-gender-pr-type'
        });
    }
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
            `SELECT id, name, church_name, pr_name, gender, pr_type
             FROM member
             ORDER BY id`
        );

        if (members.rows.length === 0) {
            console.log('대상 회원이 없습니다.');
            return;
        }

        console.log('Pr 구분: 은총의 모후 → 소년, 나머지 → 성인');

        let genderUpdated = 0;
        let prTypeUpdated = 0;
        for (const row of members.rows) {
            const gender = row.gender || assignGenderById(row.id);
            const prType = resolvePrType(row.pr_name);

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
             GROUP BY gender
             ORDER BY gender`
        );
        console.log('성별 분포:');
        console.table(genderStats.rows);

        const prTypeStats = await client.query(
            `SELECT pr_type, COUNT(*)::int AS cnt, COUNT(DISTINCT pr_name)::int AS pr_cnt
             FROM member
             GROUP BY pr_type
             ORDER BY CASE pr_type
                WHEN '성인' THEN 1 WHEN '직속' THEN 2 WHEN '청년' THEN 3 WHEN '소년' THEN 4
                ELSE 9 END`
        );
        console.log('PR 분류 분포:');
        console.table(prTypeStats.rows);

        const prMap = await client.query(
            `SELECT church_name, pr_name, pr_type, COUNT(*)::int AS cnt
             FROM member
             GROUP BY church_name, pr_name, pr_type
             ORDER BY pr_type, church_name, pr_name`
        );
        console.log('Pr별 분류:');
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
