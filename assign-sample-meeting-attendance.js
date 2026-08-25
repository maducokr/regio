/**
 * 모의회원(id 3~103) Pr 주회·평의회 출석 임의 배정
 * 사용: node assign-sample-meeting-attendance.js
 * 옵션: --render  (DATABASE_URL / .env.render)
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

try {
    require('dotenv').config();
} catch (_) {
    /* optional */
}

const useRender = process.argv.includes('--render');
if (useRender) {
    try {
        const envPath = path.join(__dirname, '.env.render');
        if (fs.existsSync(envPath)) {
            const text = fs.readFileSync(envPath, 'utf8');
            for (const line of text.split(/\r?\n/)) {
                const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
                if (!m) continue;
                let v = m[2].trim();
                if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                    v = v.slice(1, -1);
                }
                process.env[m[1]] = v;
            }
        }
    } catch (_) {
        /* ignore */
    }
}

const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 1,
        application_name: 'regio-assign-meeting-attendance'
    })
    : new Pool({
        user: process.env.DB_ADMIN_USER || process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'regio',
        password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || '5854',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        max: 1,
        application_name: 'regio-assign-meeting-attendance'
    });

const WEEKDAY_KO_TO_JS = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
const ID_FROM = 3;
const ID_TO = 103;

function formatYmd(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatYm(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function previousYm(ym) {
    const [ys, ms] = ym.split('-');
    let y = Number(ys);
    let m = Number(ms) - 1;
    if (m < 1) {
        m = 12;
        y -= 1;
    }
    return `${y}-${String(m).padStart(2, '0')}`;
}

function lastFourPrDates(asOf, weekdayKo) {
    const target = WEEKDAY_KO_TO_JS[String(weekdayKo || '').trim()];
    if (target == null) return [];
    const d = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
    let guard = 0;
    while (d.getDay() !== target && guard < 8) {
        d.setDate(d.getDate() - 1);
        guard += 1;
    }
    const out = [];
    for (let i = 0; i < 4; i += 1) {
        out.push(formatYmd(d));
        d.setDate(d.getDate() - 7);
    }
    return out;
}

function randBool(pTrue) {
    return Math.random() < pTrue;
}

async function ensureTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS member_meeting_attendance (
            id SERIAL PRIMARY KEY,
            member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
            kind VARCHAR(20) NOT NULL,
            meeting_key VARCHAR(20) NOT NULL,
            attended BOOLEAN NOT NULL DEFAULT false,
            observer BOOLEAN NOT NULL DEFAULT false,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (member_id, kind, meeting_key)
        )
    `);
}

async function main() {
    const asOf = new Date();
    const curYm = formatYm(asOf);
    const prevYm = previousYm(curYm);
    const client = await pool.connect();
    try {
        await ensureTable(client);
        const members = await client.query(
            `SELECT id, name, pr_meeting_weekday
             FROM member
             WHERE id BETWEEN $1 AND $2
             ORDER BY id`,
            [ID_FROM, ID_TO]
        );
        if (!members.rows.length) {
            throw new Error(`회원 id ${ID_FROM}~${ID_TO} 없음`);
        }

        await client.query('BEGIN');
        await client.query(
            `DELETE FROM member_meeting_attendance
             WHERE member_id BETWEEN $1 AND $2`,
            [ID_FROM, ID_TO]
        );

        let prRows = 0;
        let councilRows = 0;
        let noWeekday = 0;

        for (const row of members.rows) {
            const weekday = String(row.pr_meeting_weekday || '').trim();
            let prDates = lastFourPrDates(asOf, weekday);
            if (!prDates.length) {
                // 요일 없으면 월요일 기준으로 채움
                noWeekday += 1;
                prDates = lastFourPrDates(asOf, '월');
            }

            // Pr: 주회 4회 중 약 70% 출석 (회차별 독립)
            for (const ymd of prDates) {
                const attended = randBool(0.72);
                await client.query(
                    `INSERT INTO member_meeting_attendance
                        (member_id, kind, meeting_key, attended, observer, updated_at)
                     VALUES ($1, 'pr', $2, $3, false, NOW())`,
                    [row.id, ymd, attended]
                );
                prRows += 1;
            }

            // 평의회: 이번 달·지난 달 — 출석 ~65%, 참관은 미출석 중 ~15% 또는 소량 병행
            for (const ym of [curYm, prevYm]) {
                const attended = randBool(0.65);
                let observer = false;
                if (!attended) observer = randBool(0.18);
                else observer = randBool(0.05);
                await client.query(
                    `INSERT INTO member_meeting_attendance
                        (member_id, kind, meeting_key, attended, observer, updated_at)
                     VALUES ($1, 'council', $2, $3, $4, NOW())`,
                    [row.id, ym, attended, observer]
                );
                councilRows += 1;
            }
        }

        await client.query('COMMIT');

        const stats = await client.query(
            `SELECT
                kind,
                COUNT(*)::int AS rows,
                COUNT(*) FILTER (WHERE attended)::int AS attended,
                COUNT(*) FILTER (WHERE observer)::int AS observer
             FROM member_meeting_attendance
             WHERE member_id BETWEEN $1 AND $2
             GROUP BY kind
             ORDER BY kind`,
            [ID_FROM, ID_TO]
        );

        const prRate = await client.query(
            `SELECT
                ROUND(100.0 * COUNT(*) FILTER (WHERE attended) / NULLIF(COUNT(*), 0), 1) AS pct
             FROM member_meeting_attendance
             WHERE member_id BETWEEN $1 AND $2 AND kind = 'pr'`,
            [ID_FROM, ID_TO]
        );
        const councilRate = await client.query(
            `SELECT meeting_key,
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE attended)::int AS attended,
                    COUNT(*) FILTER (WHERE observer)::int AS observer
             FROM member_meeting_attendance
             WHERE member_id BETWEEN $1 AND $2 AND kind = 'council'
             GROUP BY meeting_key
             ORDER BY meeting_key DESC`,
            [ID_FROM, ID_TO]
        );

        console.log(`대상 회원: ${members.rows.length}명 (id ${ID_FROM}~${ID_TO})`);
        console.log(`요일 미등록→월요일 대체: ${noWeekday}명`);
        console.log(`삽입: Pr ${prRows}행, 평의회 ${councilRows}행`);
        console.log('집계:', stats.rows);
        console.log(`Pr 출석률(행 기준): ${prRate.rows[0]?.pct}%`);
        console.log('평의회 월별:', councilRate.rows);
        console.log(`기준일: ${formatYmd(asOf)} / 월: ${curYm}, ${prevYm}`);
        console.log(useRender ? 'DB: Render' : 'DB: local');
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {
            /* ignore */
        }
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
