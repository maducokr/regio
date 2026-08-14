/**
 * 2025년 5월 성모의 밤 배정
 * - 구분: 실시 / 제목: 성모의밤
 * - 주관: 본당(성당명)
 * - 일자: 2025-05-01 ~ 2025-05-31, 성당별로 서로 다른 날짜
 * - 장소: 성전
 * - 각 성당 소속 Pr마다 1건, 참석 = Pr 인원
 */
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

const CATEGORY_NAME = '메모및 행사-기타행사';
const TITLE = '성모의밤';
const PLACE = '성전';

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    max: 2,
    application_name: 'regio-mary-night-assign'
});

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function mayDates() {
    const dates = [];
    for (let day = 1; day <= 31; day += 1) {
        dates.push(`2025-05-${String(day).padStart(2, '0')}`);
    }
    return dates;
}

function buildNote(churchName, eventDate, attendeeCount) {
    return [
        `본당: ${churchName}`,
        [
            '1.',
            '구분:실시',
            `제목:${TITLE}`,
            `주관:${churchName}`,
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
    if (cat.rows.length) return cat.rows[0].id;

    // 기타행사가 없으면 단체행사로 저장
    const fallback = '메모및 행사-단체행사';
    cat = await client.query(
        `SELECT id FROM activity_categories WHERE category_name = $1`,
        [fallback]
    );
    if (!cat.rows.length) {
        throw new Error(`카테고리 없음: ${CATEGORY_NAME} / ${fallback}`);
    }
    console.log(`⚠ ${CATEGORY_NAME} 없음 → ${fallback} 사용`);
    return cat.rows[0].id;
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const categoryId = await ensureCategory(client);

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
               AND ar.activity_date BETWEEN '2025-05-01'::date AND '2025-05-31'::date
               AND (
                    ar.note ILIKE '%제목:성모의밤%'
                 OR ar.note ILIKE '%제목:성모의 밤%'
               )`
        );
        console.log(`기존 성모의밤(5월) 기록 삭제: ${deleted.rowCount}건`);

        const churches = [...new Set(groups.rows.map((g) => String(g.church_name).trim()))];
        const datePool = shuffle(mayDates());
        if (churches.length > datePool.length) {
            throw new Error(`성당 수(${churches.length})가 5월 일수보다 많습니다.`);
        }

        const churchDate = new Map();
        churches.forEach((name, idx) => {
            churchDate.set(name, datePool[idx]);
        });

        console.log('\n성당(본당)별 일자:');
        for (const [church, date] of churchDate) {
            console.log(`  ${church} → ${date}`);
        }
        console.log('');

        let inserted = 0;
        let attendeeSum = 0;

        for (const g of groups.rows) {
            const churchName = String(g.church_name).trim();
            const prName = String(g.pr_name).trim();
            const count = Number(g.member_count) || 0;
            const memberId = g.member_ids[0];
            const eventDate = churchDate.get(churchName);
            if (!memberId || count < 1 || !eventDate) continue;

            const note = buildNote(churchName, eventDate, count);
            await client.query(
                `INSERT INTO activity_records
                    (member_id, category_id, count, note, activity_date, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5::date, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [memberId, categoryId, count, note, eventDate]
            );

            inserted += 1;
            attendeeSum += count;
            console.log(
                `✅ ${churchName} / ${prName} → ${eventDate} @ ${PLACE}, 참석 ${count}`
            );
        }

        await client.query('COMMIT');
        console.log('\n========== 배정 완료 ==========');
        console.log(`구분: 실시 | 제목: ${TITLE} | 주관: 본당 | 장소: ${PLACE}`);
        console.log(`성당 수: ${churches.length} (날짜 모두 상이)`);
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
