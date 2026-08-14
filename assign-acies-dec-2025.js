/**
 * 2025년 12월 꾸리아 주관 아치에스 배정 (3월 아치에스와 동일 형식)
 * - 구분: 실시 / 제목: 아치에스
 * - 일자: 2025-12-01 ~ 2025-12-31, 꾸리아별로 서로 다른 날짜
 * - 장소: 교육관
 * - 주관: 꾸리아명
 * - 각 꾸리아 소속 Pr마다 1건 (단장 G1 우선), 참석 = Pr 인원
 */
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

const CATEGORY_NAME = '메모및 행사-단체행사';
const TITLE = '아치에스';
const PLACE = '교육관';

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    max: 2,
    application_name: 'regio-acies-dec-assign'
});

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function decemberDates() {
    const dates = [];
    for (let day = 1; day <= 31; day += 1) {
        dates.push(`2025-12-${String(day).padStart(2, '0')}`);
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
               AND ar.activity_date BETWEEN '2025-12-01'::date AND '2025-12-31'::date
               AND ar.note ILIKE $2`,
            [CATEGORY_NAME, `%제목:${TITLE}%`]
        );
        console.log(`기존 ${TITLE}(12월) 기록 삭제: ${deleted.rowCount}건`);

        const curiaNames = [...new Set(groups.rows.map((g) => String(g.curia_name).trim()))];
        const datePool = shuffle(decemberDates());
        if (curiaNames.length > datePool.length) {
            throw new Error(`꾸리아 수(${curiaNames.length})가 12월 일수보다 많습니다.`);
        }

        const curiaDate = new Map();
        curiaNames.forEach((name, idx) => {
            curiaDate.set(name, datePool[idx]);
        });

        console.log('\n꾸리아별 일자:');
        for (const [curia, date] of curiaDate) {
            console.log(`  ${curia} → ${date}`);
        }
        console.log('');

        let inserted = 0;
        let attendeeSum = 0;

        for (const g of groups.rows) {
            const curiaName = String(g.curia_name).trim();
            const prName = String(g.pr_name).trim();
            const count = Number(g.member_count) || 0;
            const memberId = g.member_ids[0];
            const eventDate = curiaDate.get(curiaName);
            if (!memberId || count < 1 || !eventDate) continue;

            const note = buildNote(curiaName, eventDate, count);
            await client.query(
                `INSERT INTO activity_records
                    (member_id, category_id, count, note, activity_date, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5::date, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [memberId, categoryId, count, note, eventDate]
            );

            inserted += 1;
            attendeeSum += count;
            console.log(
                `✅ ${g.church_name} / ${curiaName} / ${prName} → ${eventDate} @ ${PLACE}, 참석 ${count}`
            );
        }

        await client.query('COMMIT');
        console.log('\n========== 배정 완료 ==========');
        console.log(`구분: 실시 | 제목: ${TITLE} | 장소: ${PLACE}`);
        console.log(`꾸리아 수: ${curiaNames.length} (날짜 모두 상이)`);
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
