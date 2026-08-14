/**
 * 로컬 개발용 DB/서버 자동 준비
 * - PostgreSQL 기동 확인(가능하면 서비스 시작)
 * - 고아/중복 연결 정리
 * - regio DB 연결 확인
 * - (옵션) localhost:3000 서버 기동
 *
 * 사용:
 *   node prepare-local-db.js
 *   node prepare-local-db.js --start-server
 *   node prepare-local-db.js --json
 */
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const { Pool } = require('pg');

try {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (_) {
    /* optional */
}

const ROOT = __dirname;
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DB_NAME = process.env.DB_NAME || 'regio';
const DB_USER = process.env.DB_ADMIN_USER || process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || '5854';
const WANT_SERVER = process.argv.includes('--start-server');
const AS_JSON = process.argv.includes('--json');

const PG_SERVICE_CANDIDATES = [
    'postgresql-x64-17',
    'postgresql-x64-16',
    'postgresql-x64-15',
    'postgresql-x64-14',
    'postgresql-x64-13',
    'postgresql-x64-12'
];

function log(msg) {
    if (!AS_JSON) console.log(msg);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function tcpOpen(host, port, timeoutMs = 1500) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let done = false;
        const finish = (ok) => {
            if (done) return;
            done = true;
            try { socket.destroy(); } catch (_) { /* ignore */ }
            resolve(ok);
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
        socket.connect(port, host);
    });
}

function httpOk(url, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const req = http.get(url, { timeout: timeoutMs }, (res) => {
            res.resume();
            resolve(res.statusCode >= 200 && res.statusCode < 500);
        });
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        req.on('error', () => resolve(false));
    });
}

function findPostgresService() {
    for (const name of PG_SERVICE_CANDIDATES) {
        try {
            execFileSync('sc.exe', ['query', name], { stdio: 'ignore' });
            return name;
        } catch (_) {
            /* try next */
        }
    }
    return null;
}

function tryStartPostgresService() {
    const service = findPostgresService();
    if (!service) {
        return { ok: false, service: null, message: 'PostgreSQL Windows 서비스를 찾지 못했습니다.' };
    }
    try {
        execFileSync('sc.exe', ['query', service], { encoding: 'utf8' });
    } catch (err) {
        return { ok: false, service, message: err.message };
    }
    try {
        const query = execFileSync('sc.exe', ['query', service], { encoding: 'utf8' });
        if (/RUNNING/i.test(query)) {
            return { ok: true, service, message: '이미 실행 중', alreadyRunning: true };
        }
        execFileSync('net.exe', ['start', service], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { ok: true, service, message: '서비스 시작 요청 완료' };
    } catch (err) {
        const detail = String(err.stderr || err.stdout || err.message || '');
        return {
            ok: false,
            service,
            message: /Access is denied|액세스가 거부|5\b/i.test(detail)
                ? '관리자 권한이 없어 서비스 시작 실패. 한 번만 관리자 권한으로 PostgreSQL을 켜 두세요.'
                : detail.slice(0, 240)
        };
    }
}

async function cleanupConnections() {
    return await new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(ROOT, 'cleanup-db-connections.js'), '--all-app'], {
            cwd: ROOT,
            stdio: AS_JSON ? 'ignore' : 'inherit',
            windowsHide: true
        });
        child.on('exit', (code) => resolve(code == null ? 1 : code));
        child.on('error', () => resolve(1));
    });
}

async function verifyDb() {
    const pool = new Pool({
        user: DB_USER,
        host: DB_HOST,
        database: DB_NAME,
        password: DB_PASSWORD,
        port: DB_PORT,
        max: 1,
        connectionTimeoutMillis: 8000,
        idleTimeoutMillis: 1000,
        allowExitOnIdle: true,
        application_name: 'regio-prepare-local'
    });
    try {
        const client = await pool.connect();
        try {
            const ping = await client.query('SELECT current_database() AS db, now() AS ts');
            const stats = await client.query(`
                SELECT count(*)::int AS total,
                       count(*) FILTER (WHERE state = 'idle')::int AS idle
                FROM pg_stat_activity
                WHERE datname = current_database()
                  AND pid <> pg_backend_pid()
            `);
            const max = await client.query('SHOW max_connections');
            // 자주 쓰는 컬럼이 없으면 준비(가능하면)
            try {
                await client.query(`ALTER TABLE member ADD COLUMN IF NOT EXISTS officer_appointed_on DATE`);
                await client.query(`ALTER TABLE member ADD COLUMN IF NOT EXISTS pr_meeting_place VARCHAR(100)`);
            } catch (_) {
                /* 권한 없으면 서버 기동 시 ensureMemberExtraColumns가 처리 */
            }
            return {
                ok: true,
                db: ping.rows[0].db,
                connections: stats.rows[0].total,
                idle: stats.rows[0].idle,
                maxConnections: Number(max.rows[0].max_connections)
            };
        } finally {
            client.release();
        }
    } finally {
        await pool.end().catch(() => {});
    }
}

