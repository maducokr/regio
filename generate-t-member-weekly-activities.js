// T로 시작하는 테스트 회원에게 2025년 52주(월~토) 활동 기록 생성
// - 1월 첫째 주 월요일(2025-01-06)부터 52주
// - 회원·주마다 활동종목 5개 랜덤, 횟수 1~10
// - T회원 삭제 시 activity_records도 member_id로 함께 삭제됨 (server.js DELETE /api/test-members)
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const WEEKS = 52;
const CATEGORIES_PER_WEEK = 5;
const MAX_COUNT = 10;
// 2025년 1월 첫째 주 월요일
const FIRST_WEEK_MONDAY = new Date(2025, 0, 6);

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function pickRandomCategories(allIds, count) {
    const shuffled = [...allIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
    const client = await pool.connect();
    const BATCH_SIZE = 500;

    try {
        const membersResult = await client.query(
            "SELECT id, name FROM member WHERE name LIKE 'T%' ORDER BY id"
        );
        const categoriesResult = await client.query(
            'SELECT id, category_name FROM activity_categories ORDER BY id'
        );

        const members = membersResult.rows;
        const categoryIds = categoriesResult.rows.map(r => r.id);

        if (members.length === 0) {
            console.log('T로 시작하는 테스트 회원이 없습니다.');
            return;
        }
        if (categoryIds.length < CATEGORIES_PER_WEEK) {
            throw new Error(`활동종목이 ${CATEGORIES_PER_WEEK}개 미만입니다.`);
        }

        console.log(`대상 회원: ${members.length}명, 활동종목: ${categoryIds.length}개`);
        console.log(`기간: ${formatDate(FIRST_WEEK_MONDAY)}(1주 월) ~ 52주, 주당 ${CATEGORIES_PER_WEEK}세목`);

        await client.query('BEGIN');

        const delResult = await client.query(
            `DELETE FROM activity_records
             WHERE member_id IN (SELECT id FROM member WHERE name LIKE 'T%')`
        );
        console.log(`기존 T회원 활동기록 삭제: ${delResult.rowCount}건`);

        const rows = [];
        for (const member of members) {
            for (let week = 0; week < WEEKS; week++) {
                const weekMonday = addDays(FIRST_WEEK_MONDAY, week * 7);
                const picked = pickRandomCategories(categoryIds, CATEGORIES_PER_WEEK);
                for (const categoryId of picked) {
                    const dayOffset = randomInt(0, 5);
                    const activityDate = formatDate(addDays(weekMonday, dayOffset));
                    const count = randomInt(1, MAX_COUNT);
                    rows.push([member.id, categoryId, count, activityDate]);
                }
            }
        }

        console.log(`삽입 예정: ${rows.length}건 (${members.length}명 × ${WEEKS}주 × ${CATEGORIES_PER_WEEK}세목)`);

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            const values = [];
            const params = [];
            let paramIndex = 1;
            for (const [memberId, categoryId, count, activityDate] of batch) {
                values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
                params.push(memberId, categoryId, count, activityDate);
            }
            await client.query(
                `INSERT INTO activity_records (member_id, category_id, count, activity_date)
                 VALUES ${values.join(', ')}`,
                params
            );
            process.stdout.write(`\r삽입 진행: ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}`);
        }
        console.log('');

        await client.query('COMMIT');

        const verify = await client.query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(DISTINCT ar.member_id)::int AS members,
                    MIN(ar.activity_date)::text AS min_date,
                    MAX(ar.activity_date)::text AS max_date
             FROM activity_records ar
             JOIN member m ON ar.member_id = m.id
             WHERE m.name LIKE 'T%'`
        );
        const v = verify.rows[0];
        console.log('\n✅ T회원 주간 활동 데이터 생성 완료');
        console.log(`   총 ${v.total}건, 회원 ${v.members}명, 기간 ${v.min_date} ~ ${v.max_date}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 오류, 롤백:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) main();
