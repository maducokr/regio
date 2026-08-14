/**
 * 2025년 꾸리아 주관 연차총친목회 배정
 * - 구분: 실시 / 제목: 연차총친목회
 * - 일자: 2025-01-01 ~ 2025-12-31, 꾸리아별로 서로 다른 날짜
 * - 장소: 교육관 / 주관: 꾸리아명
 * - 각 꾸리아 소속 Pr마다 1건, 참석 = Pr 인원
 */
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

const CATEGORY_NAME = '메모및 행사-단체행사';
const TITLE = '연차총친목회';
const PLACE = '교육관';

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    max: 2,
    application_name: 'regio-annual-social-assign'
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

function yearDatePool() {
    const dates = [];
    const start = new Date(2025, 0, 1);
    const end = new Date(2025, 11, 31);
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

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const cat = await client.query(
            `SELECT id FROM activity_categories WHERE category_name = $1`,
            [CATEGORY_NAME]
        );
        if (!cat.rows.length) throw new Error(`카테고리 없음: ${CATEGORY_NAME}`);
        const categoryId = cat.rows[0].id;

        // 토론대회 등 기존 꾸리아 행사 일자와 겹치지 않게
        const used = await client.query(
            `SELECT DISTINCT
                substring(ar.note from '꾸리아:\\s*([^\\n]+)') AS curia_name,
                ar.activity_date::text AS activity_date
             FROM activity_records ar
             INNER JOIN activity_categories ac ON ar.category_id = ac.id
             WHERE ac.category_name = $1
               AND ar.activity_date BETWEEN '2025-01-01'::date AND '2025-12-31'::date
               AND (
                    ar.note ILIKE '%제목:토론대회%'
                 OR ar.note ILIKE '%제목:아치에스%'
                 OR ar.note ILIKE '%제목:연차총친목회%'
               )`,
            [CATEGORY_NAME]
        );
        const usedDates = new Set(used.rows.map((r) => r.activity_date).filter(Boolean));

        const groups = await client.query(`
            SELECT
                church_name, curia_name, pr_name,
                COUNT(*)::int AS member_count,
                array_agg(id ORDER BY
                    CASE
                        WHEN position ILIKE '%단장%' AND position NOT ILIKE '%부단장%' THEN 1
                        WHEN name ~* '^[TG]1' THEN 2
                        ELSE 9
                    END, id
                ) AS member_ids
            FROM member
            WHERE NULLIF(TRIM(curia_name), '') IS NOT NULL
              AND NULLIF(TRIM(pr_name), '') IS NOT NULL
              AND NULLIF(TRIM(church_name), '') IS NOT NULL
            GROUP BY church_name, curia_name, pr_name
            ORDER BY church_name, curia_name, pr_name
        `);
        if (!groups.rows.length) throw new Error('꾸리아·Pr 소속 회원이 없습니다.');

        const deleted = await client.query(
            `DELETE FROM activity_records ar
             USING activity_categories ac
             WHERE ar.category_id = ac.id
               AND ac.category_name = $1
               AND ar.activity_date BETWEEN '2025-01-01'::date AND '2025-12-31'::date
               AND ar.note ILIKE $2`,
            [CATEGORY_NAME, `%제목:${TITLE}%`]
        );
        console.log(`기존 ${TITLE} 기록 삭제: ${deleted.rowCount}건`);

        const curiaNames = [...new Set(groups.rows.map((g) => String(g.curia_name).trim()))];
        const datePool = shuffle(yearDatePool().filter((d) => !usedDates.has(d)));
        if (curiaNames.length > datePool.length) {
            throw new Error('사용 가능한 일자가 부족합니다.');
        }

        const curiaDate = new Map();
        curiaNames.forEach((name, idx) => curiaDate.set(name, datePool[idx]));

        console.log('\n꾸리아별 일자:');
        for (const [curia, date] of curiaDate) console.log(`  ${curia} → ${date}`);
        console.log('');

        let inserted = 0;
        let attendeeSum = 0;
        for (const g of groups.rows) {
            const curiaName = String(g.curia_name).trim();
            const count = Number(g.member_count) || 0;
            const memberId = g.member_ids[0];
            const eventDate = curiaDate.get(curiaName);
            if (!memberId || count < 1 || !eventDate) continue;

            await client.query(
                `INSERT INTO activity_records
                    (member_id, category_id, count, note, activity_date, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5::date, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [memberId, categoryId, count, buildNote(curiaName, eventDate, count), eventDate]
            );
            inserted += 1;
            attendeeSum += count;
            console.log(
                `✅ ${g.church_name} / ${curiaName} / ${g.pr_name} → ${eventDate} @ ${PLACE}, 참석 ${count}`
            );
        }

        await client.query('COMMIT');
        console.log('\n========== 배정 완료 ==========');
        console.log(`구분: 실시 | 제목: ${TITLE} | 장소: ${PLACE}`);
        console.log(`꾸리아 ${curiaNames.length} · Pr ${inserted} · 참석합 ${attendeeSum}`);
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
