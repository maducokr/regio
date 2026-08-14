/**
 * 꾸리아 종합보고 다·라·마 테스트용 일자 시드
 * - K1~K4: curia_officer_elected_on (기준일 1년 이내)
 * - 일부 Pr: pr_returned_on (호도 반납)
 *
 * node assign-curia-movement-dates.js
 * node assign-curia-movement-dates.js --as-of=2026-07-16
 */
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

// 컬럼 추가·일괄 갱신은 소유주(postgres) 권한 필요
const pool = new Pool({
    user: process.env.DB_ADMIN_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || '5854',
    port: +(process.env.DB_PORT || 5432)
});

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

async function ensureColumns(client) {
    for (const sql of [
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS curia_officer_elected_on DATE`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS pr_returned_on DATE`
    ]) {
        try {
            await client.query(sql);
        } catch (err) {
            const msg = String((err && err.message) || '');
            if (!/소유주|owner|must be owner|이미 존재|already exists/i.test(msg)) throw err;
        }
    }
    const check = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'member'
           AND column_name IN ('curia_officer_elected_on', 'pr_returned_on')`
    );
    if (check.rows.length < 2) {
        throw new Error('curia_officer_elected_on / pr_returned_on 컬럼이 없습니다. DB_ADMIN(postgres)으로 추가해주세요.');
    }
}

async function main() {
    const asOf = parseAsOf();
    const rangeStart = addDaysYmd(asOf, -365);
    const client = await pool.connect();
    try {
        await ensureColumns(client);
        await client.query('BEGIN');

        const officers = await client.query(
            `SELECT id, name, curia_name, curia_officer
             FROM member
             WHERE UPPER(TRIM(curia_officer)) IN ('K1', 'K2', 'K3', 'K4')
             ORDER BY curia_name, curia_officer, id`
        );

        let electedUpdated = 0;
        for (const row of officers.rows) {
            const span = 330;
            const offset = hashStr(`${row.curia_name}|${row.curia_officer}|${row.id}`) % (span + 1);
            const electedOn = addDaysYmd(rangeStart, offset + 10);
            await client.query(
                `UPDATE member SET curia_officer_elected_on = $1::date WHERE id = $2`,
                [electedOn, row.id]
            );
            electedUpdated += 1;
        }

        // 꾸리아별 Pr 중 1개에 호도 반납일 (기간 후반)
        const prs = await client.query(
            `SELECT DISTINCT curia_name, pr_name, church_name
             FROM member
             WHERE NULLIF(TRIM(curia_name), '') IS NOT NULL
               AND NULLIF(TRIM(pr_name), '') IS NOT NULL
             ORDER BY curia_name, pr_name`
        );
        const pickedByCuria = new Map();
        for (const row of prs.rows) {
            const key = row.curia_name;
            if (pickedByCuria.has(key)) continue;
            const h = hashStr(`${row.curia_name}|${row.pr_name}`);
            if (h % 3 !== 0) continue; // 약 1/3 꾸리아만
            pickedByCuria.set(key, row);
        }

        let returnedUpdated = 0;
        for (const row of pickedByCuria.values()) {
            const offset = 280 + (hashStr(row.pr_name) % 70);
            const returnedOn = addDaysYmd(rangeStart, Math.min(offset, 360));
            const r = await client.query(
                `UPDATE member
                 SET pr_returned_on = $1::date
                 WHERE curia_name = $2 AND pr_name = $3`,
                [returnedOn, row.curia_name, row.pr_name]
            );
            returnedUpdated += r.rowCount || 0;
            console.log(`호도반납: ${row.curia_name} / ${row.pr_name} → ${returnedOn}`);
        }

        // 신설 Pr 데모: 꾸리아별 다른 Pr 1곳에 설립일을 기간 내로 맞춤
        const foundedPicked = new Map();
        for (const row of prs.rows) {
            if (pickedByCuria.has(row.curia_name)
                && pickedByCuria.get(row.curia_name).pr_name === row.pr_name) {
                continue; // 반납 Pr과 중복 방지
            }
            if (foundedPicked.has(row.curia_name)) continue;
            if (hashStr(`new|${row.curia_name}|${row.pr_name}`) % 4 !== 0) continue;
            foundedPicked.set(row.curia_name, row);
        }

        let foundedUpdated = 0;
        for (const row of foundedPicked.values()) {
            const offset = 40 + (hashStr(`founded|${row.pr_name}`) % 120);
            const foundedOn = addDaysYmd(rangeStart, offset);
            const r = await client.query(
                `UPDATE member
                 SET pr_founded_on = $1::date
                 WHERE curia_name = $2 AND pr_name = $3`,
                [foundedOn, row.curia_name, row.pr_name]
            );
            foundedUpdated += r.rowCount || 0;
            console.log(`신설: ${row.curia_name} / ${row.pr_name} → ${foundedOn}`);
        }

        await client.query('COMMIT');
        console.log(`기준일 ${asOf} (구간 ${rangeStart} ~ ${asOf})`);
        console.log(`꾸리아 간부 선출일: ${electedUpdated}명`);
        console.log(`호도 반납 반영 회원행: ${returnedUpdated}`);
        console.log(`신설 설립일 반영 회원행: ${foundedUpdated}`);
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
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
