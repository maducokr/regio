/**
 * PostgreSQL 고아/유휴 연결 정리
 * - node 강제 종료 후 남는 idle 백엔드 제거
 * - 서버 시작 전·DB연결초기화 전에 사용
 */
const { Pool } = require('pg');

try {
    require('dotenv').config();
} catch (_) {
    /* optional */
}

const APP_NAME = 'regio-app';
const dbName = process.env.DB_NAME || 'regio';

function buildConfig(database, { asAdmin = false } = {}) {
    const user = asAdmin
        ? (process.env.DB_ADMIN_USER || 'postgres')
        : (process.env.DB_USER || 'postgres');
    const password = asAdmin
        ? (process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || '5854')
        : (process.env.DB_PASSWORD || '5854');

    if (process.env.DATABASE_URL && !asAdmin) {
        return {
            connectionString: process.env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, `/${database}$1`),
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 1,
            connectionTimeoutMillis: 8000,
            idleTimeoutMillis: 2000,
            allowExitOnIdle: true,
            application_name: 'regio-cleanup'
        };
    }
    return {
        user,
        host: process.env.DB_HOST || 'localhost',
        database,
        password,
        port: parseInt(process.env.DB_PORT || '5432', 10),
        ssl: false,
        max: 1,
        connectionTimeoutMillis: 8000,
        idleTimeoutMillis: 2000,
        allowExitOnIdle: true,
        application_name: 'regio-cleanup'
    };
}

async function reclaim(pool, { terminateAllApp = false } = {}) {
    const statsBefore = await pool.query(`
        SELECT
            count(*)::int AS total,
            count(*) FILTER (WHERE state = 'idle')::int AS idle,
            count(*) FILTER (WHERE application_name = $1)::int AS app_conns
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
    `, [APP_NAME]);

    const before = statsBefore.rows[0];
    console.log(`📊 정리 전: 총 ${before.total}, idle ${before.idle}, ${APP_NAME} ${before.app_conns}`);

    // 1) 죽은 클라이언트의 idle 연결 / idle in transaction
    const orphanResult = await pool.query(`
        SELECT pg_terminate_backend(pid) AS terminated, pid, state, application_name
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND (
                state = 'idle'
             OR state = 'idle in transaction'
             OR state IS NULL
             OR (state = 'idle in transaction (aborted)')
          )
          AND (
                application_name = $1
             OR application_name = ''
             OR application_name IS NULL
             OR application_name LIKE 'node%'
             OR application_name = 'regio-cleanup'
          )
    `, [APP_NAME]);

    const orphanKilled = orphanResult.rows.filter((r) => r.terminated).length;

    // 2) 서버 재시작 시 이전 regio-app 연결 전부 제거
    let appKilled = 0;
    if (terminateAllApp) {
        const appResult = await pool.query(`
            SELECT pg_terminate_backend(pid) AS terminated
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND pid <> pg_backend_pid()
              AND application_name = $1
        `, [APP_NAME]);
        appKilled = appResult.rows.filter((r) => r.terminated).length;
    }

    const maxResult = await pool.query('SHOW max_connections');
    const statsAfter = await pool.query(`
        SELECT count(*)::int AS total
        FROM pg_stat_activity
        WHERE datname = current_database()
    `);

    console.log(`✅ 정리 완료: idle/orphan ${orphanKilled}개, app ${appKilled}개 종료`);
    console.log(`📊 정리 후: ${statsAfter.rows[0].total} / max ${maxResult.rows[0].max_connections}`);

    return {
        orphanKilled,
        appKilled,
        totalAfter: statsAfter.rows[0].total,
        maxConnections: Number(maxResult.rows[0].max_connections)
    };
}

async function main() {
    const terminateAllApp = process.argv.includes('--all-app');
    const databases = ['postgres', dbName];
    let lastError = null;

    for (const database of databases) {
        const pool = new Pool(buildConfig(database, { asAdmin: true }));
        try {
            console.log(`🔄 "${database}" DB 연결 정리 시도...`);
            // maintenance DB(postgres)에서는 regio 쪽 고아도 같이 정리
            if (database === 'postgres') {
                const client = await pool.connect();
                try {
                    const result = await client.query(`
                        SELECT pg_terminate_backend(pid) AS terminated
                        FROM pg_stat_activity
                        WHERE pid <> pg_backend_pid()
                          AND datname = $1
                          AND (
                                state IN ('idle', 'idle in transaction', 'idle in transaction (aborted)')
                             OR state IS NULL
                             OR application_name = $2
                          )
                    `, [dbName, APP_NAME]);
                    const killed = result.rows.filter((r) => r.terminated).length;
                    console.log(`✅ postgres 경유 regio 정리: ${killed}개 종료`);
                } finally {
                    client.release();
                }
            } else {
                await reclaim(pool, { terminateAllApp });
            }
            await pool.end();
            lastError = null;
            if (database === dbName) break;
        } catch (err) {
            lastError = err;
            console.error(`❌ "${database}" 정리 실패:`, err.message, err.code || '');
            try {
                await pool.end();
            } catch (_) {
                /* ignore */
            }
            if (err.code === '53300') {
                console.log('💡 연결 슬롯이 가득 찼습니다. PostgreSQL 서비스 재시작이 필요합니다.');
                console.log('   → DB연결초기화.bat 을 관리자 권한으로 실행하세요.');
            }
        }
    }

    if (lastError && lastError.code === '53300') {
        process.exit(2);
    }
    if (lastError) {
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { reclaim, buildConfig, APP_NAME };
