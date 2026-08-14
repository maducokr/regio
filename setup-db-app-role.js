/**
 * 앱 전용 DB 역할 생성 (슈퍼유저 슬롯 고갈 방지)
 * - 앱: regio_app (일반 사용자)
 * - 정리/관리: postgres (슈퍼유저 예약 슬롯 사용 가능)
 *
 * 사용: node setup-db-app-role.js
 * 이후 .env 의 DB_USER=regio_app, DB_PASSWORD=... 로 변경
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

try {
    require('dotenv').config();
} catch (_) {
    /* optional */
}

const APP_ROLE = process.env.DB_APP_USER || 'regio_app';
const APP_PASSWORD = process.env.DB_APP_PASSWORD || process.env.DB_PASSWORD || '5854';
const DB_NAME = process.env.DB_NAME || 'regio';

const adminPool = new Pool({
    user: process.env.DB_ADMIN_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'postgres',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    max: 1,
    application_name: 'regio-setup-role'
});

async function main() {
    const client = await adminPool.connect();
    try {
        const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [APP_ROLE]);
        if (exists.rowCount === 0) {
            await client.query(`CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD.replace(/'/g, "''")}'`);
            console.log(`✅ 역할 생성: ${APP_ROLE}`);
        } else {
            await client.query(`ALTER ROLE ${APP_ROLE} WITH LOGIN PASSWORD '${APP_PASSWORD.replace(/'/g, "''")}'`);
            console.log(`✅ 역할 이미 있음, 비밀번호 갱신: ${APP_ROLE}`);
        }

        await client.query(`GRANT CONNECT ON DATABASE ${DB_NAME} TO ${APP_ROLE}`);
        await client.query(`GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${APP_ROLE}`);
        console.log(`✅ DB ${DB_NAME} 권한 부여`);
    } finally {
        client.release();
    }

    const appDb = new Pool({
        user: process.env.DB_ADMIN_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: DB_NAME,
        password: process.env.DB_PASSWORD || '5854',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        max: 1,
        application_name: 'regio-setup-role'
    });

    const c2 = await appDb.connect();
    try {
        await c2.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${APP_ROLE}`);
        await c2.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
        await c2.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);
        await c2.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${APP_ROLE}`);
        await c2.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${APP_ROLE}`);
        console.log('✅ public 스키마/테이블 권한 부여');
    } finally {
        c2.release();
        await appDb.end();
    }

    await adminPool.end();

    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        let env = fs.readFileSync(envPath, 'utf8');
        if (/^DB_USER=/m.test(env)) {
            env = env.replace(/^DB_USER=.*$/m, `DB_USER=${APP_ROLE}`);
        } else {
            env += `\nDB_USER=${APP_ROLE}\n`;
        }
        if (!/^DB_POOL_MAX=/m.test(env)) {
            env += 'DB_POOL_MAX=5\n';
        }
        fs.writeFileSync(envPath, env);
        console.log(`✅ .env 업데이트: DB_USER=${APP_ROLE}`);
    }

    console.log('\n다음: 서버끄기.bat 후 서버켜기.bat');
    console.log('정리 스크립트는 계속 postgres(슈퍼유저)로 연결해 고아 연결을 제거합니다.');
}

main().catch(async (err) => {
    console.error('❌', err.message);
    try { await adminPool.end(); } catch (_) { /* ignore */ }
    process.exit(1);
});
