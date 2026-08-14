require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');
const p = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

const ROLE = { 1: '단장', 2: '부단장', 3: '서기', 4: '회계' };

function displayName(name) {
    return String(name || '').replace(/^[TG](?:[1-6])?[1-8]/i, '') || name;
}

function parseGCode(name) {
    const trimmed = String(name || '').trim();
    const compound = trimmed.match(/^[TG]([1-6])([78])/i);
    if (compound) return parseInt(compound[2], 10);
    const simple = trimmed.match(/^[TG]([1-8])/i);
    return simple ? parseInt(simple[1], 10) : null;
}

function officerNum(code, letter) {
    const m = String(code || '').trim().toUpperCase().match(new RegExp(`^${letter}([1-4])$`));
    return m ? parseInt(m[1], 10) : null;
}

(async () => {
    // 기존 R 해제
    await p.query(
        `UPDATE member
         SET curia_officer = NULL
         WHERE id BETWEEN 3 AND 138
           AND UPPER(TRIM(COALESCE(curia_officer,''))) ~ '^R[1-4]$'`
    );

    // 꼬미시움별 C 직급자
    const cRows = (await p.query(
        `SELECT id, name, comitia_name, regia_name, curia_officer
         FROM member
         WHERE id BETWEEN 3 AND 138
           AND UPPER(TRIM(COALESCE(curia_officer,''))) ~ '^C[1-4]$'
         ORDER BY comitia_name, curia_officer, id`
    )).rows;

    const byComitia = new Map();
    for (const row of cRows) {
        const key = String(row.comitia_name || '').trim() || '(미지정)';
        if (!byComitia.has(key)) byComitia.set(key, []);
        byComitia.get(key).push(row);
    }

    const comitiaKeys = [...byComitia.keys()].sort((a, b) => a.localeCompare(b, 'ko'));
    console.log('꼬미시움:', comitiaKeys.join(', '));

    /**
     * 꼬미시움별 1~2명 선정 (앞쪽 꼬미시움은 2명, 나머지는 1명) → 총 4명 R1~R4
     * 각 꼬미시움에서는 C1 우선, 2명일 때 C2 추가
     */
    const picked = [];
    comitiaKeys.forEach((key, index) => {
        const list = byComitia.get(key) || [];
        const sorted = [...list].sort((a, b) => {
            const na = officerNum(a.curia_officer, 'C') || 9;
            const nb = officerNum(b.curia_officer, 'C') || 9;
            return na - nb || a.id - b.id;
        });
        const take = index === 0 ? 2 : 1; // 제1:2명, 제2·제3:1명씩 → 총 4명
        for (let i = 0; i < take && i < sorted.length; i += 1) {
            picked.push({ ...sorted[i], fromComitia: key });
        }
    });

    // 부족하면 남은 C에서 보충
    if (picked.length < 4) {
        const pickedIds = new Set(picked.map((x) => x.id));
        const rest = cRows
            .filter((r) => !pickedIds.has(r.id))
            .sort((a, b) => (officerNum(a.curia_officer, 'C') || 9) - (officerNum(b.curia_officer, 'C') || 9) || a.id - b.id);
        while (picked.length < 4 && rest.length) {
            const row = rest.shift();
            picked.push({ ...row, fromComitia: row.comitia_name });
        }
    }

    const regiaName = String(picked[0]?.regia_name || cRows[0]?.regia_name || '7레지아').trim() || '7레지아';
    const usedIds = new Set();

    console.log(`\n=== 레지아 직급 배정 (${regiaName}) ===`);
    for (let i = 0; i < 4; i += 1) {
        const row = picked[i];
        if (!row) {
            console.log(`R${i + 1} 배정 실패`);
            continue;
        }
        const code = `R${i + 1}`;
        usedIds.add(row.id);
        await p.query(
            `UPDATE member
             SET curia_officer = $1, regia_name = $2
             WHERE id = $3`,
            [code, regiaName, row.id]
        );
        console.log(
            `${code} ${ROLE[i + 1]} ← ${displayName(row.name)} (${row.id}, 기존${row.curia_officer}, ${row.fromComitia})`
        );
    }

    // C로 비어 버린 자리 보충 (같은 꼬미시움의 K1~K4 우선)
    console.log('\n--- 꼬미시움 C 보충 ---');
    for (const comitiaName of comitiaKeys) {
        if (comitiaName === '(미지정)') continue;
        const members = (await p.query(
            `SELECT id, name, curia_officer FROM member
             WHERE id BETWEEN 3 AND 138 AND comitia_name = $1
             ORDER BY id`,
            [comitiaName]
        )).rows;

        const haveC = new Set(
            members
                .map((m) => String(m.curia_officer || '').trim().toUpperCase())
                .filter((c) => /^C[1-4]$/.test(c))
        );

        for (const n of [1, 2, 3, 4]) {
            const code = `C${n}`;
            if (haveC.has(code)) continue;

            // 같은 꼬미시움 K번호 우선 → 아무 K → 같은 G번호 미배정
            let candidate = members.find((m) => {
                const oc = String(m.curia_officer || '').trim().toUpperCase();
                return oc === `K${n}`;
            });
            if (!candidate) {
                candidate = members.find((m) => {
                    const oc = String(m.curia_officer || '').trim().toUpperCase();
                    return /^K[1-4]$/.test(oc);
                });
            }
            if (!candidate) {
                candidate = members.find((m) => {
                    const g = parseGCode(m.name);
                    const oc = String(m.curia_officer || '').trim().toUpperCase();
                    return g === n && !/^[KCR][1-4]$/.test(oc);
                });
            }
            if (!candidate) continue;

            await p.query(`UPDATE member SET curia_officer = $1 WHERE id = $2`, [code, candidate.id]);
            console.log(`${comitiaName} ${code} ← ${displayName(candidate.name)} (${candidate.id})`);
            haveC.add(code);
        }
    }

    // K 보충
    console.log('\n--- 꾸리아 K 보충 ---');
    const curiae = (await p.query(
        `SELECT DISTINCT curia_name FROM member
         WHERE id BETWEEN 3 AND 138 AND NULLIF(TRIM(curia_name),'') IS NOT NULL`
    )).rows.map((r) => r.curia_name);

    for (const curiaName of curiae) {
        const members = (await p.query(
            `SELECT id, name, curia_officer FROM member
             WHERE id BETWEEN 3 AND 138 AND curia_name = $1
             ORDER BY id`,
            [curiaName]
        )).rows;
        const haveK = new Set(
            members
                .map((m) => String(m.curia_officer || '').trim().toUpperCase())
                .filter((c) => /^K[1-4]$/.test(c))
        );
        for (const n of [1, 2, 3, 4]) {
            const code = `K${n}`;
            if (haveK.has(code)) continue;
            const candidate = members.find((m) => {
                const g = parseGCode(m.name);
                if (g !== n) return false;
                const oc = String(m.curia_officer || '').trim().toUpperCase();
                return !/^[KCR][1-4]$/.test(oc);
            });
            if (!candidate) continue;
            await p.query(`UPDATE member SET curia_officer = $1 WHERE id = $2`, [code, candidate.id]);
            console.log(`${curiaName} ${code} ← ${displayName(candidate.name)} (${candidate.id})`);
            haveK.add(code);
        }
    }

    console.log('\n완료');
    await p.end();
})().catch((e) => { console.error(e); process.exit(1); });
