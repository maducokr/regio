/**
 * 2025년 9~10월 단장 회의(기타행사) 배정
 * - 구분: 실시 / 제목: 단장 회의
 * - 주관: 꾸리아명
 * - 일자: 2025-09-01 ~ 2025-10-31, 꾸리아별로 서로 다른 날짜
 * - 장소: 교육관
 * - 참석: 해당 꾸리아 소속 Pr 수
 * - 각 꾸리아 소속 Pr마다 1건
 */
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

const CATEGORY_NAME = '메모및 행사-기타행사';
const FALLBACK_CATEGORY = '메모및 행사-단체행사';
const TITLE = '단장 회의';
const PLACE = '교육관';

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    max: 2,
    application_name: 'regio-president-meeting-assign'
});

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** 2025-09-01 ~ 2025-10-31 */
function sepOctDates() {
    const dates = [];
    const start = new Date(2025, 8, 1);
    const end = new Date(2025, 9, 31);
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
        dates.push(formatDate(new Date(t)));
    }
    return dates;
}

function buildNote(curiaName, eventDate, attendeeCount) {
    return [
        `꾸리아: ${curiaName}`,
        [
            '1.',
            '구분:실시',
            `제목:${TITLE}`,
            `주관:${curiaName}`,
            `일자:${eventDate}`,
            `장소:${PLACE}`,
            `참석:${attendeeCount}`
        ].join(' / ')
    ].join('\n');
}

async function ensureCategory(client) {
    let cat = await client.query(
        `SELECT id FROM activity_categories WHERE category_name = $1`,
        [CATEGORY_NAME]
    );
    if (cat.rows.length) return { id: cat.rows[0].id, name: CATEGORY_NAME };

    cat = await client.query(
        `SELECT id FROM activity_categories WHERE category_name = $1`,
        [FALLBACK_CATEGORY]
    );
    if (!cat.rows.length) {
        throw new Error(`카테고리 없음: ${CATEGORY_NAME} / ${FALLBACK_CATEGORY}`);
    }
    console.log(`⚠ ${CATEGORY_NAME} 없음 → ${FALLBACK_CATEGORY} 사용`);
    return { id: cat.rows[0].id, name: FALLBACK_CATEGORY };
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id: categoryId, name: categoryName } = await ensureCategory(client);

        const groups = await client.query(`
            SELECT
                church_name,
                curia_name,
                pr_name,
                COUNT(*)::int AS member_count,
                array_agg(id ORDER BY
                    CASE
                        WHEN position ILIKE '%단장%' AND position NOT ILIKE '%부단장%' THEN 1
                        WHEN name ~* '^[TG]1' THEN 2
                        ELSE 9
                    END,
                    id
                ) AS member_ids
            FROM member
            WHERE NULLIF(TRIM(curia_name), '') IS NOT NULL
              AND NULLIF(TRIM(pr_name), '') IS NOT NULL
              AND NULLIF(TRIM(church_name), '') IS NOT NULL
            GROUP BY church_name, curia_name, pr_name
            ORDER BY church_name, curia_name, pr_name
        `);

        if (!groups.rows.length) {
            throw new Error('꾸리아·Pr 소속 회원이 없습니다.');
        }

        // 꾸리아별 Pr 수
        const prCountByCuria = new Map();
        for (const g of groups.rows) {
            const curia = String(g.curia_name).trim();
            prCountByCuria.set(curia, (prCountByCuria.get(curia) || 0) + 1);
        }

        const deleted = await client.query(
            `DELETE FROM activity_records ar
             USING activity_categories ac
             WHERE ar.category_id = ac.id
               AND ar.activity_date BETWEEN '2025-09-01'::date AND '2025-10-31'::date
               AND (
                    ar.note ILIKE '%제목:단장 회의%'
                 OR ar.note ILIKE '%제목:단장회의%'
                 OR ar.note ILIKE '%제목:단장간담회%'
                 OR ar.note ILIKE '%제목:단장 간담회%'
               )`
        );
        console.log(`기존 단장 회의(9~10월) 기록 삭제: ${deleted.rowCount}건`);

        const curiaNames = [...prCountByCuria.keys()];
        const datePool = shuffle(sepOctDates());
        if (curiaNames.length > datePool.length) {
            throw new Error('꾸리아 수가 9~10월 일자보다 많습니다.');
        }

        const curiaDate = new Map();
        curiaNames.forEach((name, idx) => {
            curiaDate.set(name, datePool[idx]);
        });

        console.log(`카테고리: ${categoryName}`);
        console.log('\n꾸리아별 일자·Pr수(참석):');
        for (const curia of curiaNames) {
            console.log(
                `  ${curia} → ${curiaDate.get(curia)}, 참석 ${prCountByCuria.get(curia)} (Pr수)`
            );
        }
        console.log('');

        let inserted = 0;
        let attendeeSum = 0;

        for (const g of groups.rows) {
            const curiaName = String(g.curia_name).trim();
            const prName = String(g.pr_name).trim();
            const memberId = g.member_ids[0];
            const eventDate = curiaDate.get(curiaName);
            const attendees = prCountByCuria.get(curiaName) || 0;
            if (!memberId || !eventDate || attendees < 1) continue;

            const note = buildNote(curiaName, eventDate, attendees);
            await client.query(
                `INSERT INTO activity_records
                    (member_id, category_id, count, note, activity_date, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5::date, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [memberId, categoryId, attendees, note, eventDate]
            );

            inserted += 1;
            attendeeSum += attendees;
            console.log(
                `✅ ${g.church_name} / ${curiaName} / ${prName} → ${eventDate} @ ${PLACE}, 참석 ${attendees}`
            );
        }

        await client.query('COMMIT');
        console.log('\n========== 배정 완료 ==========');
        console.log(`구분: 실시 | 제목: ${TITLE} | 주관: 꾸리아 | 장소: ${PLACE}`);
        console.log(`꾸리아 수: ${curiaNames.length} (날짜 모두 상이)`);
        console.log(`배정 Pr 수: ${inserted}`);
        console.log(`참석 기록 합계(각 건의 Pr수 합): ${attendeeSum}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 배정 실패, 롤백:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
