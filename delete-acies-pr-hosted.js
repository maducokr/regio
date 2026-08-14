/**
 * 아치에스 중 Pr 주관 기록 삭제 (꾸리아 주관만 유지)
 * node delete-acies-pr-hosted.js
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

function normalize(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

function isPrHostedAcies(note, prName) {
    const text = String(note || '');
    if (!/제목:\s*아치에스/.test(text)) return false;

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const header = lines[0] || '';
    if (/^Pr\s*[:：]/i.test(header)) return true;

    const hostMatch = text.match(/주관:\s*([^/\n]+)/);
    const host = normalize(hostMatch && hostMatch[1]);
    if (!host) return false;

    if (/^(꾸리아|꼬미시움|레지아|본당|세나뚜스)\b/.test(host)) return false;
    if (/꾸리아|꼬미시움|레지아|본당|세나뚜스/.test(host)) return false;
    if (/^Pr\b/i.test(host)) return true;

    const pr = normalize(prName);
    if (pr && host === pr) return true;

    // 주관이 Pr 호도명처럼 보이고 꾸리아명이 아닌 경우
    return true;
}

(async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`
            SELECT ar.id, ar.activity_date::text AS d, m.church_name, m.pr_name, m.name, ar.note
            FROM activity_records ar
            JOIN member m ON m.id = ar.member_id
            WHERE ar.note ILIKE '%제목:아치에스%'
            ORDER BY ar.id
        `);

        const toDelete = rows.filter((r) => isPrHostedAcies(r.note, r.pr_name));
        console.log(`아치에스 전체 ${rows.length}건 중 Pr 주관 ${toDelete.length}건 삭제`);
        for (const r of toDelete) {
            const host = (String(r.note).match(/주관:\s*([^/\n]+)/) || [])[1] || '';
            console.log(`  #${r.id} ${r.d} ${r.church_name}/${r.pr_name} 주관=${normalize(host)}`);
        }

        if (toDelete.length) {
            const ids = toDelete.map((r) => r.id);
            const del = await client.query(
                `DELETE FROM activity_records WHERE id = ANY($1::int[]) RETURNING id`,
                [ids]
            );
            console.log(`✅ 삭제 완료: ${del.rowCount}건`);
        } else {
            console.log('삭제 대상 없음');
        }

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌', e.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
})();
