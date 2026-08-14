/**
 * 각 꾸리아별 승인일자·회합일자·회합장소 임의 배정
 *
 * node assign-curia-meeting-meta.js
 * node assign-curia-meeting-meta.js --as-of=2026-08-04
 */
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_ADMIN_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || '5854',
    port: +(process.env.DB_PORT || 5432)
});

const MEETING_PLACES = [
    '성당 교육관 1층',
    '성당 교육관 2층',
    '성당 회의실',
    '본당 사제관 응접실',
    '성당 지하강당',
    '본당 청년실',
    '성당 소성당 옆 회의실',
    '본당 사랑방',
    '성당 3층 교육실',
    '본당 사무실 회의실'
];

function parseAsOf() {
    const arg = process.argv.find((a) => a.startsWith('--as-of='));
    const raw = arg ? arg.slice('--as-of='.length) : new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        throw new Error(`잘못된 --as-of: ${raw}`);
    }
    return raw;
}

function hashStr(s) {
    let h = 2166136261;
    const str = String(s || '');
    for (let i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function addDaysYmd(ymd, days) {
    const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

function buildMetaForCuria(curiaName, asOf) {
    const h = hashStr(curiaName);
    // 승인일: 기준일 기준 2~8년 전
    const approvedOffset = -((h % 2200) + 730);
    const approvedOn = addDaysYmd(asOf, approvedOffset);
    // 회합일: 기준일 전후 60일 내 (보통 최근/예정 회합)
    const meetingOffset = (h % 61) - 30;
    const meetingOn = addDaysYmd(asOf, meetingOffset);
    const place = MEETING_PLACES[h % MEETING_PLACES.length];
    return { approvedOn, meetingOn, place };
}

async function ensureColumns(client) {
    for (const sql of [
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS curia_approved_on DATE`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS curia_meeting_on DATE`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS curia_meeting_place VARCHAR(100)`
    ]) {
        try {
            await client.query(sql);
        } catch (err) {
            const msg = String((err && err.message) || '');
            if (!/소유주|owner|must be owner|이미 존재|already exists/i.test(msg)) throw err;
        }
    }
}

async function main() {
    const asOf = parseAsOf();
    const client = await pool.connect();
    try {
        await ensureColumns(client);
        await client.query('BEGIN');

        const curias = await client.query(
            `SELECT DISTINCT TRIM(curia_name) AS curia_name
             FROM member
             WHERE NULLIF(TRIM(curia_name), '') IS NOT NULL
             ORDER BY 1`
        );

        let updatedMembers = 0;
        const summary = [];

        for (const row of curias.rows) {
            const curiaName = row.curia_name;
            const meta = buildMetaForCuria(curiaName, asOf);
            const r = await client.query(
                `UPDATE member
                 SET curia_approved_on = $2::date,
                     curia_meeting_on = $3::date,
                     curia_meeting_place = $4
                 WHERE TRIM(curia_name) = $1
                 RETURNING id`,
                [curiaName, meta.approvedOn, meta.meetingOn, meta.place]
            );
            updatedMembers += r.rowCount;
            summary.push({
                curia_name: curiaName,
                approved_on: meta.approvedOn,
                meeting_on: meta.meetingOn,
                meeting_place: meta.place,
                members: r.rowCount
            });
            console.log(
                `✅ ${curiaName}: 승인 ${meta.approvedOn} / 회합 ${meta.meetingOn} / ${meta.place} (${r.rowCount}명)`
            );
        }

        await client.query('COMMIT');
        console.log(`완료: 꾸리아 ${summary.length}곳, 회원 ${updatedMembers}명 갱신 (기준일 ${asOf})`);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
