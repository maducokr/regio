/**
 * 2025년 피정및연수 배정 (교육 배정과 동일 형식)
 * - 구분: 실시 / 제목: 피정
 * - 주관: 본당(성당명)
 * - 일자·장소: 꾸리아별 선정(서로 다름)
 * - 내용: 피정
 * - 참석: 각 Pr 인원
 * - 각 꾸리아 소속 Pr마다 1건
 */
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

const CATEGORY_NAME = '메모및 행사-피정및연수';
const TITLE = '피정';
const CONTENT = '피정';

const PLACES = [
    '수련원', '피정의집', '수도원', '성지', '교육관',
    '야외예배처', '피정센터', '수녀원', '피정관'
];

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    max: 2,
    application_name: 'regio-retreat-assign'
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

/** 피정에 적합한 2025년 토요일 후보 */
function saturdayPool2025() {
    const dates = [];
    const start = new Date(2025, 0, 1);
    const end = new Date(2025, 11, 31);
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
        const d = new Date(t);
        if (d.getDay() === 6) dates.push(formatDate(d));
    }
    return dates;
}

function buildNote(churchName, eventDate, place, attendeeCount) {
    return [
        `본당: ${churchName}`,
        [
            '1.',
            '구분:실시',
            `제목:${TITLE}`,
            `주관:${churchName}`,
            `일자:${eventDate}`,
            `장소:${place}`,
            `내용:${CONTENT}`,
            `참석:${attendeeCount}`
        ].join(' / ')
    ].join('\n');
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const cat = await client.query(
            `SELECT id FROM activity_categories WHERE category_name = $1`,
            [CATEGORY_NAME]
        );
        if (!cat.rows.length) {
            throw new Error(`카테고리 없음: ${CATEGORY_NAME}`);
        }
        const categoryId = cat.rows[0].id;

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

        const deleted = await client.query(
            `DELETE FROM activity_records ar
             USING activity_categories ac
             WHERE ar.category_id = ac.id
               AND ac.category_name = $1
               AND ar.activity_date BETWEEN '2025-01-01'::date AND '2025-12-31'::date
               AND (
                    ar.note ILIKE '%제목:피정%'
                 OR ar.note ILIKE '%내용:피정%'
               )`,
            [CATEGORY_NAME]
        );
        console.log(`기존 피정및연수(피정) 기록 삭제: ${deleted.rowCount}건`);

        const curiaNames = [...new Set(groups.rows.map((g) => String(g.curia_name).trim()))];
        const datePool = shuffle(saturdayPool2025());
        const placePool = shuffle(PLACES);

        if (curiaNames.length > datePool.length) {
            throw new Error('꾸리아 수에 비해 일자 후보가 부족합니다.');
        }

        const curiaDate = new Map();
        const curiaPlace = new Map();
        curiaNames.forEach((name, idx) => {
            curiaDate.set(name, datePool[idx]);
            curiaPlace.set(name, placePool[idx % placePool.length]);
        });

        console.log('\n꾸리아별 피정 일자·장소:');
        for (const curia of curiaNames) {
            console.log(`  ${curia} → ${curiaDate.get(curia)} @ ${curiaPlace.get(curia)}`);
        }
        console.log('');

        let inserted = 0;
        let attendeeSum = 0;

        for (const g of groups.rows) {
            const churchName = String(g.church_name).trim();
            const curiaName = String(g.curia_name).trim();
            const prName = String(g.pr_name).trim();
            const count = Number(g.member_count) || 0;
            const memberId = g.member_ids[0];
            const eventDate = curiaDate.get(curiaName);
            const place = curiaPlace.get(curiaName);
            if (!memberId || count < 1 || !eventDate || !place) continue;

            const note = buildNote(churchName, eventDate, place, count);
            await client.query(
                `INSERT INTO activity_records
                    (member_id, category_id, count, note, activity_date, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5::date, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [memberId, categoryId, count, note, eventDate]
            );

            inserted += 1;
            attendeeSum += count;
            console.log(
                `✅ ${churchName} / ${curiaName} / ${prName} → ${eventDate} @ ${place}, 참석 ${count}`
            );
        }

        await client.query('COMMIT');
        console.log('\n========== 배정 완료 ==========');
        console.log(`카테고리: ${CATEGORY_NAME}`);
        console.log(`구분: 실시 | 제목: ${TITLE} | 주관: 본당 | 내용: ${CONTENT}`);
        console.log(`꾸리아 수: ${curiaNames.length} (일자·장소 꾸리아별 상이)`);
        console.log(`배정 Pr 수: ${inserted}`);
        console.log(`참석 합계: ${attendeeSum}`);
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
