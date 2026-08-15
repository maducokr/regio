/**
 * External Database URL 로 로컬 모의자료를 Render Postgres에 직접 적재 (배치)
 *
 * .env.render:
 *   DATABASE_URL=postgresql://...   (또는 RENDER_DATABASE_URL=)
 *
 * node upload-sample-via-pg.js
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

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

const renderEnv = loadRenderEnv();
let targetUrl = String(
    process.env.RENDER_DATABASE_URL
    || renderEnv.RENDER_DATABASE_URL
    || renderEnv.DATABASE_URL
    || ''
).trim();
if (!targetUrl) {
    console.error('❌ .env.render 에 DATABASE_URL(또는 RENDER_DATABASE_URL) 이 없습니다.');
    process.exit(1);
}
if (/localhost|127\.0\.0\.1/i.test(targetUrl)) {
    console.error('❌ 로컬 URL입니다. Render External URL 을 사용하세요.');
    process.exit(1);
}
if (!/[?&]sslmode=/.test(targetUrl)) {
    targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'sslmode=require';
}

const ID_MIN = 3;
const ID_MAX = 103;
const BATCH = 200;

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
    application_name: 'regio-sample-upload',
    statement_timeout: 0
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
    const { ensureCoreSchema } = require('./lib/ensure-core-schema');
    await ensureCoreSchema({ query: (...a) => client.query(...a) });
}

async function insertBatch(client, tableSqlPrefix, rows, valueFn, colsPerRow) {
    if (!rows.length) return;
    for (const part of chunk(rows, BATCH)) {
        const params = [];
        const valueSql = part.map((row, ri) => {
            const vals = valueFn(row);
            const ph = vals.map((_, ci) => `$${ri * colsPerRow + ci + 1}`);
            params.push(...vals);
            return `(${ph.join(',')})`;
        }).join(',');
        await client.query(`${tableSqlPrefix} VALUES ${valueSql}`, params);
        process.stdout.write('.');
    }
}

(async () => {
    const probe = await remote.query('SELECT current_database() AS db');
    console.log('Render 접속 DB:', probe.rows[0].db);

    const client = await remote.connect();
    try {
        console.log('스키마 확인/생성...');
        await ensureRemoteSchema(client);

        console.log('기존 데이터 삭제...');
        await client.query('SET statement_timeout = 0');
        await client.query('DELETE FROM activity_assignments');
        await client.query('DELETE FROM activity_records');
        await client.query('DELETE FROM play_purchases');
        await client.query('DELETE FROM member');
        await client.query('DELETE FROM activity_categories');
        await client.query(`
            CREATE TABLE IF NOT EXISTS activity_field_mapping (
                id SERIAL PRIMARY KEY,
                category_name VARCHAR(200) NOT NULL,
                field_name VARCHAR(100) NOT NULL,
                field_display_name VARCHAR(200),
                field_type VARCHAR(50) DEFAULT 'number',
                is_required BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(category_name, field_name)
            )
        `);
        await client.query('DELETE FROM activity_field_mapping');

        const categories = (await local.query(
            `SELECT id, category_name, category_group, description, created_at
             FROM activity_categories ORDER BY id`
        )).rows;
        console.log('categories', categories.length);
        await insertBatch(
            client,
            `INSERT INTO activity_categories (id, category_name, category_group, description, created_at)`,
            categories,
            (row) => [
                row.id,
                row.category_name,
                row.category_group || '기타',
                row.description || null,
                row.created_at || null
            ],
            5
        );
        console.log(' ok');

        const members = (await local.query(
            `SELECT * FROM member WHERE id BETWEEN $1 AND $2 ORDER BY id`,
            [ID_MIN, ID_MAX]
        )).rows;
        console.log('members', members.length);
        await insertBatch(
            client,
            `INSERT INTO member (${MEMBER_COLS.join(',')})`,
            members,
            (row) => MEMBER_COLS.map((c) => {
                if (c === 'baptism_name' && row[c] == null && row.baptismal_name != null) return row.baptismal_name;
                return row[c] === undefined ? null : row[c];
            }),
            MEMBER_COLS.length
        );
        console.log(' ok');

        const acts = (await local.query(
            `SELECT id, member_id, category_id, target, count,
                    catechism_guide, group_join, meeting_head, resolution, sacrament,
                    confirmation, baptism, first_communion, year_count, funeral_mass,
                    memorial_mass, funeral_attendance, conditional_baptism, conditional_communion,
                    membership, establishment, inout_count, note, activity_date, created_at, updated_at
             FROM activity_records WHERE member_id BETWEEN $1 AND $2 ORDER BY id`,
            [ID_MIN, ID_MAX]
        )).rows;
        console.log('activity_records', acts.length);
        await insertBatch(
            client,
            `INSERT INTO activity_records (
                id, member_id, category_id, target, count,
                catechism_guide, group_join, meeting_head, resolution, sacrament,
                confirmation, baptism, first_communion, year_count, funeral_mass,
                memorial_mass, funeral_attendance, conditional_baptism, conditional_communion,
                membership, establishment, inout_count, note, activity_date, created_at, updated_at
             )`,
            acts,
            (row) => [
                row.id, row.member_id, row.category_id, row.target, row.count || 0,
                row.catechism_guide || 0, row.group_join || 0, row.meeting_head || 0,
                row.resolution || 0, row.sacrament || 0, row.confirmation || 0,
                row.baptism || 0, row.first_communion || 0, row.year_count || 0,
                row.funeral_mass || 0, row.memorial_mass || 0, row.funeral_attendance || 0,
                row.conditional_baptism || 0, row.conditional_communion || 0,
                row.membership || 0, row.establishment || 0, row.inout_count || 0,
                row.note, row.activity_date, row.created_at, row.updated_at
            ],
            26
        );
        console.log(' ok');

        let assigns = [];
        try {
            assigns = (await local.query(
                `SELECT id, member_id, assigner_id, "활동배당", "활동대상자", church_name, pr_name, created_at, updated_at
                 FROM activity_assignments WHERE member_id BETWEEN $1 AND $2 ORDER BY id`,
                [ID_MIN, ID_MAX]
            )).rows;
            console.log('activity_assignments', assigns.length);
            await insertBatch(
                client,
                `INSERT INTO activity_assignments (
                    id, member_id, assigner_id, "활동배당", "활동대상자", church_name, pr_name, created_at, updated_at
                 )`,
                assigns,
                (row) => [
                    row.id, row.member_id, row.assigner_id, row['활동배당'], row['활동대상자'],
                    row.church_name, row.pr_name, row.created_at, row.updated_at
                ],
                9
            );
            console.log(' ok');
        } catch (e) {
            console.log('assignments skip:', e.message);
        }

        await client.query(`SELECT setval(pg_get_serial_sequence('activity_categories','id'), COALESCE((SELECT MAX(id) FROM activity_categories),1), true)`);
        await client.query(`SELECT setval(pg_get_serial_sequence('member','id'), COALESCE((SELECT MAX(id) FROM member),1), true)`);
        await client.query(`SELECT setval(pg_get_serial_sequence('activity_records','id'), COALESCE((SELECT MAX(id) FROM activity_records),1), true)`);
        await client.query(`SELECT setval(pg_get_serial_sequence('activity_assignments','id'), COALESCE((SELECT MAX(id) FROM activity_assignments),1), true)`);

        // 활동자료 입력 필드 매핑
        const mappings = (await local.query(
            `SELECT id, category_name, field_name, field_display_name, field_type, is_required, created_at
             FROM activity_field_mapping ORDER BY id`
        )).rows;
        console.log('activity_field_mapping', mappings.length);
        await insertBatch(
            client,
            `INSERT INTO activity_field_mapping (
                id, category_name, field_name, field_display_name, field_type, is_required, created_at
             )`,
            mappings,
            (row) => [
                row.id, row.category_name, row.field_name, row.field_display_name,
                row.field_type || 'number', !!row.is_required, row.created_at
            ],
            7
        );
        console.log(' ok');
        await client.query(`SELECT setval(pg_get_serial_sequence('activity_field_mapping','id'), COALESCE((SELECT MAX(id) FROM activity_field_mapping),1), true)`);

        const n = await client.query('SELECT COUNT(*)::int AS n FROM member');
        const tt = await client.query(`SELECT COUNT(*)::int AS n FROM member WHERE church_name ILIKE 'tt%'`);
        const a = await client.query('SELECT COUNT(*)::int AS n FROM activity_records');
        const m = await client.query('SELECT COUNT(*)::int AS n FROM activity_field_mapping');
        console.log('완료 member=', n.rows[0].n, 'tt_church=', tt.rows[0].n, 'activities=', a.rows[0].n, 'field_mappings=', m.rows[0].n);
    } finally {
        client.release();
        await local.end();
        await remote.end();
    }
})().catch((e) => {
    console.error('실패:', e.message);
    process.exit(1);
});
