// 2025-01-01 ~ 2025-12-31: Pr별 매주 3명에게 활동 1건씩 임의 배당 → activity_assignments 저장
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: +(process.env.DB_PORT || 5432)
});

const ACTIVITIES = [
    '기도생활-묵주기도', '기도생활-평일미사', '기도생활-성경읽기',
    '복음선교-외인 입교권면', '복음선교-방문선교', '복음선교-가두선교',
    '교우돌봄-교우 가정방문', '교우돌봄-냉담 교우 방문', '교우돌봄-전입교우돌봄(방문)',
    '어려운자돌봄-교우 환자 방문 및 돌봄', '어려운자돌봄-병원봉사', '어려운자돌봄-복지시설방문',
    '레지오활동-결석단원돌봄', '레지오활동-교본공부', '레지오활동-평의회업무협조',
    '본당교회협조-행사 준비 및 협조', '본당교회협조-전례협조', '본당교회협조-회원모집',
    '특별활동-재해피해자돌봄', '특별활동-병원방문',
    '기타활동-청소 미화', '기타활동-접촉활동'
];

const TARGETS = ['교우 가정', '신영세자', '냉담 교우', '환자', '예비신자', '외인', '본당 행사', '소공동체'];

function randPick(arr, n) {
    const copy = [...arr];
    const picked = [];
    while (picked.length < n && copy.length > 0) {
        const i = Math.floor(Math.random() * copy.length);
        picked.push(copy.splice(i, 1)[0]);
    }
    return picked;
}

function getWeekStarts(year) {
    const weeks = [];
    const d = new Date(`${year}-01-01T12:00:00`);
    const end = new Date(`${year}-12-31T12:00:00`);
    while (d <= end) {
        weeks.push(new Date(d));
        d.setDate(d.getDate() + 7);
    }
    return weeks;
}

function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const deleted = await client.query(
            `DELETE FROM activity_assignments
             WHERE created_at >= '2025-01-01' AND created_at < '2026-01-01'`
        );
        console.log(`기존 2025년 배당 ${deleted.rowCount}건 삭제`);

        const groups = await client.query(`
            SELECT church_name, pr_name,
                   array_agg(id ORDER BY name) AS member_ids,
                   array_agg(name ORDER BY name) AS member_names
            FROM member
            WHERE church_name IS NOT NULL AND pr_name IS NOT NULL
              AND TRIM(church_name) <> '' AND TRIM(pr_name) <> ''
            GROUP BY church_name, pr_name
            ORDER BY church_name, pr_name
        `);

        const weeks = getWeekStarts(2025);
        let inserted = 0;

        for (const group of groups.rows) {
            const memberIds = group.member_ids;
            if (!memberIds.length) continue;

            const assignerRes = await client.query(
                `SELECT id FROM member
                 WHERE church_name = $1 AND pr_name = $2 AND name ~ '^G1'
                 ORDER BY id LIMIT 1`,
                [group.church_name, group.pr_name]
            );
            const assignerId = assignerRes.rows[0]?.id || memberIds[0];

            for (const weekDate of weeks) {
                const pickCount = Math.min(3, memberIds.length);
                const selectedIds = randPick(memberIds, pickCount);
                const activity = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
                const weekStr = formatDate(weekDate);

                for (const memberId of selectedIds) {
                    const target = TARGETS[Math.floor(Math.random() * TARGETS.length)];
                    await client.query(
                        `INSERT INTO activity_assignments
                            (member_id, assigner_id, "활동배당", "활동대상자", church_name, pr_name, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7::date, $7::date)`,
                        [memberId, assignerId, activity, target, group.church_name, group.pr_name, weekStr]
                    );
                    inserted++;
                }
            }
        }

        await client.query('COMMIT');

        const summary = await pool.query(`
            SELECT church_name, pr_name, COUNT(*)::int AS cnt
            FROM activity_assignments
            WHERE created_at >= '2025-01-01' AND created_at < '2026-01-01'
            GROUP BY church_name, pr_name
            ORDER BY church_name, pr_name
        `);
        console.log(`\n✅ 2025년 활동배당 ${inserted}건 저장 완료`);
        console.log(`   Pr 수: ${groups.rows.length}, 주 수: ${weeks.length}`);
        console.log('\n=== Pr별 저장 건수 ===');
        summary.rows.forEach(r => console.log(` ${r.church_name} | ${r.pr_name} | ${r.cnt}건`));
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('오류:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
