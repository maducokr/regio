/**
 * External Database URL 로 로컬 모의자료를 Render Postgres에 직접 적재
 *
 * 1) Render Dashboard → PostgreSQL → Connect → External Database URL 복사
 * 2) 프로젝트 루트에 .env.render 작성:
 *      RENDER_DATABASE_URL=postgresql://...
 * 3) node upload-sample-via-pg.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function loadRenderEnv() {
    const p = path.join(__dirname, '.env.render');
    const out = {};
    if (!fs.existsSync(p)) return out;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const i = t.indexOf('=');
        if (i < 0) continue;
        out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    }
    return out;
}

const renderEnv = loadRenderEnv();
let targetUrl = String(process.env.RENDER_DATABASE_URL || renderEnv.RENDER_DATABASE_URL || '').trim();
if (!targetUrl) {
    console.error('❌ RENDER_DATABASE_URL 이 없습니다.');
    console.error('   Render Postgres → Connect → External Database URL 을 .env.render 에 넣으세요.');
    process.exit(1);
}
if (!/[?&]sslmode=/.test(targetUrl)) {
    targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'sslmode=require';
}

const ID_MIN = 3;
const ID_MAX = 103;

const local = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: +(process.env.DB_PORT || 5432)
});

const remote = new Pool({
    connectionString: targetUrl,
    ssl: { rejectUnauthorized: false },
    max: 2,
    application_name: 'regio-sample-upload'
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

async function ensureRemoteSchema(client) {
    // 서버와 동일 최소 스키마
    const { ensureCoreSchema } = require('./lib/ensure-core-schema');
    await ensureCoreSchema({ query: (...a) => client.query(...a) });
}

(async () => {
    const probe = await remote.query('SELECT current_database() AS db, inet_server_addr() AS addr');
    console.log('Render 접속:', probe.rows[0]);

    const client = await remote.connect();
    try {
        console.log('스키마 확인/생성...');
        await ensureRemoteSchema(client);

        console.log('기존 모의 관련 테이블 truncate...');
        await client.query('BEGIN');
        await client.query(`
            TRUNCATE TABLE activity_assignments, activity_records, play_purchases, member, activity_categories
            RESTART IDENTITY CASCADE
        `);

        const categories = (await local.query(
            `SELECT id, category_name, category_group, description, created_at
             FROM activity_categories ORDER BY id`
        )).rows;
        for (const row of categories) {
            await client.query(
                `INSERT INTO activity_categories (id, category_name, category_group, description, created_at)
                 VALUES ($1,$2,$3,$4,COALESCE($5::timestamp, CURRENT_TIMESTAMP))`,
                [row.id, row.category_name, row.category_group || '기타', row.description || null, row.created_at]
            );
        }
        console.log('categories', categories.length);

        const members = (await local.query(
            `SELECT * FROM member WHERE id BETWEEN $1 AND $2 ORDER BY id`,
            [ID_MIN, ID_MAX]
        )).rows;
        for (const row of members) {
            const values = MEMBER_COLS.map((c) => {
                if (c === 'baptism_name' && (row[c] == null) && row.baptismal_name != null) return row.baptismal_name;
                return row[c] === undefined ? null : row[c];
            });
            const ph = MEMBER_COLS.map((_, i) => `$${i + 1}`).join(',');
            await client.query(
                `INSERT INTO member (${MEMBER_COLS.join(',')}) VALUES (${ph})`,
                values
            );
        }
        console.log('members', members.length);

        const acts = (await local.query(
            `SELECT id, member_id, category_id, target, count,
                    catechism_guide, group_join, meeting_head, resolution, sacrament,
                    confirmation, baptism, first_communion, year_count, funeral_mass,
                    memorial_mass, funeral_attendance, conditional_baptism, conditional_communion,
                    membership, establishment, inout_count, note, activity_date, created_at, updated_at
             FROM activity_records WHERE member_id BETWEEN $1 AND $2 ORDER BY id`,
            [ID_MIN, ID_MAX]
        )).rows;
        for (const row of acts) {
            await client.query(
                `INSERT INTO activity_records (
                    id, member_id, category_id, target, count,
                    catechism_guide, group_join, meeting_head, resolution, sacrament,
                    confirmation, baptism, first_communion, year_count, funeral_mass,
                    memorial_mass, funeral_attendance, conditional_baptism, conditional_communion,
                    membership, establishment, inout_count, note, activity_date, created_at, updated_at
                 ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::date,$25,$26
                 )`,
                [
                    row.id, row.member_id, row.category_id, row.target, row.count || 0,
                    row.catechism_guide || 0, row.group_join || 0, row.meeting_head || 0,
                    row.resolution || 0, row.sacrament || 0, row.confirmation || 0,
                    row.baptism || 0, row.first_communion || 0, row.year_count || 0,
                    row.funeral_mass || 0, row.memorial_mass || 0, row.funeral_attendance || 0,
                    row.conditional_baptism || 0, row.conditional_communion || 0,
                    row.membership || 0, row.establishment || 0, row.inout_count || 0,
                    row.note, row.activity_date, row.created_at, row.updated_at
                ]
            );
        }
        console.log('activity_records', acts.length);

        let assigns = [];
        try {
            assigns = (await local.query(
                `SELECT id, member_id, assigner_id, "활동배당", "활동대상자", church_name, pr_name, created_at, updated_at
                 FROM activity_assignments WHERE member_id BETWEEN $1 AND $2 ORDER BY id`,
                [ID_MIN, ID_MAX]
            )).rows;
            for (const row of assigns) {
                await client.query(
                    `INSERT INTO activity_assignments (
                        id, member_id, assigner_id, "활동배당", "활동대상자", church_name, pr_name, created_at, updated_at
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                    [
                        row.id, row.member_id, row.assigner_id, row['활동배당'], row['활동대상자'],
                        row.church_name, row.pr_name, row.created_at, row.updated_at
                    ]
                );
            }
            console.log('activity_assignments', assigns.length);
        } catch (e) {
            console.log('assignments skip:', e.message);
        }

        await client.query(`SELECT setval(pg_get_serial_sequence('activity_categories','id'), COALESCE((SELECT MAX(id) FROM activity_categories),1), true)`);
        await client.query(`SELECT setval(pg_get_serial_sequence('member','id'), COALESCE((SELECT MAX(id) FROM member),1), true)`);
        await client.query(`SELECT setval(pg_get_serial_sequence('activity_records','id'), COALESCE((SELECT MAX(id) FROM activity_records),1), true)`);
        await client.query(`SELECT setval(pg_get_serial_sequence('activity_assignments','id'), COALESCE((SELECT MAX(id) FROM activity_assignments),1), true)`);

        await client.query('COMMIT');
        const n = await remote.query('SELECT COUNT(*)::int AS n FROM member');
        const tt = await remote.query(`SELECT COUNT(*)::int AS n FROM member WHERE church_name ILIKE 'tt%'`);
        console.log('완료 member=', n.rows[0].n, 'tt_church=', tt.rows[0].n);
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        throw e;
    } finally {
        client.release();
        await local.end();
        await remote.end();
    }
})().catch((e) => {
    console.error('실패:', e.message);
    process.exit(1);
});
