/**
 * 2025년 11월 위령미사(기타행사) 배정
 * - 구분: 실시 / 제목: 위령미사
 * - 주관: 본당(성당명)
 * - 일자: 2025년 11월 일요일, 성당별로 서로 다른 날
 * - 장소: 성당별 묘원
 * - 참석: Pr별 적정 인원(전원 대비 약 50~80%)
 * - 각 성당 소속 Pr마다 1건
 */
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

const CATEGORY_NAME = '메모및 행사-기타행사';
const FALLBACK_CATEGORY = '메모및 행사-단체행사';
const TITLE = '위령미사';

/** 성당명 → 묘원 */
const CEMETERY_BY_CHURCH = {
    '성모성심성당': '성모성심 묘원',
    '성바오로성당': '성바오로 묘원',
    '성베드로성당': '성베드로 묘원',
    '성요셉성당': '성요셉 묘원',
    '언양': '언양 천주교 묘원'
};

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    max: 2,
    application_name: 'regio-requiem-assign'
});

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/** 2025년 11월 일요일 */
function novemberSundays2025() {
    const dates = [];
    for (let day = 1; day <= 30; day += 1) {
        const d = new Date(2025, 10, day); // month 10 = November
        if (d.getDay() === 0) {
            dates.push(`2025-11-${String(day).padStart(2, '0')}`);
        }
    }
    return dates;
}

function cemeteryFor(churchName) {
    const name = String(churchName || '').trim();
    if (CEMETERY_BY_CHURCH[name]) return CEMETERY_BY_CHURCH[name];
    // 성당/본당 접미사 제거 후 묘원명
    const base = name.replace(/(성당|본당)$/u, '').trim() || name;
    return `${base} 묘원`;
}

/** Pr 인원의 약 50~80% (최소 1) */
function reasonableAttendance(memberCount) {
    const n = Number(memberCount) || 0;
    if (n <= 0) return 1;
    if (n === 1) return 1;
    const ratio = 0.5 + Math.random() * 0.3;
    return Math.max(1, Math.min(n, Math.round(n * ratio)));
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
            WHERE NULLIF(TRIM(church_name), '') IS NOT NULL
              AND NULLIF(TRIM(pr_name), '') IS NOT NULL
            GROUP BY church_name, curia_name, pr_name
            ORDER BY church_name, pr_name
        `);

        if (!groups.rows.length) {
            throw new Error('성당·Pr 소속 회원이 없습니다.');
        }

        const deleted = await client.query(
            `DELETE FROM activity_records ar
             USING activity_categories ac
             WHERE ar.category_id = ac.id
               AND ar.activity_date BETWEEN '2025-11-01'::date AND '2025-11-30'::date
               AND (
                    ar.note ILIKE '%제목:위령미사%'
                 OR ar.note ILIKE '%제목:위령 미사%'
               )`
        );
        console.log(`기존 위령미사(11월) 기록 삭제: ${deleted.rowCount}건`);

        const churches = [...new Set(groups.rows.map((g) => String(g.church_name).trim()))];
        const sundays = shuffle(novemberSundays2025());
        if (!sundays.length) {
            throw new Error('2025년 11월 일요일을 찾지 못했습니다.');
        }

        const churchDate = new Map();
        const churchPlace = new Map();
        churches.forEach((name, idx) => {
            churchDate.set(name, sundays[idx % sundays.length]);
            churchPlace.set(name, cemeteryFor(name));
        });

        // 성당 수가 일요일보다 많으면 일부 중복될 수 있음 → 가능한 한 앞쪽 일요일 우선 배정
        if (churches.length <= sundays.length) {
            churches.forEach((name, idx) => {
                churchDate.set(name, sundays[idx]);
            });
        }

        console.log(`카테고리: ${categoryName}`);
        console.log('\n성당(본당)별 일자·묘원:');
        for (const church of churches) {
            console.log(`  ${church} → ${churchDate.get(church)} @ ${churchPlace.get(church)}`);
        }
        console.log('');

        let inserted = 0;
        let attendeeSum = 0;

        for (const g of groups.rows) {
            const churchName = String(g.church_name).trim();
            const prName = String(g.pr_name).trim();
            const memberId = g.member_ids[0];
            const eventDate = churchDate.get(churchName);
            const place = churchPlace.get(churchName);
            const attendees = reasonableAttendance(g.member_count);
            if (!memberId || !eventDate || !place) continue;

            const note = buildNote(churchName, eventDate, place, attendees);
            await client.query(
                `INSERT INTO activity_records
                    (member_id, category_id, count, note, activity_date, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5::date, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [memberId, categoryId, attendees, note, eventDate]
            );

            inserted += 1;
            attendeeSum += attendees;
            console.log(
                `✅ ${churchName} / ${prName} → ${eventDate} @ ${place}, 참석 ${attendees}/${g.member_count}`
            );
        }

        await client.query('COMMIT');
        console.log('\n========== 배정 완료 ==========');
        console.log(`구분: 실시 | 제목: ${TITLE} | 주관: 본당`);
        console.log(`성당 수: ${churches.length}`);
        console.log(`배정 Pr 수: ${inserted}`);
        console.log(`참석 합계(적정 인원): ${attendeeSum}`);
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