function startServerDetached() {
    const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
        cwd: ROOT,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        env: process.env
    });
    child.unref();
    return child.pid;
}

async function main() {
    const result = {
        postgresPortOpen: false,
        service: null,
        cleanupExitCode: null,
        db: null,
        server: { wasUp: false, started: false, ready: false, pid: null },
        ok: false,
        messages: []
    };

    result.postgresPortOpen = await tcpOpen(DB_HOST, DB_PORT);
    if (!result.postgresPortOpen) {
        log(`[1/4] PostgreSQL(${DB_HOST}:${DB_PORT}) 미응답 → 서비스 시작 시도`);
        const started = tryStartPostgresService();
        result.service = started;
        result.messages.push(started.message);
        if (started.ok) {
            for (let i = 0; i < 15; i++) {
                await sleep(1000);
                if (await tcpOpen(DB_HOST, DB_PORT)) {
                    result.postgresPortOpen = true;
                    break;
                }
            }
        }
    } else {
        log(`[1/4] PostgreSQL 포트 열림 (${DB_HOST}:${DB_PORT})`);
        result.service = { ok: true, message: '포트 응답 OK', alreadyRunning: true };
    }

    if (!result.postgresPortOpen) {
        result.messages.push('PostgreSQL에 연결할 수 없습니다. services.msc 또는 DB연결초기화.bat(관리자)를 확인하세요.');
        if (AS_JSON) console.log(JSON.stringify(result));
        process.exit(2);
    }

    log('[2/4] DB 고아/중복 연결 정리...');
    result.cleanupExitCode = await cleanupConnections();
    if (result.cleanupExitCode === 2) {
        result.messages.push('연결 슬롯 포화(53300). DB연결초기화.bat을 관리자 권한으로 실행하세요.');
        if (AS_JSON) console.log(JSON.stringify(result));
        process.exit(2);
    }

    log('[3/4] regio DB 연결 확인...');
    try {
        result.db = await verifyDb();
        log(`     DB=${result.db.db}, 연결 ${result.db.connections}/${result.db.maxConnections} (idle ${result.db.idle})`);
    } catch (err) {
        result.messages.push(`DB 연결 실패: ${err.message}`);
        if (AS_JSON) console.log(JSON.stringify(result));
        process.exit(1);
    }

    if (WANT_SERVER) {
        log('[4/4] 로컬 서버(http://localhost:3000) 확인...');
        result.server.wasUp = await httpOk('http://127.0.0.1:3000/');
        if (result.server.wasUp) {
            result.server.ready = true;
            log('     서버 이미 실행 중');
        } else {
            result.server.pid = startServerDetached();
            result.server.started = true;
            for (let i = 0; i < 20; i++) {
                await sleep(500);
                if (await httpOk('http://127.0.0.1:3000/')) {
                    result.server.ready = true;
                    break;
                }
            }
            log(result.server.ready
                ? `     서버 시작 완료 (pid ${result.server.pid})`
                : '     서버 시작 요청은 했으나 응답 대기 시간 초과');
        }
    } else {
        log('[4/4] 서버 기동 생략 (--start-server 미지정)');
    }

    result.ok = true;
    result.messages.push('로컬 DB 준비 완료');
    if (AS_JSON) {
        console.log(JSON.stringify(result));
    } else {
        console.log('✅ prepare-local-db 완료');
    }
    process.exit(0);
}

main().catch((err) => {
    if (AS_JSON) {
        console.log(JSON.stringify({ ok: false, error: err.message }));
    } else {
        console.error('❌ prepare-local-db 실패:', err.message);
    }
    process.exit(1);
});
