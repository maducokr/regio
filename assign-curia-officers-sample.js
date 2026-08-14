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

function parseGCode(name) {
    const trimmed = String(name || '').trim();
    const compound = trimmed.match(/^[TG]([1-6])([78])/i);
    if (compound) return parseInt(compound[2], 10);
    const simple = trimmed.match(/^[TG]([1-8])/i);
    return simple ? parseInt(simple[1], 10) : null;
}

function displayName(name) {
    return String(name || '').replace(/^[TG](?:[1-6])?[1-8]/i, '') || name;
}

const RANGES = [
    [3, 13], [17, 26], [28, 38], [42, 51], [53, 63], [67, 76], [78, 88], [92, 101],
    [103, 108], [109, 111], [112, 117], [118, 120], [121, 126], [127, 129],
    [130, 135], [136, 138]
];

const ROLE_BY_CODE = { 1: '단장', 2: '부단장', 3: '서기', 4: '회계' };

(async () => {
    // Clear previous K1-K4 among sample members (optional - only reassign)
    await p.query(
        `UPDATE member SET curia_officer = NULL
         WHERE id BETWEEN 3 AND 138
           AND UPPER(TRIM(COALESCE(curia_officer,''))) ~ '^[K][1-4]$'`
    );

    const assignments = []; // { range, curia_name, officers: {1:{id,name},...} }

    for (const [a, b] of RANGES) {
        const r = await p.query(
            `SELECT id, name, curia_name FROM member WHERE id BETWEEN $1 AND $2 ORDER BY id`,
            [a, b]
        );
        const byRole = {};
        for (const row of r.rows) {
            const code = parseGCode(row.name);
            if (code >= 1 && code <= 4 && !byRole[code]) {
                byRole[code] = row;
            }
        }
        const curiaName = r.rows[0]?.curia_name || '';
        const officers = {};
        for (const code of [1, 2, 3, 4]) {
            if (byRole[code]) {
                officers[code] = {
                    id: byRole[code].id,
                    name: byRole[code].name,
                    display: displayName(byRole[code].name)
                };
                await p.query(
                    `UPDATE member SET curia_officer = $1 WHERE id = $2`,
                    [`K${code}`, byRole[code].id]
                );
            }
        }
        assignments.push({ from: a, to: b, curia_name: curiaName, officers });
        const label = [1, 2, 3, 4]
            .map((c) => officers[c] ? `${ROLE_BY_CODE[c]}:${officers[c].display}` : null)
            .filter(Boolean)
            .join(' ');
        console.log(`${a}-${b} [${curiaName}] ${label || '(G1-G4 없음)'}`);
    }

    // Build curia_name -> officer label from ranges that have officers
    // Prefer first range that has full/partial officers for that curia
    const curiaOfficerLabel = new Map();
    for (const item of assignments) {
        const parts = [1, 2, 3, 4]
            .map((c) => item.officers[c] ? `${ROLE_BY_CODE[c]} ${item.officers[c].display}` : null)
            .filter(Boolean);
        if (!parts.length || !item.curia_name) continue;
        if (!curiaOfficerLabel.has(item.curia_name)) {
            curiaOfficerLabel.set(item.curia_name, parts.join(', '));
        }
    }

    console.log('\n--- curia display labels ---');
    for (const [k, v] of curiaOfficerLabel) {
        console.log(`${k} → ${v}`);
    }

    // Write a small JSON map file for the API to use? Better store in memory via API query.
    // Persist labels by updating a note? User asked display after curia name in roster.
    // We'll enhance API to compute this dynamically.

    await p.end();
})().catch((e) => { console.error(e); process.exit(1); });
