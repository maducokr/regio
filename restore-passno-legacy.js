// member.passno를 기존 테스트 형식(폰뒷4자리+주민앞6자리)으로 복원
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

(async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT id, name, phone_last4, resident_id_front6, passno FROM member ORDER BY id`
        );

        let updated = 0;
        for (const row of rows) {
            const legacy = String(row.phone_last4 || '').padStart(4, '0').slice(-4)
                + String(row.resident_id_front6 || '').padStart(6, '0').slice(-6);
            if (!legacy || legacy.length !== 10) continue;
            if (String(row.passno || '').trim() === legacy) continue;

            await client.query('UPDATE member SET passno = $1 WHERE id = $2', [legacy, row.id]);
            console.log(`${row.name} (id=${row.id}): ${row.passno} → ${legacy}`);
            updated++;
        }

        await client.query('COMMIT');
        console.log(`\n완료: ${updated}명 passno 복원 (폰뒷4+주민앞6)`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('오류:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
})();
