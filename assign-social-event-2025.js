/**
 * 2025년 Pr별 친목회 배정 (야외행사와 동일 형식, 일자만 다름)
 * - 구분: 실시 / 제목: 친목회
 * - 일자: 2025-01-01 ~ 2025-12-31 임의 (기존 야외행사 일자와 겹치면 다시 추첨)
 * - 장소: 임의
 * - 참석인원·횟수: 해당 Pr 회원 수
 * - 주관: Pr명
 */
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

const CATEGORY_NAME = '메모및 행사-단체행사';
const TITLE = '친목회';
const PLACES = [
    '성전', '본당마당', '수련원', '피정의집', '성지',
    '공원', '야외예배처', '수도원', '교육관', '강당', '식당'
];

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    max: 2,
    application_name: 'regio-social-assign'
});

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function randomDate2025(avoidSet) {
    const start = new Date(2025, 0, 1).getTime();
    const end = new Date(2025, 11, 31).getTime();
    for (let i = 0; i < 40; i += 1) {
        const d = formatDate(new Date(start + Math.random() * (end - start)));
        if (!avoidSet || !avoidSet.has(d)) return d;
    }
    return formatDate(new Date(start + Math.random() * (end - start)));
}

function pickPlace() {
    return PLACES[randomInt(0, PLACES.length - 1)];
}

function buildNote(prName, eventDate, place, attendeeCount) {
    return [
        `Pr: ${prName}`,
        [
            '1.',
            '구분:실시',
            `제목:${TITLE}`,
            `주관:${prName}`,
            `일자:${eventDate}`,
            `장소:${place}`,
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

        // Pr별 기존 야외행사 일자 (친목회 일자와 겹치지 않게)
        const outdoorDates = await client.query(
            `SELECT m.church_name, m.pr_name, ar.activity_date::text AS activity_date
             FROM activity_records ar
             INNER JOIN activity_categories ac ON ar.category_id = ac.id
             INNER JOIN member m ON ar.member_id = m.id
             WHERE ac.category_name = $1
               AND ar.activity_date BETWEEN '2025-01-01'::date AND '2025-12-31'::date
               AND ar.note ILIKE '%제목:야외행사%'`,
            [CATEGORY_NAME]
        );
        const outdoorByPr = new Map();
        for (const row of outdoorDates.rows) {
            const key = `${row.church_name}||${row.pr_name}`;
            if (!outdoorByPr.has(key)) outdoorByPr.set(key, new Set());
            outdoorByPr.get(key).add(row.activity_date);
        }

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
            WHERE NULLIF(TRIM(pr_name), '') IS NOT NULL
              AND NULLIF(TRIM(church_name), '') IS NOT NULL
            GROUP BY church_name, curia_name, pr_name
            ORDER BY church_name, curia_name, pr_name
        `);

        if (!groups.rows.length) {
            throw new Error('Pr 소속 회원이 없습니다.');
        }

        const deleted = await client.query(
            `DELETE FROM activity_records ar
             USING activity_categories ac
             WHERE ar.category_id = ac.id
               AND ac.category_name = $1
               AND ar.activity_date BETWEEN '2025-01-01'::date AND '2025-12-31'::date
               AND ar.note ILIKE '%제목:친목회%'`,
            [CATEGORY_NAME]
        );
        console.log(`기존 친목회 기록 삭제: ${deleted.rowCount}건`);

        let inserted = 0;
        let attendeeSum = 0;

        for (const g of groups.rows) {
            const prName = String(g.pr_name).trim();
            const count = Number(g.member_count) || 0;
            const memberId = g.member_ids[0];
            if (!memberId || count < 1) continue;

            const avoid = outdoorByPr.get(`${g.church_name}||${prName}`) || new Set();
            const eventDate = randomDate2025(avoid);
            const place = pickPlace();
            const note = buildNote(prName, eventDate, place, count);

            await client.query(
                `INSERT INTO activity_records
                    (member_id, category_id, count, note, activity_date, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5::date, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [memberId, categoryId, count, note, eventDate]
            );

            inserted += 1;
            attendeeSum += count;
            console.log(
                `✅ ${g.church_name} / ${prName} → ${eventDate} @ ${place}, 참석 ${count} (member#${memberId})`
            );
        }

        await client.query('COMMIT');
        console.log('\n========== 배정 완료 ==========');
        console.log(`구분: 실시 | 제목: ${TITLE}`);
        console.log(`배정 Pr 수: ${inserted}`);
        console.log(`참석 합계(Pr별 인원 합): ${attendeeSum}`);
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
