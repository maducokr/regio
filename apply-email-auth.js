require('dotenv').config();
const { Pool } = require('pg');
const { ensureEmailAuthSchema } = require('./lib/email-auth');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10)
});

async function main() {
    try {
        await ensureEmailAuthSchema(pool);
        console.log('email/google 인증 컬럼 및 email_verifications 테이블 적용 완료');
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
