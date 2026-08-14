// member 테이블에 curia_officer(꾸리아 간부: 간부아님/K1~K4) 컬럼 추가
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

(async () => {
    const client = await pool.connect();
    try {
        await client.query('ALTER TABLE member ADD COLUMN IF NOT EXISTS curia_officer VARCHAR(50)');
        console.log('✅ member.curia_officer 컬럼 추가/확인 완료');
        const cols = await client.query(
            `SELECT column_name FROM information_schema.columns WHERE table_name='member' AND column_name='curia_officer'`
        );
        console.log('컬럼 존재:', cols.rows.length > 0);
    } finally {
        client.release();
        await pool.end();
    }
})();
