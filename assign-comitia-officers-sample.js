require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { spawnSync } = require('child_process');
const { Pool } = require('pg');
const p = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 2,
    connectionTimeoutMillis: 15000,
    application_name: 'regio-assign-comitia'
});

/** 꼬미시움별 샘플 ID 구간(소속 꾸리아 식별 보조) */
const COMITIA_TARGETS = [
    { label: '제1꼬미시움', from: 3, to: 56 },
    { label: '제2꼬미시움', from: 60, to: 105 },
    { label: '제3꼬미시움', from: 106, to: 138 }
];

const ROLE = { 1: '단장', 2: '부단장', 3: '서기', 4: '회계' };

function displayName(name) {
    return String(name || '').replace(/^[TG](?:[1-6])?[1-8]/i, '') || name;
}

function kNum(code) {
    const m = String(code || '').trim().toUpperCase().match(/^K([1-4])$/);
    return m ? parseInt(m[1], 10) : null;
}

function parseGCode(name) {
    const trimmed = String(name || '').trim();
    const compound = trimmed.match(/^[TG]([1-6])([78])/i);
    if (compound) return parseInt(compound[2], 10);
    const simple = trimmed.match(/^[TG]([1-8])/i);
    return simple ? parseInt(simple[1], 10) : null;
}

/**
 * 소속 꾸리아의 K1~K4 중에서 C1~C4 선정
 * - 동일 번호(K1→C1) 우선
 * - 구간 내 나중 id 우선(한 꾸리아 간부 일괄 소진 완화)
 */
function pickComitiaOfficers(kRows, usedIds) {
    const available = kRows.filter((r) => !usedIds.has(r.id));
    const byK = { 1: [], 2: [], 3: [], 4: [] };
    for (const row of available) {
        const n = kNum(row.curia_officer);
        if (n) byK[n].push(row);
    }
    for (const n of [1, 2, 3, 4]) {
        byK[n].sort((a, b) => b.id - a.id);
    }

    const picked = {};
    const pickedIds = new Set();

    for (const n of [1, 2, 3, 4]) {
        const candidate = byK[n].find((r) => !pickedIds.has(r.id));
        if (candidate) {
            picked[n] = candidate;
            pickedIds.add(candidate.id);
        }
    }

    const leftovers = available
        .filter((r) => !pickedIds.has(r.id))
        .sort((a, b) => b.id - a.id);
    for (const n of [1, 2, 3, 4]) {
        if (picked[n]) continue;
        const next = leftovers.shift();
        if (!next) break;
        picked[n] = next;
        pickedIds.add(next.id);
    }

    return picked;
}

async function loadKOfficersForComitia(target) {
    // 1) 꼬미시움명으로 소속된 꾸리아의 K 직급자
    let kRows = (await p.query(
        `SELECT id, name, curia_name, comitia_name, curia_officer
         FROM member
         WHERE id BETWEEN 3 AND 138
           AND comitia_name = $1
           AND UPPER(TRIM(COALESCE(curia_officer,''))) ~ '^K[1-4]$'
         ORDER BY id`,
        [target.label]
    )).rows;

    // 2) 부족하면 해당 ID 구간의 꾸리아명으로 확장
    if (kRows.length < 4) {
        const curiae = (await p.query(
            `SELECT DISTINCT curia_name FROM member
             WHERE id BETWEEN $1 AND $2 AND NULLIF(TRIM(curia_name),'') IS NOT NULL`,
            [target.from, target.to]
        )).rows.map((r) => r.curia_name);

        if (curiae.length) {
            const extra = (await p.query(
                `SELECT id, name, curia_name, comitia_name, curia_officer
                 FROM member
                 WHERE id BETWEEN 3 AND 138
                   AND UPPER(TRIM(COALESCE(curia_officer,''))) ~ '^K[1-4]$'
                   AND curia_name = ANY($1::text[])
                 ORDER BY id`,
                [curiae]
            )).rows;
            const seen = new Set(kRows.map((r) => r.id));
            for (const row of extra) {
                if (!seen.has(row.id)) {
                    kRows.push(row);
                    seen.add(row.id);
                }
            }
        }
    }

    // 3) 그래도 부족하면 ID 구간 K
    if (kRows.length < 4) {
        const extra = (await p.query(
            `SELECT id, name, curia_name, comitia_name, curia_officer
             FROM member
             WHERE id BETWEEN $1 AND $2
               AND UPPER(TRIM(COALESCE(curia_officer,''))) ~ '^K[1-4]$'
             ORDER BY id`,
            [target.from, target.to]
        )).rows;
        const seen = new Set(kRows.map((r) => r.id));
        for (const row of extra) {
            if (!seen.has(row.id)) {
                kRows.push(row);
                seen.add(row.id);
            }
        }
    }

    return kRows;
}

