/**
 * 테스트용: 각 Pr에 설립일·승인일 부여
 * - 같은 성당·Pr 소속 전원에게 동일 값 반영
 * - 설립일: 1995-01-01 ~ 2020-12-31 (Pr별 고정 해시)
 * - 승인일: 설립일 + 30일 ~ + 3년 (Pr별 고정 해시)
 *
 * node assign-pr-founded-approved-dates.js
 */
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

// 컬럼 추가·일괄 갱신은 소유주(postgres) 권한 필요 — 앱 역할(regio_app)이면 관리 계정으로 접속
const pool = new Pool({
    user: process.env.DB_ADMIN_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || '5854',
    port: +(process.env.DB_PORT || 5432)
});

const FOUND_START = Date.UTC(1995, 0, 1);
const FOUND_END = Date.UTC(2020, 11, 31);
const FOUND_SPAN = Math.floor((FOUND_END - FOUND_START) / 86400000);

function hashStr(s) {
    let h = 2166136261;
    const str = String(s || '');
    for (let i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function toYmd(utcMs) {
    return new Date(utcMs).toISOString().slice(0, 10);
}

function pickPrDates(church, pr) {
    const h1 = hashStr(`${church}|${pr}|founded`);
    const h2 = hashStr(`${church}|${pr}|approved`);
    const foundedMs = FOUND_START + (h1 % (FOUND_SPAN + 1)) * 86400000;
    // 승인: 설립 후 30일 ~ 약 3년
    const delayDays = 30 + (h2 % (365 * 3 - 30 + 1));
    const approvedMs = foundedMs + delayDays * 86400000;
    return {
        founded: toYmd(foundedMs),
        approved: toYmd(approvedMs)
    };
}

async function ensureDateColumns(client) {
    try {
        await client.query(`ALTER TABLE member ADD COLUMN IF NOT EXISTS pr_founded_on DATE`);
        await client.query(`ALTER TABLE member ADD COLUMN IF NOT EXISTS pr_approved_on DATE`);
    } catch (err) {
        const msg = String((err && err.message) || '');
        if (!/이미 존재|already exists|duplicate/i.test(msg)
            && !/소유주|owner|must be owner/i.test(msg)) {
            throw err;
        }
        const check = await client.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_name = 'member'
               AND column_name IN ('pr_founded_on', 'pr_approved_on')`
        );
        if (check.rows.length < 2) {
            throw new Error('pr_founded_on / pr_approved_on 컬럼이 없습니다. postgres 권한으로 추가해주세요.');
        }
    }
}

async function main() {
    const client = await pool.connect();
    try {
        await ensureDateColumns(client);
        await client.query('BEGIN');

        const { rows: prs } = await client.query(
            `SELECT DISTINCT TRIM(church_name) AS church_name, TRIM(pr_name) AS pr_name
             FROM member
             WHERE NULLIF(TRIM(church_name), '') IS NOT NULL
               AND NULLIF(TRIM(pr_name), '') IS NOT NULL
             ORDER BY 1, 2`
        );

        let updatedPrs = 0;
        let updatedMembers = 0;
        const samples = [];

        for (const pr of prs) {
            const dates = pickPrDates(pr.church_name, pr.pr_name);
            const result = await client.query(
                `UPDATE member
                 SET pr_founded_on = $1,
                     pr_approved_on = $2
                 WHERE church_name = $3 AND pr_name = $4
                 RETURNING id`,
                [dates.founded, dates.approved, pr.church_name, pr.pr_name]
            );
            if (result.rowCount > 0) {
                updatedPrs += 1;
                updatedMembers += result.rowCount;
                if (samples.length < 15) {
                    samples.push({
                        church: pr.church_name,
                        pr: pr.pr_name,
                        founded: dates.founded,
                        approved: dates.approved,
                        members: result.rowCount
                    });
                }
            }
        }

        await client.query('COMMIT');
        console.log(`✅ Pr 설립일·승인일 부여 완료: ${updatedPrs}개 Pr / ${updatedMembers}명`);
        console.log('샘플:');
        for (const s of samples) {
            console.log(
                `  ${s.church} / ${s.pr} → 설립 ${s.founded} · 승인 ${s.approved} (${s.members}명)`
            );
        }
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        console.error('❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
