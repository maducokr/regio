/**
 * 각 Pr 주회합(요일·시·분·장소) 부여
 * - 장소 예: 교육관 101호, 교육관 303호
 * - 같은 성당·Pr 소속 전원에게 동일 값 반영
 *
 * node assign-pr-meeting-schedule.js
 */
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

const WEEKDAYS = ['월', '화', '수', '목', '금', '토'];
const HOURS = [10, 14, 19, 19, 20, 20];
const MINUTES = [0, 0, 0, 30, 0, 30];
const ROOMS = [
    101, 102, 103, 104, 105,
    201, 202, 203, 204, 205,
    301, 302, 303, 304, 305,
    401, 402, 403
];

function hashStr(s) {
    let h = 2166136261;
    const str = String(s || '');
    for (let i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function pickSchedule(church, pr) {
    const h = hashStr(`${church}|${pr}`);
    const weekday = WEEKDAYS[h % WEEKDAYS.length];
    const hour = HOURS[h % HOURS.length];
    const minute = MINUTES[h % MINUTES.length];
    const room = ROOMS[h % ROOMS.length];
    return {
        weekday,
        hour,
        minute,
        place: `교육관 ${room}호`
    };
}

async function ensurePlaceColumn(client) {
    try {
        await client.query(
            `ALTER TABLE member ADD COLUMN IF NOT EXISTS pr_meeting_place VARCHAR(100)`
        );
    } catch (err) {
        const msg = String(err && err.message || '');
        if (!/이미 존재|already exists|duplicate/i.test(msg)
            && !/소유주|owner|must be owner/i.test(msg)) {
            throw err;
        }
        // 소유주 권한 없으면 컬럼이 이미 있다고 가정하고 SELECT로 확인
        const check = await client.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_name = 'member' AND column_name = 'pr_meeting_place'`
        );
        if (!check.rows.length) {
            throw new Error('pr_meeting_place 컬럼이 없습니다. postgres 권한으로 컬럼을 추가해주세요.');
        }
    }
}

async function main() {
    const client = await pool.connect();
    try {
        await ensurePlaceColumn(client);
        await client.query('BEGIN');

        const { rows: prs } = await client.query(
            `SELECT DISTINCT TRIM(church_name) AS church_name, TRIM(pr_name) AS pr_name
             FROM member
             WHERE NULLIF(TRIM(church_name), '') IS NOT NULL
               AND NULLIF(TRIM(pr_name), '') IS NOT NULL
             ORDER BY 1, 2`
        );

        let updatedPrs = 0;
        let updatedMembers = 0;
        const samples = [];

        for (const pr of prs) {
            const schedule = pickSchedule(pr.church_name, pr.pr_name);
            const result = await client.query(
                `UPDATE member
                 SET pr_meeting_weekday = $1,
                     pr_meeting_hour = $2,
                     pr_meeting_minute = $3,
                     pr_meeting_place = $4
                 WHERE church_name = $5 AND pr_name = $6
                 RETURNING id`,
                [
                    schedule.weekday,
                    schedule.hour,
                    schedule.minute,
                    schedule.place,
                    pr.church_name,
                    pr.pr_name
                ]
            );
            if (result.rowCount > 0) {
                updatedPrs += 1;
                updatedMembers += result.rowCount;
                if (samples.length < 12) {
                    samples.push({
                        church: pr.church_name,
                        pr: pr.pr_name,
                        ...schedule,
                        members: result.rowCount
                    });
                }
            }
        }

        await client.query('COMMIT');
        console.log(`✅ Pr 주회합 부여 완료: ${updatedPrs}개 Pr / ${updatedMembers}명`);
        console.log('샘플:');
        for (const s of samples) {
            console.log(
                `  ${s.church} / ${s.pr} → 매주 ${s.weekday} ${s.hour}시 ${String(s.minute).padStart(2, '0')}분 · ${s.place} (${s.members}명)`
            );
        }
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        console.error('❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
