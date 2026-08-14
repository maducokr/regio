/**
 * 각 Pr의 G1~G4 간부임명일(officer_appointed_on) 부여
 * 기간: 2023-01-01 ~ 2026-07-31
 *
 * node assign-pr-officer-appointed-dates.js
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

const DATE_START = Date.UTC(2023, 0, 1);
const DATE_END = Date.UTC(2026, 6, 31);
const DAY_SPAN = Math.floor((DATE_END - DATE_START) / 86400000);

const ROLE_BY_CODE = {
    1: '단장',
    2: '부단장',
    3: '서기',
    4: '회계'
};

function hashStr(s) {
    let h = 2166136261;
    const str = String(s || '');
    for (let i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function pickAppointedDate(key) {
    const dayOffset = hashStr(key) % (DAY_SPAN + 1);
    return new Date(DATE_START + dayOffset * 86400000).toISOString().slice(0, 10);
}

/** G17/G58(쁘레·아듀) 제외, G1~G4만 */
function parseOfficerCode(name) {
    const trimmed = String(name || '').trim();
    const compound78 = trimmed.match(/^[TG]([1-6])([78])/i);
    if (compound78) return null;
    const simple = trimmed.match(/^[TG]([1-4])(?!\d)/i);
    if (simple) return parseInt(simple[1], 10);
    return null;
}

/** G48→G4, G17→G1 처럼 쁘레/아듀로 바뀐 간부명을 원래 G1~G4로 복원 */
async function restoreOfficerNames(client) {
    const { rows } = await client.query(
        `SELECT id, name, church_name, pr_name
         FROM member
         WHERE NULLIF(TRIM(church_name), '') IS NOT NULL
           AND NULLIF(TRIM(pr_name), '') IS NOT NULL
           AND name ~* '^[TG][1-4][78]'
         ORDER BY id`
    );

    // 현재 Pr별 G1~G4 존재 여부
    const existing = await client.query(
        `SELECT church_name, pr_name, name FROM member
         WHERE name ~* '^[TG][1-4]' AND name !~* '^[TG][1-6][78]'`
    );
    const hasCode = new Set();
    for (const r of existing.rows) {
        const code = parseOfficerCode(r.name);
        if (code) hasCode.add(`${r.church_name}\u0001${r.pr_name}\u0001${code}`);
    }

    let restored = 0;
    for (const row of rows) {
        const m = String(row.name).match(/^([TG])([1-4])([78])(.*)$/i);
        if (!m) continue;
        const code = parseInt(m[2], 10);
        const key = `${row.church_name}\u0001${row.pr_name}\u0001${code}`;
        if (hasCode.has(key)) continue;
        const newName = `${m[1].toUpperCase()}${code}${m[4]}`;
        await client.query(`UPDATE member SET name = $1 WHERE id = $2`, [newName, row.id]);
        hasCode.add(key);
        restored += 1;
        console.log(`  이름복원 #${row.id}: ${row.name} → ${newName}`);
    }
    return restored;
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('1) 간부명(G1~G4) 복원…');
        const restored = await restoreOfficerNames(client);
        console.log(`   복원 ${restored}명`);

        const { rows } = await client.query(
            `SELECT id, name, church_name, pr_name, position, officer_appointed_on
             FROM member
             WHERE NULLIF(TRIM(church_name), '') IS NOT NULL
               AND NULLIF(TRIM(pr_name), '') IS NOT NULL
               AND name ~* '^[TG][1-4]'
             ORDER BY church_name, pr_name, id`
        );

        // Pr별로 코드당 1명(가장 앞 id)
        const chosen = new Map(); // key church|pr|code → row
        for (const row of rows) {
            const code = parseOfficerCode(row.name);
            if (!code) continue;
            const key = `${row.church_name}\u0001${row.pr_name}\u0001${code}`;
            if (!chosen.has(key)) chosen.set(key, row);
        }

        let updated = 0;
        const samples = [];

        for (const [key, row] of chosen) {
            const [, , codeStr] = key.split('\u0001');
            const code = parseInt(codeStr, 10);
            const dateKey = `${row.church_name}|${row.pr_name}|G${code}`;
            const appointed = pickAppointedDate(dateKey);
            const role = ROLE_BY_CODE[code] || '단원';

            await client.query(
                `UPDATE member
                 SET officer_appointed_on = $1::date,
                     position = $2
                 WHERE id = $3`,
                [appointed, role, row.id]
            );
            updated += 1;
            if (samples.length < 12) {
                samples.push({
                    church: row.church_name,
                    pr: row.pr_name,
                    name: row.name,
                    role,
                    appointed
                });
            }
        }

        await client.query('COMMIT');
        console.log(`✅ Pr 간부(G1~G4) 임명일 부여 완료: ${updated}명`);
        console.log('기간: 2023-01-01 ~ 2026-07-31');
        console.log('샘플:');
        for (const s of samples) {
            console.log(`  ${s.church} / ${s.pr} / ${s.name} (${s.role}) → ${s.appointed}`);
        }

        const check = await client.query(
            `SELECT COUNT(*)::int AS officers,
                    COUNT(officer_appointed_on)::int AS filled
             FROM member
             WHERE name ~* '^[TG][1-4]'
               AND name !~* '^[TG][1-6][78]'`
        );
        console.log('검증:', check.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
