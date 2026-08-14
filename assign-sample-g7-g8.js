/**
 * 샘플 회원(3~138) 중 6명에 G7/G8 부여
 * - 이미 G1~G6이면 숫자 뒤에 7 또는 8을 붙임 (예: G1 → G17, G5 → G58)
 * - 접두사가 없으면 G7/G8을 앞에 붙임
 * - position도 쁘레또리운/아듀또리움으로 맞춤
 *
 * 사용: node assign-sample-g7-g8.js
 */
const { Pool } = require('pg');

try {
    require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
} catch (_) {
    /* optional */
}

const pool = new Pool({
    user: process.env.DB_ADMIN_USER || process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    max: 1,
    application_name: 'regio-assign-g7-g8'
});

function applyG78Prefix(name, digit78) {
    const trimmed = String(name || '').trim();
    // 이미 G17/G58 형태면 끝자리만 교체
    const compound = trimmed.match(/^([TG])([1-6])([78])(.*)$/i);
    if (compound) {
        return `${compound[1].toUpperCase()}${compound[2]}${digit78}${compound[4]}`;
    }
    // G1~G6 → G17 / G58 (숫자 뒤에 7·8 붙임)
    const m = trimmed.match(/^([TG])([1-6])(.*)$/i);
    if (m) {
        return `${m[1].toUpperCase()}${m[2]}${digit78}${m[3]}`;
    }
    // 이미 G7/G8이면 숫자만 교체
    const already = trimmed.match(/^([TG])([78])(.*)$/i);
    if (already) {
        return `${already[1].toUpperCase()}${digit78}${already[3]}`;
    }
    return `G${digit78}${trimmed}`;
}

function positionLabel(digit78) {
    return digit78 === '7' ? '쁘레또리운' : '아듀또리움';
}

async function main() {
    const client = await pool.connect();
    try {
        // 이미 부여된 Gx7/Gx8 확인
        const existing = await client.query(
            `SELECT id, name, position
             FROM member
             WHERE id BETWEEN 3 AND 138
               AND (
                 name ~* '^[TG][1-6][78]'
                 OR name ~* '^[TG][78]'
               )
             ORDER BY id`
        );
        if (existing.rows.length >= 6) {
            console.log('이미 G7/G8(또는 Gx7/Gx8) 회원이 6명 이상 있습니다. 재배정하지 않습니다.');
            console.table(existing.rows);
            return;
        }

        const candidates = await client.query(
            `SELECT id, name, position
             FROM member
             WHERE id BETWEEN 3 AND 138
               AND NOT (
                 name ~* '^[TG][1-6][78]'
                 OR name ~* '^[TG][78]'
               )
             ORDER BY id`
        );

        if (candidates.rows.length < 6) {
            throw new Error(`대상 회원이 ${candidates.rows.length}명뿐입니다. 6명 이상 필요합니다.`);
        }

        const shuffled = candidates.rows.slice();
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const picked = shuffled.slice(0, 6);
        const assignments = picked.map((row, index) => ({
            ...row,
            digit78: index < 3 ? '7' : '8'
        }));

        const updated = [];
        for (const row of assignments) {
            const newName = applyG78Prefix(row.name, row.digit78);
            const newPosition = positionLabel(row.digit78);
            const result = await client.query(
                `UPDATE member
                 SET name = $1, position = $2
                 WHERE id = $3
                 RETURNING id, name, position`,
                [newName, newPosition, row.id]
            );
            updated.push({
                id: row.id,
                before: row.name,
                after: result.rows[0].name,
                position: result.rows[0].position
            });
        }

        console.log('✅ G7/G8 부여 완료 (6명)');
        console.table(updated);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
