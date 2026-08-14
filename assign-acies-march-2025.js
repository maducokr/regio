/**
 * 2025년 3월 아치에스 행사 배정
 * - 일자: 2025-03-25 (3월 중 선택)
 * - 각 꾸리아 소속 Pr마다 1건 (단장 G1 우선, 없으면 해당 Pr 대표 1명)
 * - 구분:실시 / 제목:아치에스 / 주관:꾸리아명 / 장소:성전
 * - 참석인원·횟수: 해당 Pr 회원 전원 수
 */
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

const EVENT_DATE = '2025-03-25';
const CATEGORY_NAME = '메모및 행사-단체행사';

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    max: 2,
    application_name: 'regio-acies-assign'
});

function buildNote(curiaName, attendeeCount) {
    return [
        `꾸리아: ${curiaName}`,
        [
            '1.',
            '구분:실시',
            '제목:아치에스',
            `주관:${curiaName}`,
            `일자:${EVENT_DATE}`,
            '장소:성전',
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

        // 동일 일자·카테고리의 기존 아치에스(동일 note 패턴) 정리 후 재배정
        const deleted = await client.query(
            `DELETE FROM activity_records ar
             USING activity_categories ac, member m
             WHERE ar.category_id = ac.id
               AND ar.member_id = m.id
               AND ac.category_name = $1
               AND ar.activity_date = $2::date
               AND ar.note ILIKE '%제목:아치에스%'`,
            [CATEGORY_NAME, EVENT_DATE]
        );
        console.log(`기존 아치에스 기록 삭제: ${deleted.rowCount}건`);

        let inserted = 0;
        const summary = [];

        for (const g of groups.rows) {
            const curiaName = String(g.curia_name).trim();
            const prName = String(g.pr_name).trim();
            const count = Number(g.member_count) || 0;
            const memberId = g.member_ids[0];
            if (!memberId || count < 1) continue;

            const note = buildNote(curiaName, count);
            await client.query(
                `INSERT INTO activity_records
                    (member_id, category_id, count, note, activity_date, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5::date, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [memberId, categoryId, count, note, EVENT_DATE]
            );
            inserted += 1;
            summary.push({
                church: g.church_name,
                curia: curiaName,
                pr: prName,
                member_id: memberId,
                attendees: count
            });
            console.log(
                `✅ ${g.church_name} / ${curiaName} / ${prName} → member#${memberId}, 참석 ${count}`
            );
        }

        await client.query('COMMIT');
        console.log('\n========== 배정 완료 ==========');
        console.log(`일자: ${EVENT_DATE}`);
        console.log(`구분: 실시 | 제목: 아치에스 | 장소: 성전`);
        console.log(`배정 Pr 수: ${inserted} / 꾸리아 수: ${new Set(summary.map((s) => s.curia)).size}`);
        console.log(`참석 합계(Pr별 인원 합): ${summary.reduce((a, s) => a + s.attendees, 0)}`);
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