(async () => {
    const curiaAssign = spawnSync(process.execPath, ['assign-curia-officers-sample.js'], {
        cwd: __dirname,
        encoding: 'utf8'
    });
    if (curiaAssign.status !== 0) {
        console.error(curiaAssign.stdout);
        console.error(curiaAssign.stderr);
        throw new Error('꾸리아 직급 재배정 실패');
    }
    console.log(curiaAssign.stdout);

    // 기존 C/R 해제 후 C만 재선정 (R은 이후 assign-regia에서)
    await p.query(
        `UPDATE member
         SET curia_officer = NULL
         WHERE id BETWEEN 3 AND 138
           AND UPPER(TRIM(COALESCE(curia_officer,''))) ~ '^[CR][1-4]$'`
    );

    const usedIds = new Set();

    for (const target of COMITIA_TARGETS) {
        const kRows = await loadKOfficersForComitia(target);
        const picked = pickComitiaOfficers(kRows, usedIds);
        const parts = [];

        for (const n of [1, 2, 3, 4]) {
            const row = picked[n];
            if (!row) continue;
            usedIds.add(row.id);
            await p.query(
                `UPDATE member
                 SET curia_officer = $1, comitia_name = $2
                 WHERE id = $3`,
                [`C${n}`, target.label, row.id]
            );
            parts.push(`${ROLE[n]} ${displayName(row.name)}(C${n}) · ${row.curia_name || '-'}`);
        }

        console.log(
            `${target.from}-${target.to} [${target.label}] ${parts.join(', ') || '(배정 실패)'}`
        );
    }

    // C로 승격되며 비어 버린 꾸리아 K1~K4 보충
    const curiae = (await p.query(
        `SELECT DISTINCT curia_name FROM member
         WHERE id BETWEEN 3 AND 138 AND NULLIF(TRIM(curia_name),'') IS NOT NULL`
    )).rows.map((r) => r.curia_name);

    console.log('\n--- 꾸리아 K 보충 ---');
    for (const curiaName of curiae) {
        const members = (await p.query(
            `SELECT id, name, curia_officer FROM member
             WHERE id BETWEEN 3 AND 138 AND curia_name = $1
             ORDER BY id`,
            [curiaName]
        )).rows;

        const have = new Set(
            members
                .map((m) => String(m.curia_officer || '').trim().toUpperCase())
                .filter((c) => /^K[1-4]$/.test(c))
        );

        for (const n of [1, 2, 3, 4]) {
            const code = `K${n}`;
            if (have.has(code)) continue;
            const candidate = members.find((m) => {
                const g = parseGCode(m.name);
                if (g !== n) return false;
                const oc = String(m.curia_officer || '').trim().toUpperCase();
                return !/^[KCR][1-4]$/.test(oc);
            });
            if (!candidate) continue;
            await p.query(`UPDATE member SET curia_officer = $1 WHERE id = $2`, [code, candidate.id]);
            console.log(`${curiaName} ${code} ← ${displayName(candidate.name)} (${candidate.id})`);
            have.add(code);
        }
    }

    const verify = await p.query(
        `SELECT comitia_name, curia_officer, id, name, curia_name
         FROM member
         WHERE id BETWEEN 3 AND 138
           AND UPPER(TRIM(COALESCE(curia_officer,''))) ~ '^C[1-4]$'
         ORDER BY comitia_name, curia_officer`
    );
    console.log('\n--- C 배정 확인 ---');
    for (const row of verify.rows) {
        console.log(
            `${row.comitia_name} ${row.curia_officer} ← ${displayName(row.name)} (${row.id}, ${row.curia_name})`
        );
    }

    console.log('\n완료 (샘플명단 성명 뒤에 파란 C1~C4 배지로 표시됩니다)');
    await p.end();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
