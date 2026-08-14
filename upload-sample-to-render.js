/**
 * 로컬 모의회원(id 3~103) + 카테고리/활동/배당 → Render 업로드
 *
 * 사용:
 *   node upload-sample-to-render.js
 *   node upload-sample-to-render.js --target https://regio.onrender.com
 *
 * 전제: Render에 최신 server.js 배포( /api/admin/bootstrap-sample )
 */
require('dotenv').config();
const { Pool } = require('pg');

const TARGET = (process.argv.find((a) => a.startsWith('--target=')) || '')
    .slice('--target='.length)
    || process.env.RENDER_APP_URL
    || 'https://regio.onrender.com';

const ADMIN_NAME = process.env.SEED_ADMIN_NAME || '김학숭';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || '1240520301';
const ID_MIN = 3;
const ID_MAX = 103;
const CHUNK = 400;

const localPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: +(process.env.DB_PORT || 5432)
});

const MEMBER_COLS = [
    'id', 'name', 'baptism_name', 'church_name', 'curia_name', 'curia_officer', 'pr_name', 'position',
    'phone_last4', 'resident_id_front6', 'phone_full', 'resident_id_full', 'passno',
    'email', 'email_verified', 'google_id', 'comitia_name', 'regia_name', 'senatus_name',
    'gender', 'pr_type', 'officer_appointed_on', 'pr_meeting_weekday', 'pr_meeting_hour',
    'pr_meeting_minute', 'pr_meeting_place', 'pr_founded_on', 'pr_approved_on',
    'curia_officer_elected_on', 'pr_returned_on', 'curia_approved_on', 'curia_meeting_on',
    'curia_meeting_place', 'activity_count', 'created_at', 'updated_at'
];

async function postJson(path, body) {
    const res = await fetch(`${TARGET.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
    if (!res.ok || data.success === false) {
        const err = new Error(data.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

function pickMember(row) {
    const out = {};
    for (const c of MEMBER_COLS) {
        if (row[c] !== undefined) out[c] = row[c];
    }
    if (!out.baptism_name && row.baptismal_name) out.baptism_name = row.baptismal_name;
    return out;
}

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

(async () => {
    console.log('대상:', TARGET);
    console.log('로컬 DB에서 모의자료 읽는 중...');

    const categories = (await localPool.query(
        `SELECT id, category_name, category_group, description, created_at
         FROM activity_categories ORDER BY id`
    )).rows;

    const members = (await localPool.query(
        `SELECT * FROM member WHERE id BETWEEN $1 AND $2 ORDER BY id`,
        [ID_MIN, ID_MAX]
    )).rows.map(pickMember);

    const activityRecords = (await localPool.query(
        `SELECT id, member_id, category_id, target, count,
                catechism_guide, group_join, meeting_head, resolution, sacrament,
                confirmation, baptism, first_communion, year_count, funeral_mass,
                memorial_mass, funeral_attendance, conditional_baptism, conditional_communion,
                membership, establishment, inout_count, note, activity_date, created_at, updated_at
         FROM activity_records
         WHERE member_id BETWEEN $1 AND $2
         ORDER BY id`,
        [ID_MIN, ID_MAX]
    )).rows;

    let assignments = [];
    try {
        assignments = (await localPool.query(
            `SELECT id, member_id, assigner_id, "활동배당", "활동대상자",
                    church_name, pr_name, created_at, updated_at
             FROM activity_assignments
             WHERE member_id BETWEEN $1 AND $2
             ORDER BY id`,
            [ID_MIN, ID_MAX]
        )).rows;
    } catch (_) {
        assignments = [];
    }

    console.log(`카테고리 ${categories.length}, 회원 ${members.length}, 활동 ${activityRecords.length}, 배당 ${assignments.length}`);

    console.log('1) Render 테이블 reset...');
    await postJson('/api/admin/bootstrap-sample', {
        admin_name: ADMIN_NAME,
        admin_password: ADMIN_PASSWORD,
        reset: true
    });

    console.log('2) 카테고리 업로드...');
    await postJson('/api/admin/bootstrap-sample', {
        admin_name: ADMIN_NAME,
        admin_password: ADMIN_PASSWORD,
        categories,
        continue_bootstrap: true
    });

    console.log('3) 회원 업로드...');
    for (const part of chunk(members, 50)) {
        await postJson('/api/admin/bootstrap-sample', {
            admin_name: ADMIN_NAME,
            admin_password: ADMIN_PASSWORD,
            members: part,
            continue_bootstrap: true
        });
        process.stdout.write(`.`);
    }
    console.log(' ok');

    console.log('4) 활동기록 업로드...');
    let done = 0;
    for (const part of chunk(activityRecords, CHUNK)) {
        await postJson('/api/admin/bootstrap-sample', {
            admin_name: ADMIN_NAME,
            admin_password: ADMIN_PASSWORD,
            activity_records: part,
            continue_bootstrap: true
        });
        done += part.length;
        process.stdout.write(`\r   ${done}/${activityRecords.length}`);
    }
    console.log('\n   ok');

    if (assignments.length) {
        console.log('5) 배당 업로드...');
        done = 0;
        for (const part of chunk(assignments, CHUNK)) {
            await postJson('/api/admin/bootstrap-sample', {
                admin_name: ADMIN_NAME,
                admin_password: ADMIN_PASSWORD,
                activity_assignments: part,
                continue_bootstrap: true
            });
            done += part.length;
            process.stdout.write(`\r   ${done}/${assignments.length}`);
        }
        console.log('\n   ok');
    }

    const check = await fetch(`${TARGET.replace(/\/$/, '')}/api/members`);
    const rows = await check.json();
    console.log('완료. Render /api/members 건수:', Array.isArray(rows) ? rows.length : rows);
    await localPool.end();
})().catch(async (err) => {
    console.error('\n실패:', err.message);
    if (err.data) console.error(JSON.stringify(err.data));
    try { await localPool.end(); } catch (_) { /* ignore */ }
    process.exit(1);
});
