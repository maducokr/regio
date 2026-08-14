/**
 * 2025년 8월 Pr별 행사 배정 (월례보고 8월 조회용 샘플)
 * - 구분: 실시 / 제목: 야외행사
 * - 주관: Pr명 / 장소: 교육관
 * - 일자: 8월 중 Pr별 서로 다른 날
 * - 참석: Pr 인원
 */
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

const CATEGORY_NAME = '메모및 행사-단체행사';
const TITLE = '야외행사';
const PLACE = '교육관';

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    max: 2,
    application_name: 'regio-august-event-assign'
});

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function augustDates() {
    const dates = [];
    for (let day = 1; day <= 31; day += 1) {
        dates.push(`2025-08-${String(day).padStart(2, '0')}`);
    }
    return dates;
}

function buildNote(prName, eventDate, attendeeCount) {
    return [
        `Pr: ${prName}`,
        [
            '1.',
            '구분:실시',
            `제목:${TITLE}`,
            `주관:${prName}`,
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
            WHERE NULLIF(TRIM(pr_name), '') IS NOT NULL
              AND NULLIF(TRIM(church_name), '') IS NOT NULL
            GROUP BY church_name, curia_name, pr_name
            ORDER BY church_name, pr_name
        `);

        // 8월 야외행사만 정리 (연중 다른 달 야외행사는 유지)
        const deleted = await client.query(
            `DELETE FROM activity_records ar
             USING activity_categories ac
             WHERE ar.category_id = ac.id
               AND ac.category_name = $1
               AND ar.activity_date BETWEEN '2025-08-01'::date AND '2025-08-31'::date
               AND ar.note ILIKE '%제목:야외행사%'`,
            [CATEGORY_NAME]
        );
        console.log(`기존 8월 야외행사 삭제: ${deleted.rowCount}건`);

        const datePool = shuffle(augustDates());
        let inserted = 0;

        groups.rows.forEach((g, idx) => {
            g._date = datePool[idx % datePool.length];
        });

        for (const g of groups.rows) {
            const prName = String(g.pr_name).trim();
            const count = Number(g.member_count) || 0;
            const memberId = g.member_ids[0];
            const eventDate = g._date;
            if (!memberId || count < 1) continue;

            await client.query(
                `INSERT INTO activity_records
                    (member_id, category_id, count, note, activity_date, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5::date, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [memberId, categoryId, count, buildNote(prName, eventDate, count), eventDate]
            );
            inserted += 1;
            console.log(`✅ ${g.church_name} / ${prName} → ${eventDate}, 참석 ${count}`);
        }

        await client.query('COMMIT');
        console.log(`\n배정 완료: Pr ${inserted}건 (2025년 8월)`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
