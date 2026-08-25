const express = require('express');
const fs = require('fs');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');
const {
    isGmailAddress,
    normalizeEmail,
    maskEmail,
    isEmailConfigured,
    ensureEmailAuthSchema,
    createEmailVerification,
    verifyEmailCode,
    consumeVerificationToken
} = require('./lib/email-auth');
const {
    isGoogleLoginConfigured,
    getGoogleClientId,
    verifyGoogleCredential
} = require('./lib/google-auth');
const {
    getBillingPublicConfig,
    isPlayBillingConfigured,
    verifyPurchaseWithGoogle,
    saveVerifiedPurchase
} = require('./lib/google-play-billing');
const { patchActivityReportHtml, getActivityFieldLabelsSource, applyStartupActivityReportPatch } = require('./lib/patch-activity-report-html');
const { ensureCoreSchema } = require('./lib/ensure-core-schema');
const {
    purgeOldActivityRecords,
    startActivityRetentionScheduler,
    retentionMonths
} = require('./lib/purge-old-activities');

// 환경변수 로드 — Render에서는 Dashboard Environment만 사용 (.env 무시)
try {
    if (!process.env.RENDER) {
        require('dotenv').config({ override: false });
    }
} catch (error) {
    console.log('dotenv 패키지가 설치되지 않았습니다. 환경변수를 직접 설정하세요.');
}

const app = express();
const PORT = process.env.PORT || 3000;

applyStartupActivityReportPatch(__dirname);

// 미들웨어 설정
app.use(cors());
app.use(express.json({ limit: '8mb' }));

// 활동집계: 구버전 HTML도 한글 필드명 표시 (Render 정적 캐시·구배포 대응)
app.get('/activity-report.html', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'activity-report.html');
        const html = patchActivityReportHtml(fs.readFileSync(filePath, 'utf8'));
        res.set('Cache-Control', 'no-store');
        res.type('html').send(html);
    } catch (err) {
        console.error('activity-report.html 패치 실패:', err);
        res.sendFile(path.join(__dirname, 'activity-report.html'));
    }
});

app.get('/activity-field-labels.js', (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.type('application/javascript').send(getActivityFieldLabelsSource());
    } catch (err) {
        console.error('activity-field-labels.js 로드 실패:', err);
        res.status(404).send('// not found');
    }
});

app.use(express.static('.'));

// PostgreSQL 연결 설정 (Render / 로컬 모두 지원)
const isProduction = process.env.NODE_ENV === 'production'
    || String(process.env.RENDER || '').trim() !== '';

function resolveDatabaseUrl() {
    const candidates = [
        process.env.DATABASE_URL,
        process.env.POSTGRES_URL,
        process.env.POSTGRES_CONNECTION_STRING,
        // 일부 사용자가 Internal URL을 다른 키로 넣은 경우
        process.env.DATABASE_INTERNAL_URL,
        process.env.INTERNAL_DATABASE_URL
    ];
    for (const raw of candidates) {
        const value = String(raw || '').trim().replace(/^['"]|['"]$/g, '');
        if (value) return value;
    }
    return '';
}

function logDbEnvDiagnostics() {
    const keys = [
        'DATABASE_URL',
        'POSTGRES_URL',
        'POSTGRES_CONNECTION_STRING',
        'DATABASE_INTERNAL_URL',
        'INTERNAL_DATABASE_URL',
        'DB_HOST',
        'DB_USER',
        'DB_NAME',
        'DB_PORT',
        'DB_PASSWORD',
        'NODE_ENV',
        'RENDER',
        'RENDER_SERVICE_NAME',
        'RENDER_SERVICE_ID'
    ];
    const report = {};
    for (const key of keys) {
        const raw = process.env[key];
        if (raw == null || raw === '') {
            report[key] = { set: false };
        } else {
            report[key] = {
                set: true,
                length: String(raw).length,
                // 비밀번호 노출 없이 앞부분만
                preview: key.includes('PASSWORD') || key.includes('URL') || key.includes('CONNECTION')
                    ? `${String(raw).slice(0, 12)}…`
                    : String(raw).slice(0, 40)
            };
        }
    }
    const similarKeys = Object.keys(process.env)
        .filter((k) => /database|postgres|^db_/i.test(k))
        .sort();
    console.log('🔎 DB 관련 환경변수 진단:', JSON.stringify(report, null, 2));
    console.log('🔎 DB/Postgres 유사 키 목록:', similarKeys.length ? similarKeys.join(', ') : '(없음)');
}

function buildDbPoolConfig() {
    const databaseUrl = resolveDatabaseUrl();
    if (databaseUrl) {
        return {
            mode: 'url',
            connectionString: databaseUrl,
            // Render managed Postgres는 SSL 필요
            ssl: isProduction || /render\.com|amazonaws\.com/i.test(databaseUrl)
                ? { rejectUnauthorized: false }
                : false
        };
    }

    const host = String(process.env.DB_HOST || '').trim() || 'localhost';
    if (isProduction && (host === 'localhost' || host === '127.0.0.1' || host === '::1')) {
        console.error('❌ Render/프로덕션에서 DATABASE_URL(또는 원격 DB_HOST)이 없습니다.');
        console.error('   반드시 Web Service(regio)의 Environment에 키가 정확히 DATABASE_URL 이어야 합니다.');
        console.error('   Postgres 화면 Connect → Internal URL 복사 → Web Service Environment에 붙여넣기 → Save → Manual Deploy');
    }

    return {
        mode: 'fields',
        user: process.env.DB_USER || 'postgres',
        host,
        database: process.env.DB_NAME || 'regio',
        password: process.env.DB_PASSWORD || '5854',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        ssl: isProduction ? { rejectUnauthorized: false } : false
    };
}

logDbEnvDiagnostics();

const resolvedDb = buildDbPoolConfig();
const { mode: dbConfigMode, ...dbPoolConfig } = resolvedDb;

function describeDbTarget() {
    try {
        if (dbConfigMode === 'url') {
            const u = new URL(dbPoolConfig.connectionString.replace(/^postgres(ql)?:/i, 'http:'));
            return {
                mode: 'DATABASE_URL',
                host: u.hostname,
                port: u.port || '5432',
                database: (u.pathname || '').replace(/^\//, '') || '(default)',
                user: u.username || '(from url)',
                ssl: !!dbPoolConfig.ssl
            };
        }
        return {
            mode: 'DB_HOST',
            host: dbPoolConfig.host,
            port: String(dbPoolConfig.port),
            database: dbPoolConfig.database,
            user: dbPoolConfig.user,
            ssl: !!dbPoolConfig.ssl
        };
    } catch (_) {
        return { mode: dbConfigMode, host: '(parse-failed)' };
    }
}

console.log('🗄️ DB 연결 대상:', describeDbTarget());

// Render에서 DATABASE_URL 없이 기동하면 "live"처럼 보이지만 DB는 전부 실패 → 즉시 종료
if (isProduction && !resolveDatabaseUrl()) {
    const host = String(process.env.DB_HOST || '').trim();
    const hasRemoteHost = host && host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
    if (!hasRemoteHost) {
        console.error('');
        console.error('🛑 배포 중단: Render Web Service 환경에 DATABASE_URL 이 없습니다.');
        console.error('   1) Dashboard → PostgreSQL → Connect → Internal Database URL 복사');
        console.error('   2) Dashboard → Web Service(regio.onrender.com 쪽) → Environment');
        console.error('   3) KEY 이름: DATABASE_URL  (다른 이름·공백 불가)');
        console.error('   4) VALUE: 복사한 postgresql://... 전체 붙여넣기');
        console.error('   5) Save Changes → Manual Deploy');
        console.error('   ※ Postgres 서비스 화면에만 두면 Web 앱에는 전달되지 않습니다.');
        process.exit(1);
    }
}

// 연결 풀: 작게 유지 + 유휴 연결 빨리 반환 (강제 종료 시 고아 연결 누적 방지)
const pool = new Pool({
    ...dbPoolConfig,
    max: parseInt(process.env.DB_POOL_MAX || '5', 10),
    min: 0,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '10000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10),
    allowExitOnIdle: true,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    application_name: 'regio-app'
});

// 데이터베이스 연결 테스트
pool.on('connect', () => {
    console.log('✅ PostgreSQL 데이터베이스에 연결되었습니다.');
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL 연결 오류:', err);
});

/**
 * node 강제 종료 등으로 남은 idle/고아 백엔드 정리
 * (서버 시작 시·53300 발생 시 호출)
 */
async function reclaimOrphanedConnections() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT pg_terminate_backend(pid) AS ok
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND pid <> pg_backend_pid()
              AND application_name = 'regio-app'
              AND state IN ('idle', 'idle in transaction', 'idle in transaction (aborted)')
        `);
        const killed = result.rows.filter((r) => r.ok).length;
        if (killed > 0) {
            console.log(`🧹 고아 regio-app 연결 ${killed}개 정리됨`);
        }
        return killed;
    } finally {
        client.release();
    }
}

const ADMIN_NAME = '김학숭';
const ADMIN_PASSWORD = '1240520301';
const CATEGORY_ADMIN_EMAIL = 'maducokr@gmail.com';
// 특수문자 1자 + 영문 3자 + 숫자 4자 (예: @abc1234) — 허용 특수문자: !@#$%^&*
const PASSNO_SPECIALS = '!@#$%^&*';
const PASSNO_PATTERN = /^[!@#$%^&*][a-zA-Z]{3}\d{4}$/;
const PASSNO_FORMAT_HINT = '특수문자+영문3자+숫자4자';

function isValidPassno(value) {
    return PASSNO_PATTERN.test(String(value || '').trim());
}

function normalizePassno(value) {
    return String(value || '').trim();
}

function generatePassno(phoneLast4, seed = 0) {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const p4 = String(phoneLast4 || '0000').replace(/\D/g, '').slice(-4).padStart(4, '0');
    const n = (Number(seed) || parseInt(p4, 10) || 0) >>> 0;
    const special = PASSNO_SPECIALS[n % PASSNO_SPECIALS.length];
    let chars = '';
    for (let i = 0; i < 3; i++) {
        chars += letters[(n + i * 11) % 26];
    }
    return `${special}${chars}${p4}`;
}

function resolvePassno(password, phoneLast4, seed = 0) {
    const raw = normalizePassno(password);
    if (raw) {
        if (!isValidPassno(raw)) {
            const err = new Error('INVALID_PASSNO');
            throw err;
        }
        return raw;
    }
    return generatePassno(phoneLast4, seed);
}

async function generateUniqueResidentFront6(phoneLast4) {
    for (let i = 0; i < 100; i++) {
        const candidate = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
        const dup = await pool.query(
            'SELECT id FROM member WHERE phone_last4 = $1 AND resident_id_front6 = $2',
            [phoneLast4, candidate]
        );
        if (dup.rows.length === 0) return candidate;
    }
    throw new Error('UNIQUE_RESIDENT_FAILED');
}

async function verifyAdminAccess(name, password) {
    if (!name || !password || name !== ADMIN_NAME || password !== ADMIN_PASSWORD) {
        return false;
    }
    try {
        const result = await pool.query(
            'SELECT id FROM member WHERE name = $1 AND passno = $2',
            [name, password]
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('관리자 인증 확인 오류:', err);
        return false;
    }
}

// 데이터베이스 연결 상태 확인 (재시도 로직 포함)
async function testDatabaseConnection(retryCount = 0) {
    const maxRetries = 3;

    try {
        console.log(`🔄 데이터베이스 연결 테스트 시작... (시도 ${retryCount + 1}/${maxRetries + 1})`);
        try {
            await reclaimOrphanedConnections();
        } catch (reclaimErr) {
            console.warn('⚠️ 고아 연결 정리 건너뜀:', reclaimErr.message);
        }
        const result = await pool.query('SELECT NOW()');
        console.log('✅ 데이터베이스 연결 테스트 성공:', result.rows[0]);
        console.log('📊 연결 풀 상태:', {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount,
            max: pool.options.max
        });
    } catch (err) {
        console.error('❌ 데이터베이스 연결 테스트 실패:', err.message);
        console.error('에러 코드:', err.code);

        if ((err.code === '53300' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') && retryCount < maxRetries) {
            const delay = 2000 * (retryCount + 1);
            console.log(`⏳ ${delay}ms 후 재시도...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return testDatabaseConnection(retryCount + 1);
        }

        console.log('💡 해결 방법:');
        const target = describeDbTarget();
        if (isProduction || target.host === 'localhost' || target.host === '127.0.0.1') {
            console.log('1. Render Dashboard → Web Service → Environment 에서 DATABASE_URL 확인');
            console.log('2. PostgreSQL 인스턴스를 만들고 Web Service에 Internal Database URL 연결');
            console.log('3. DB_HOST=localhost 가 남아 있으면 삭제 (Render에서는 사용 금지)');
            console.log('4. 현재 연결 대상:', JSON.stringify(target));
        } else {
            console.log('1. node cleanup-db-connections.js 실행');
            console.log('2. PostgreSQL이 실행 중인지 확인하세요');
            console.log('3. 그래도 안 되면 DB연결초기화.bat 을 관리자 권한으로 실행하세요');
            console.log('4. 현재 연결 대상:', JSON.stringify(target));
        }
    }
}

/** 로컬에서만 허용하는 우아한 종료 (서버끄기.bat용) */
function isLocalRequest(req) {
    const ip = String(req.ip || req.socket?.remoteAddress || '');
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.endsWith('127.0.0.1');
}

/** 샘플·TEST API: 프로덕션 Deploy에서는 기본 차단 (로컬 모의와 혼동 방지) */
function allowSampleTools(req) {
    if (String(process.env.ALLOW_SAMPLE_TOOLS || '').trim() === '1') return true;
    if (process.env.NODE_ENV === 'production') return false;
    return isLocalRequest(req);
}

function rejectSampleToolsInDeploy(req, res) {
    if (allowSampleTools(req)) return false;
    res.status(403).json({
        success: false,
        error: '샘플·TEST 기능은 로컬 모의 환경 전용입니다. Deploy(실서비스)에서는 실제 회원 DB 자료만 사용합니다.'
    });
    return true;
}

app.get('/api/health', async (req, res) => {
    const target = describeDbTarget();
    let dbOk = false;
    let dbError = null;
    try {
        await pool.query('SELECT 1');
        dbOk = true;
    } catch (err) {
        dbError = err.code || err.message;
    }
    res.status(dbOk ? 200 : 503).json({
        ok: dbOk,
        service: process.env.RENDER_SERVICE_NAME || 'regio',
        database: {
            configured: !!resolveDatabaseUrl() || (target.host && target.host !== 'localhost'),
            mode: target.mode,
            host: target.host,
            error: dbError
        }
    });
});

/** Render Blueprint healthCheckPath (/health) */
app.get('/health', (req, res) => {
    res.redirect(307, '/api/health');
});

app.get('/api/runtime-mode', async (req, res) => {
    const sampleTools = allowSampleTools(req);
    const production = process.env.NODE_ENV === 'production';
    res.json({
        success: true,
        mode: sampleTools ? 'local' : 'deploy',
        build: '20260822-label-fix',
        sampleToolsAllowed: sampleTools,
        nodeEnv: process.env.NODE_ENV || 'development',
        production,
        dbHostIsLocal: (() => {
            const target = describeDbTarget();
            const h = String(target.host || '').toLowerCase();
            return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '';
        })(),
        dbMode: describeDbTarget().mode
    });
});

// 컬럼 순서 저장 API
app.post('/api/save-column-order', async (req, res) => {
    const { columns, timestamp } = req.body;
    
    if (!columns || !Array.isArray(columns)) {
        return res.status(400).json({
            success: false,
            message: '유효하지 않은 데이터입니다.'
        });
    }
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // 컬럼 정보 테이블이 없으면 생성 (번호 제외)
        await client.query(`
            CREATE TABLE IF NOT EXISTS column_order_history (
                id SERIAL PRIMARY KEY,
                column_name VARCHAR(200) NOT NULL,
                activity_description TEXT,
                original_order INTEGER NOT NULL,
                saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                batch_id VARCHAR(50)
            )
        `);
        
        const batchId = `batch_${Date.now()}`;
        
        // 각 컬럼의 정보를 저장 (번호 제외)
        for (const column of columns) {
            await client.query(`
                INSERT INTO column_order_history 
                (column_name, activity_description, original_order, batch_id)
                VALUES ($1, $2, $3, $4)
            `, [
                column.columnName,
                column.activityDescription,
                column.originalNumber,
                batchId
            ]);
        }
        
        // member 테이블에 컬럼 정보를 저장하는 별도 테이블 생성 (번호 제외)
        await client.query(`
            CREATE TABLE IF NOT EXISTS member_column_order (
                id SERIAL PRIMARY KEY,
                column_name VARCHAR(200) NOT NULL UNIQUE,
                activity_description TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 새로운 컬럼과 기존 컬럼을 구분하여 처리
        const existingColumns = [];
        const newColumns = [];
        
        for (const column of columns) {
            if (column.isNew) {
                newColumns.push(column);
            } else {
                existingColumns.push(column);
            }
        }
        
        // 기존 컬럼 정보 업데이트
        for (const column of existingColumns) {
            await client.query(`
                INSERT INTO member_column_order 
                (column_name, activity_description)
                VALUES ($1, $2)
                ON CONFLICT (column_name) 
                DO UPDATE SET 
                    activity_description = EXCLUDED.activity_description,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                column.columnName,
                column.activityDescription
            ]);
        }
        
        // 새로운 컬럼 추가
        const newColumnResults = [];
        for (const column of newColumns) {
            try {
                // 컬럼명 유효성 검사
                if (!column.columnName || column.columnName.trim() === '') {
                    throw new Error('빈 컬럼명');
                }
                
                // 특수문자나 SQL 인젝션 방지
                const columnName = column.columnName.trim().replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
                
                await client.query(`
                    INSERT INTO member_column_order 
                    (column_name, activity_description)
                    VALUES ($1, $2)
                `, [
                    columnName,
                    column.activityDescription || ''
                ]);
                
                newColumnResults.push({
                    columnName: columnName,
                    success: true
                });
                
                // 새로운 컬럼을 member 테이블에 추가하는 로직
                try {
                    // 먼저 컬럼이 이미 존재하는지 확인
                    const columnExists = await client.query(`
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'member' AND column_name = $1
                    `, [columnName]);
                    
                    if (columnExists.rows.length === 0) {
                        // 컬럼이 존재하지 않으면 추가
                        const alterQuery = `ALTER TABLE member ADD COLUMN "${columnName}" INTEGER DEFAULT 0`;
                        await client.query(alterQuery);
                        console.log(`새로운 컬럼이 member 테이블에 추가됨: ${columnName}`);
                        console.log(`실행된 SQL: ${alterQuery}`);
                    } else {
                        console.log(`컬럼이 이미 존재함: ${columnName}`);
                    }
                } catch (alterError) {
                    console.error(`member 테이블에 컬럼 추가 실패 (${columnName}):`, alterError);
                    console.error(`에러 상세:`, alterError.message);
                    // 컬럼 추가 실패 시에도 계속 진행
                }
                
            } catch (error) {
                console.error(`새로운 컬럼 추가 중 오류 (${column.columnName}):`, error);
                newColumnResults.push({
                    columnName: column.columnName,
                    success: false,
                    error: error.message
                });
                // 새로운 컬럼 추가 실패 시에도 기존 컬럼 업데이트는 계속 진행
            }
        }
        
        await client.query('COMMIT');
        
        const successCount = existingColumns.length + newColumnResults.filter(r => r.success).length;
        const failedNewColumns = newColumnResults.filter(r => !r.success);
        
        let message = `컬럼 정보가 성공적으로 저장되었습니다. (총 ${successCount}개)`;
        if (newColumnResults.length > 0) {
            const successNewCount = newColumnResults.filter(r => r.success).length;
            message += ` (새로운 컬럼 ${successNewCount}개가 member 테이블에 추가됨)`;
        }
        
        // 새로운 컬럼이 추가된 경우 즉시 확인
        let addedColumnsInfo = [];
        if (newColumnResults.filter(r => r.success).length > 0) {
            try {
                const memberColumnsCheck = await client.query(`
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'member' 
                    ORDER BY ordinal_position
                `);
                addedColumnsInfo = memberColumnsCheck.rows;
                console.log('member 테이블 현재 컬럼 목록:', addedColumnsInfo.map(col => col.column_name));
            } catch (checkError) {
                console.error('member 테이블 컬럼 확인 중 오류:', checkError);
            }
        }

        res.json({
            success: true,
            message: message,
            savedCount: successCount,
            newColumnsAdded: newColumnResults.filter(r => r.success).length,
            failedNewColumns: failedNewColumns,
            addedColumnsInfo: addedColumnsInfo,
            batchId: batchId,
            timestamp: timestamp
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('DB 저장 오류:', error);
        res.status(500).json({
            success: false,
            message: '데이터베이스 저장 중 오류가 발생했습니다.',
            error: error.message
        });
    } finally {
        client.release();
    }
});

// 저장된 컬럼 정보 조회 API
app.get('/api/get-column-order', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT column_name, activity_description, updated_at
            FROM member_column_order
            ORDER BY id ASC
        `);
        
        res.json({
            success: true,
            columns: result.rows
        });
        
    } catch (error) {
        console.error('컬럼 정보 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '컬럼 정보 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 저장 히스토리 조회 API
app.get('/api/get-save-history', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT batch_id, saved_at, COUNT(*) as column_count
            FROM column_order_history
            GROUP BY batch_id, saved_at
            ORDER BY saved_at DESC
            LIMIT 10
        `);
        
        res.json({
            success: true,
            history: result.rows
        });
        
    } catch (error) {
        console.error('저장 히스토리 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '저장 히스토리 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 회원 조회 API
app.get('/api/members', async (req, res) => {
    try {
        const currentUserName = req.query.current_user_name;
        
        let query = 'SELECT * FROM member';
        let params = [];
        
        if (currentUserName) {
            // 현재 로그인한 사용자의 정보를 먼저 조회
            const currentUserResult = await pool.query(
                'SELECT * FROM member WHERE name = $1',
                [currentUserName]
            );
            
            if (currentUserResult.rows.length > 0) {
                const currentUser = currentUserResult.rows[0];
                
                // 같은 성당과 Pr의 회원들 조회
                query = `
                    SELECT * FROM member 
                    WHERE church_name = $1 AND pr_name = $2
                    ORDER BY name
                `;
                params = [currentUser.church_name, currentUser.pr_name];
            }
        } else if (req.query.church_name && req.query.pr_name) {
            query = `
                SELECT id, name, baptism_name, church_name, pr_name, position,
                       pr_founded_on, pr_approved_on
                FROM member
                WHERE church_name = $1 AND pr_name = $2
                ORDER BY name
            `;
            params = [req.query.church_name, req.query.pr_name];
        }
        
        const result = await pool.query(query, params);
        res.json(result.rows);
        
    } catch (err) {
        console.error('회원 조회 오류:', err);
        res.status(500).json({ error: '회원 조회 중 오류가 발생했습니다.' });
    }
});

// 평의회 월례보고서 (꾸리아/꼬미시움/레지아 공통 양식, DB 있는 항목만 채움)
app.get('/api/council-monthly-report', async (req, res) => {
    try {
        const type = String(req.query.type || 'curia').trim().toLowerCase();
        const name = String(req.query.name || req.query.curia_name || '').trim();
        const TYPE_META = {
            curia: { label: '꾸리아', nameField: 'curia_name', officerPrefix: 'K', eventFilterKey: 'curia_name' },
            comitia: { label: '꼬미시움', nameField: 'comitia_name', officerPrefix: 'C', eventFilterKey: 'comitia_name' },
            regia: { label: '레지아', nameField: 'regia_name', officerPrefix: 'R', eventFilterKey: 'regia_name' }
        };
        const meta = TYPE_META[type];
        if (!meta) {
            return res.status(400).json({ success: false, error: '평의회 유형이 올바르지 않습니다.' });
        }
        if (!name) {
            return res.status(400).json({ success: false, error: `${meta.label} 명칭이 필요합니다.` });
        }

        const now = new Date();
        let year = parseInt(req.query.year, 10);
        let month = parseInt(req.query.month, 10);
        if (!year || year < 2000 || year > 2100) year = now.getFullYear();
        if (!month || month < 1 || month > 12) month = now.getMonth() + 1;

        const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
        const monthEndDate = new Date(year, month, 0);
        const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(monthEndDate.getDate()).padStart(2, '0')}`;

        const membersResult = await pool.query(
            `SELECT id, name, baptism_name, gender, position, pr_name, pr_type, curia_officer,
                    church_name, curia_name, comitia_name, regia_name, senatus_name
             FROM member
             WHERE ${meta.nameField} = $1
             ORDER BY id`,
            [name]
        );

        function displayName(memberName) {
            return String(memberName || '').replace(/^[TG](?:10|[1-6][78]|[1-9])/i, '') || memberName || '';
        }

        function memberCode(row) {
            const fromPos = getPositionCodeFromText(row.position);
            if (fromPos) return fromPos;
            const prefix = matchPositionPrefix(row.name);
            if (prefix && prefix.code >= 1 && prefix.code <= 10) return prefix.code;
            return null;
        }

        function ageBucket(prType) {
            const t = String(prType || '').trim();
            if (t === '소년') return 'junior';
            if (t === '청년') return 'youth';
            return 'adult';
        }

        const emptyAgeStats = () => ({
            pr: 0,
            active_m: 0,
            active_f: 0,
            active_t: 0,
            praetorian: 0,
            aux_m: 0,
            aux_f: 0,
            aux_t: 0,
            adjutorian: 0
        });

        const membershipByAge = {
            adult: emptyAgeStats(),
            youth: emptyAgeStats(),
            junior: emptyAgeStats()
        };
        const prSeenByAge = {
            adult: new Set(),
            youth: new Set(),
            junior: new Set()
        };

        const emptyOrgRow = () => ({
            co_count: null,
            co_adult: null,
            co_junior: null,
            cu_adult: null,
            cu_direct: null,
            cu_junior: null,
            pr_adult: null,
            pr_youth: null,
            pr_direct: null,
            pr_junior: null,
            active_adult_m: null,
            active_adult_f: null,
            active_adult_t: null,
            active_youth_m: null,
            active_youth_f: null,
            active_youth_t: null,
            active_junior_m: null,
            active_junior_f: null,
            active_junior_t: null,
            praetorian: null,
            aux_m: null,
            aux_f: null,
            aux_t: null,
            adjutorian: null
        });

        const current = {
            co_count: 0,
            co_adult: 0,
            co_junior: 0,
            cu_adult: 0,
            cu_direct: 0,
            cu_junior: 0,
            pr_adult: 0,
            pr_youth: 0,
            pr_direct: 0,
            pr_junior: 0,
            active_adult_m: 0,
            active_adult_f: 0,
            active_adult_t: 0,
            active_youth_m: 0,
            active_youth_f: 0,
            active_youth_t: 0,
            active_junior_m: 0,
            active_junior_f: 0,
            active_junior_t: 0,
            praetorian: 0,
            aux_m: 0,
            aux_f: 0,
            aux_t: 0,
            adjutorian: 0
        };

        const prSeen = { adult: new Set(), youth: new Set(), direct: new Set(), junior: new Set() };
        // 꾸리아별 Pr 유형 수집 → Cu. 수(성인/소년) 판별용
        const curiaPrTypes = new Map();
        // 레지아 소속 꼬미시움(Co.) 집계용
        const comitiaSeen = new Set();
        const senatusCounts = new Map();
        const churchCounts = new Map();

        for (const row of membersResult.rows) {
            const prName = String(row.pr_name || '').trim();
            const curiaName = String(row.curia_name || '').trim();
            const comitiaName = String(row.comitia_name || '').trim();
            const senatus = String(row.senatus_name || '').trim();
            const church = String(row.church_name || '').trim();
            if (comitiaName) comitiaSeen.add(comitiaName);
            if (senatus) senatusCounts.set(senatus, (senatusCounts.get(senatus) || 0) + 1);
            if (church) churchCounts.set(church, (churchCounts.get(church) || 0) + 1);
            const ageKey = ageBucket(row.pr_type);
            if (prName) {
                const prType = String(row.pr_type || '').trim();
                if (prType === '소년') prSeen.junior.add(prName);
                else if (prType === '직속') prSeen.direct.add(prName);
                else if (prType === '청년') prSeen.youth.add(prName);
                else prSeen.adult.add(prName);
                prSeenByAge[ageKey].add(prName);

                if (curiaName) {
                    if (!curiaPrTypes.has(curiaName)) curiaPrTypes.set(curiaName, new Map());
                    const prMap = curiaPrTypes.get(curiaName);
                    if (!prMap.has(prName)) prMap.set(prName, row.pr_type || '');
                }
            }

            const code = memberCode(row);
            const gender = String(row.gender || '').trim();
            const ageRow = membershipByAge[ageKey];

            if (code === 7) {
                current.praetorian += 1;
                ageRow.praetorian += 1;
                continue;
            }
            if (code === 8) {
                current.adjutorian += 1;
                ageRow.adjutorian += 1;
                continue;
            }
            if (code === 6) {
                if (gender === '남') {
                    current.aux_m += 1;
                    ageRow.aux_m += 1;
                } else if (gender === '여') {
                    current.aux_f += 1;
                    ageRow.aux_f += 1;
                }
                current.aux_t += 1;
                ageRow.aux_t += 1;
                continue;
            }

            const isActive = !code || (code >= 1 && code <= 5);
            if (!isActive) continue;

            if (ageKey === 'junior') {
                if (gender === '남') current.active_junior_m += 1;
                else if (gender === '여') current.active_junior_f += 1;
                current.active_junior_t += 1;
            } else if (ageKey === 'youth') {
                if (gender === '남') current.active_youth_m += 1;
                else if (gender === '여') current.active_youth_f += 1;
                current.active_youth_t += 1;
            } else {
                if (gender === '남') current.active_adult_m += 1;
                else if (gender === '여') current.active_adult_f += 1;
                current.active_adult_t += 1;
            }
            if (gender === '남') ageRow.active_m += 1;
            else if (gender === '여') ageRow.active_f += 1;
            ageRow.active_t += 1;
        }

        membershipByAge.adult.pr = prSeenByAge.adult.size;
        membershipByAge.youth.pr = prSeenByAge.youth.size;
        membershipByAge.junior.pr = prSeenByAge.junior.size;

        current.pr_adult = prSeen.adult.size;
        current.pr_youth = prSeen.youth.size;
        current.pr_direct = prSeen.direct.size;
        current.pr_junior = prSeen.junior.size;
        current.co_count = comitiaSeen.size;
        current.co_adult = comitiaSeen.size;
        current.co_junior = 0;

        // Cu. 수: 해당 꼬미시움(또는 상위) 소속 꾸리아 — 소년/직속/성인
        for (const [, prMap] of curiaPrTypes) {
            const types = [...prMap.values()].map((t) => String(t || '').trim());
            if (types.length > 0 && types.every((t) => t === '소년')) current.cu_junior += 1;
            else if (types.length > 0 && types.every((t) => t === '직속')) current.cu_direct += 1;
            else current.cu_adult += 1;
        }

        // 평의회 유형별 조직현황 컬럼 노출
        // - 꾸리아: Pr만 / 꼬미시움: Cu+Pr / 레지아: Co+Cu+Pr
        if (type === 'curia') {
            current.co_count = null;
            current.co_adult = null;
            current.co_junior = null;
            current.cu_adult = null;
            current.cu_direct = null;
            current.cu_junior = null;
        } else if (type === 'comitia') {
            current.co_count = null;
            current.co_adult = null;
            current.co_junior = null;
        }

        const prefix = meta.officerPrefix;
        const OFFICER_ROLES = [
            { key: '단장', code: `${prefix}1` },
            { key: '부단장', code: `${prefix}2` },
            { key: '서기', code: `${prefix}3` },
            { key: '회계', code: `${prefix}4` }
        ];

        const officerRows = await pool.query(
            `SELECT id, name, baptism_name, curia_officer, curia_officer_elected_on,
                    curia_approved_on, curia_meeting_on, curia_meeting_place,
                    phone_full, phone_last4, resident_id_front6
             FROM member
             WHERE ${meta.nameField} = $1
               AND UPPER(TRIM(curia_officer)) IN ($2, $3, $4, $5)
             ORDER BY id`,
            [name, `${prefix}1`, `${prefix}2`, `${prefix}3`, `${prefix}4`]
        );

        const officersByCode = new Map();
        for (const row of officerRows.rows) {
            const code = String(row.curia_officer || '').trim().toUpperCase();
            if (!officersByCode.has(code)) officersByCode.set(code, row);
        }

        const formatElectedOn = (value) => {
            if (!value) return '';
            if (typeof value === 'string') {
                const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
                if (m) return m[1];
            }
            if (value instanceof Date && !Number.isNaN(value.getTime())) {
                const useUtc = value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0;
                const y = useUtc ? value.getUTCFullYear() : value.getFullYear();
                const m = String((useUtc ? value.getUTCMonth() : value.getMonth()) + 1).padStart(2, '0');
                const d = String(useUtc ? value.getUTCDate() : value.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            }
            const s = String(value).trim();
            return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
        };

        const officers = OFFICER_ROLES.map((role) => {
            const found = officersByCode.get(role.code);
            if (!found) {
                return {
                    role: role.key,
                    name: '',
                    baptism_name: '',
                    elected_on: '',
                    birth: '',
                    address: '',
                    phone: '',
                    remark: ''
                };
            }
            const phone = String(found.phone_full || '').trim()
                || (found.phone_last4 ? `****${String(found.phone_last4).slice(-4)}` : '');
            return {
                role: role.key,
                name: displayName(found.name),
                baptism_name: found.baptism_name || '',
                elected_on: formatElectedOn(found.curia_officer_elected_on),
                birth: String(found.resident_id_front6 || '').trim(),
                address: '',
                phone,
                remark: ''
            };
        });

        // K1~K4에 등록된 꾸리아 승인일·회합 정보 수집
        let curiaApprovedOn = '';
        let curiaMeetingOn = '';
        let curiaMeetingPlace = '';
        for (const row of officerRows.rows) {
            if (!curiaApprovedOn) curiaApprovedOn = formatElectedOn(row.curia_approved_on);
            if (!curiaMeetingOn) curiaMeetingOn = formatElectedOn(row.curia_meeting_on);
            if (!curiaMeetingPlace) curiaMeetingPlace = String(row.curia_meeting_place || '').trim();
        }
        // 간부가 없어도 동일 꾸리아 회원에 저장된 값 사용
        if (!curiaApprovedOn || !curiaMeetingOn || !curiaMeetingPlace) {
            const metaRows = await pool.query(
                `SELECT curia_approved_on, curia_meeting_on, curia_meeting_place
                 FROM member
                 WHERE ${meta.nameField} = $1
                   AND (
                        curia_approved_on IS NOT NULL
                     OR curia_meeting_on IS NOT NULL
                     OR NULLIF(TRIM(curia_meeting_place), '') IS NOT NULL
                   )
                 ORDER BY id
                 LIMIT 5`,
                [name]
            );
            for (const row of metaRows.rows) {
                if (!curiaApprovedOn) curiaApprovedOn = formatElectedOn(row.curia_approved_on);
                if (!curiaMeetingOn) curiaMeetingOn = formatElectedOn(row.curia_meeting_on);
                if (!curiaMeetingPlace) curiaMeetingPlace = String(row.curia_meeting_place || '').trim();
            }
        }

        const meetingParts = curiaMeetingOn ? curiaMeetingOn.split('-') : [];
        const meetingYear = meetingParts[0] || '';
        const meetingMonth = meetingParts[1] ? String(Number(meetingParts[1])) : '';
        const meetingDay = meetingParts[2] ? String(Number(meetingParts[2])) : '';
        let meetingWeekday = '';
        if (meetingYear && meetingMonth && meetingDay) {
            const wd = ['일', '월', '화', '수', '목', '금', '토'];
            const dt = new Date(Date.UTC(Number(meetingYear), Number(meetingMonth) - 1, Number(meetingDay)));
            if (!Number.isNaN(dt.getTime())) meetingWeekday = wd[dt.getUTCDay()];
        }
        const approvedParts = curiaApprovedOn ? curiaApprovedOn.split('-') : [];

        // 행사/교육: 회원 소속이 아니라 개인활동 note의 주관·평의회 헤더 기준으로 집계
        let events = [];
        try {
            const organizerEvents = await fetchCouncilOrganizerEvents({
                type,
                name,
                startDate: monthStart,
                endDate: monthEnd
            });
            events = organizerEvents.events || [];
        } catch (eventError) {
            console.warn(`${meta.label} 월례 행사 조회 생략:`, eventError.message);
            events = [];
        }

        // 메모장 → 메모 / 주요활동내역 / 질의·건의
        let memoText = '';
        let majorActivities = '';
        let inquiries = '';
        try {
            const formatted = await fetchFormattedMemoPad({
                memberWhereSql: `m.${meta.nameField} = $1`,
                memberParams: [name],
                monthStart,
                monthEnd,
                displayNameFn: displayName
            });
            memoText = formatted.memo;
            majorActivities = formatted.major_activities;
            inquiries = formatted.inquiries;
        } catch (memoError) {
            console.warn(`${meta.label} 월례 메모 조회 생략:`, memoError.message);
        }

        // 대구 세나뚜스 양식용: 산하 회원 활동 합계
        let activityTotals = [];
        try {
            const actResult = await pool.query(
                `SELECT ac.category_name,
                        COALESCE(SUM(ar.count), 0)::int AS count,
                        COALESCE(SUM(ar.catechism_guide), 0)::int AS catechism_guide,
                        COALESCE(SUM(ar.group_join), 0)::int AS group_join,
                        COALESCE(SUM(ar.resolution), 0)::int AS resolution,
                        COALESCE(SUM(ar.sacrament), 0)::int AS sacrament,
                        COALESCE(SUM(ar.confirmation), 0)::int AS confirmation,
                        COALESCE(SUM(ar.baptism), 0)::int AS baptism,
                        COALESCE(SUM(ar.first_communion), 0)::int AS first_communion,
                        COALESCE(SUM(ar.funeral_attendance), 0)::int AS funeral_attendance,
                        COALESCE(SUM(ar.funeral_mass), 0)::int AS funeral_mass,
                        COALESCE(SUM(ar.memorial_mass), 0)::int AS memorial_mass,
                        COALESCE(SUM(ar.conditional_baptism), 0)::int AS conditional_baptism,
                        COALESCE(SUM(ar.conditional_communion), 0)::int AS conditional_communion,
                        COALESCE(SUM(ar.membership), 0)::int AS membership
                 FROM activity_records ar
                 INNER JOIN activity_categories ac ON ar.category_id = ac.id
                 INNER JOIN member m ON ar.member_id = m.id
                 WHERE m.${meta.nameField} = $1
                   AND ar.activity_date::date BETWEEN $2::date AND $3::date
                 GROUP BY ac.category_name`,
                [name, monthStart, monthEnd]
            );
            activityTotals = actResult.rows || [];
        } catch (actError) {
            console.warn(`${meta.label} 월례 활동합계 조회 생략:`, actError.message);
            activityTotals = [];
        }

        const eduLines = [];
        const legionEventLines = [];
        for (const ev of events) {
            const kind = String(ev.kind || '').trim();
            const title = String(ev.title || '').trim();
            const line = [kind, title, ev.datetime, ev.place, ev.attendance].filter(Boolean).join(' / ');
            if (!line) continue;
            if (/교육|피정|연수/.test(`${kind}${title}${ev.event_type || ''}`)) eduLines.push(line);
            else legionEventLines.push(line);
        }

        let senatusName = '';
        let maxSenatus = 0;
        for (const [sName, count] of senatusCounts) {
            if (count > maxSenatus) {
                maxSenatus = count;
                senatusName = sName;
            }
        }
        let churchName = '';
        let maxChurch = 0;
        for (const [cName, count] of churchCounts) {
            if (count > maxChurch) {
                maxChurch = count;
                churchName = cName;
            }
        }

        const membershipByAgeTotal = emptyAgeStats();
        for (const key of Object.keys(membershipByAgeTotal)) {
            membershipByAgeTotal[key] =
                membershipByAge.adult[key]
                + membershipByAge.youth[key]
                + membershipByAge.junior[key];
        }

        res.json({
            success: true,
            type,
            label: meta.label,
            form_title: `${meta.label} 월례 보고서`,
            council_name: name,
            curia_name: name,
            church_name: churchName,
            senatus_name: senatusName,
            report_no: '',
            year,
            month,
            report_day: String(now.getDate()),
            meeting: {
                year: meetingYear,
                month: meetingMonth,
                day: meetingDay,
                weekday: meetingWeekday,
                hour: '',
                minute: '',
                place: curiaMeetingPlace
            },
            attendance: {
                officers_present: '',
                officers_total: officers.filter((o) => o.name).length || '',
                members_present: '',
                members_total: membersResult.rows.length || '',
                rate_total: '',
                rate_officers: '',
                rate_members: ''
            },
            spiritual_director: '',
            spiritual_proxy: '',
            officers,
            organization: {
                previous: emptyOrgRow(),
                current,
                increase: emptyOrgRow(),
                decrease: emptyOrgRow()
            },
            membership_by_age: {
                adult: membershipByAge.adult,
                youth: membershipByAge.youth,
                junior: membershipByAge.junior,
                total: membershipByAgeTotal
            },
            new_or_dissolved: '',
            events,
            activity_totals: activityTotals,
            edu_text: eduLines.join('\n'),
            legion_event_text: legionEventLines.join('\n'),
            finance: {
                income: {
                    brought_forward: '', contribution: '', interest: '', merchandise: '', total: ''
                },
                expense: {
                    contribution: '', flowers: '', candles: '', others: ['', '', '', ''], total: ''
                },
                balance: ''
            },
            memo: memoText,
            major_activities: majorActivities,
            inquiries,
            curia_approved_on: curiaApprovedOn,
            curia_meeting_on: curiaMeetingOn,
            curia_meeting_place: curiaMeetingPlace,
            approved_y: approvedParts[0] || '',
            approved_m: approvedParts[1] ? String(Number(approvedParts[1])) : '',
            approved_d: approvedParts[2] ? String(Number(approvedParts[2])) : '',
            total_members: membersResult.rows.length,
            president_name: officers.find((o) => o.role === '단장')?.name || ''
        });
    } catch (err) {
        console.error('평의회 월례보고 조회 오류:', err);
        res.status(500).json({ success: false, error: '평의회 월례보고 조회 중 오류가 발생했습니다.' });
    }
});

// 하위호환: 꾸리아 월례보고 → 공통 API
app.get('/api/curia-monthly-report', (req, res) => {
    const qs = new URLSearchParams({
        type: 'curia',
        name: String(req.query.curia_name || req.query.name || '').trim(),
        year: String(req.query.year || ''),
        month: String(req.query.month || '')
    });
    res.redirect(307, `/api/council-monthly-report?${qs.toString()}`);
});

// 꾸리아 종합보고: 간부이동·신설·호도반납 (기준일로부터 1년 이내)
app.get('/api/curia-comprehensive-movement', async (req, res) => {
    try {
        const curiaName = String(req.query.curia_name || req.query.name || '').trim();
        const endDateRaw = String(req.query.end_date || req.query.as_of || '').trim();
        if (!curiaName) {
            return res.status(400).json({ success: false, error: '꾸리아 명칭이 필요합니다.' });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(endDateRaw)) {
            return res.status(400).json({ success: false, error: '종합보고 기준일(end_date, YYYY-MM-DD)이 필요합니다.' });
        }

        const endParts = endDateRaw.split('-').map((v) => parseInt(v, 10));
        const endUtc = Date.UTC(endParts[0], endParts[1] - 1, endParts[2]);
        const startUtc = Date.UTC(endParts[0] - 1, endParts[1] - 1, endParts[2]);
        const rangeStart = new Date(startUtc).toISOString().slice(0, 10);
        const rangeEnd = endDateRaw;

        const ROLE_BY_K = { K1: '단장', K2: '부단장', K3: '서기', K4: '회계' };
        const ROLE_BY_G = { 1: '단장', 2: '부단장', 3: '서기', 4: '회계' };

        function displayName(memberName) {
            return String(memberName || '').replace(/^[TG](?:10|[1-6][78]|[1-9])/i, '') || memberName || '';
        }

        function formatDate(value) {
            if (!value) return '';
            if (typeof value === 'string') {
                const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
                if (m) return m[1];
            }
            if (value instanceof Date && !Number.isNaN(value.getTime())) {
                const useUtc = value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0;
                const y = useUtc ? value.getUTCFullYear() : value.getFullYear();
                const m = String((useUtc ? value.getUTCMonth() : value.getMonth()) + 1).padStart(2, '0');
                const d = String(useUtc ? value.getUTCDate() : value.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            }
            const s = String(value).trim();
            return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
        }

        function parseGOfficerCode(name) {
            const trimmed = String(name || '').trim();
            if (/^[TG]([1-6])([78])/i.test(trimmed)) return null;
            const m = trimmed.match(/^[TG]([1-4])(?!\d)/i);
            return m ? parseInt(m[1], 10) : null;
        }

        const curiaOfficersResult = await pool.query(
            `SELECT id, name, baptism_name, curia_officer, curia_officer_elected_on, church_name, pr_name
             FROM member
             WHERE curia_name = $1
               AND UPPER(TRIM(curia_officer)) IN ('K1', 'K2', 'K3', 'K4')
               AND curia_officer_elected_on IS NOT NULL
               AND curia_officer_elected_on >= $2::date
               AND curia_officer_elected_on <= $3::date
             ORDER BY curia_officer_elected_on ASC, id ASC`,
            [curiaName, rangeStart, rangeEnd]
        );

        const curia_officers = curiaOfficersResult.rows.map((row) => {
            const code = String(row.curia_officer || '').trim().toUpperCase();
            return {
                role: ROLE_BY_K[code] || code,
                name: displayName(row.name),
                baptism_name: row.baptism_name || '',
                elected_on: formatDate(row.curia_officer_elected_on),
                remark: ''
            };
        });

        const prOfficersResult = await pool.query(
            `SELECT id, name, baptism_name, position, pr_name, church_name, officer_appointed_on
             FROM member
             WHERE curia_name = $1
               AND NULLIF(TRIM(pr_name), '') IS NOT NULL
               AND officer_appointed_on IS NOT NULL
               AND officer_appointed_on >= $2::date
               AND officer_appointed_on <= $3::date
             ORDER BY pr_name ASC, officer_appointed_on ASC, id ASC`,
            [curiaName, rangeStart, rangeEnd]
        );

        const pr_officers = [];
        for (const row of prOfficersResult.rows) {
            let code = parseGOfficerCode(row.name);
            if (!code) {
                const fromPos = getPositionCodeFromText(row.position);
                if (fromPos >= 1 && fromPos <= 4) code = fromPos;
            }
            if (!code) continue;
            pr_officers.push({
                pr_name: String(row.pr_name || '').trim(),
                role: ROLE_BY_G[code] || `G${code}`,
                name: displayName(row.name),
                baptism_name: row.baptism_name || '',
                appointed_on: formatDate(row.officer_appointed_on),
                remark: ''
            });
        }

        const foundedResult = await pool.query(
            `SELECT DISTINCT ON (pr_name)
                    pr_name, church_name, pr_founded_on
             FROM member
             WHERE curia_name = $1
               AND NULLIF(TRIM(pr_name), '') IS NOT NULL
               AND pr_founded_on IS NOT NULL
               AND pr_founded_on >= $2::date
               AND pr_founded_on <= $3::date
             ORDER BY pr_name, pr_founded_on ASC, id ASC`,
            [curiaName, rangeStart, rangeEnd]
        );

        const new_presidia = foundedResult.rows.map((row) => ({
            affiliation: String(row.church_name || '').trim() || curiaName,
            pr_name: String(row.pr_name || '').trim(),
            founded_on: formatDate(row.pr_founded_on),
            remark: ''
        }));

        const returnedResult = await pool.query(
            `SELECT DISTINCT ON (pr_name)
                    pr_name, church_name, pr_returned_on
             FROM member
             WHERE curia_name = $1
               AND NULLIF(TRIM(pr_name), '') IS NOT NULL
               AND pr_returned_on IS NOT NULL
               AND pr_returned_on >= $2::date
               AND pr_returned_on <= $3::date
             ORDER BY pr_name, pr_returned_on ASC, id ASC`,
            [curiaName, rangeStart, rangeEnd]
        );

        const returned_presidia = returnedResult.rows.map((row) => ({
            affiliation: String(row.church_name || '').trim() || curiaName,
            pr_name: String(row.pr_name || '').trim(),
            returned_on: formatDate(row.pr_returned_on),
            remark: ''
        }));

        res.json({
            success: true,
            curia_name: curiaName,
            range_start: rangeStart,
            range_end: rangeEnd,
            curia_officers,
            pr_officers,
            new_presidia,
            returned_presidia
        });
    } catch (err) {
        console.error('꾸리아 종합보고 간부이동 조회 오류:', err);
        res.status(500).json({ success: false, error: '꾸리아 종합보고 간부이동 조회 중 오류가 발생했습니다.' });
    }
});

// 꾸리아 종합보고: 간부 현황 · 소속 쁘레시디움
app.get('/api/curia-comprehensive-roster', async (req, res) => {
    try {
        const curiaName = String(req.query.curia_name || req.query.name || '').trim();
        if (!curiaName) {
            return res.status(400).json({ success: false, error: '꾸리아 명칭이 필요합니다.' });
        }

        const ROLE_BY_K = { K1: '단장', K2: '부단장', K3: '서기', K4: '회계' };
        const ROLE_BY_G = { 1: '단장', 2: '부단장', 3: '서기', 4: '회계' };

        function displayName(memberName) {
            return String(memberName || '').replace(/^[TG](?:10|[1-6][78]|[1-9])/i, '') || memberName || '';
        }

        function formatDate(value) {
            if (!value) return '';
            if (typeof value === 'string') {
                const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
                if (m) return m[1];
            }
            if (value instanceof Date && !Number.isNaN(value.getTime())) {
                const useUtc = value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0;
                const y = useUtc ? value.getUTCFullYear() : value.getFullYear();
                const m = String((useUtc ? value.getUTCMonth() : value.getMonth()) + 1).padStart(2, '0');
                const d = String(useUtc ? value.getUTCDate() : value.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            }
            const s = String(value).trim();
            return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
        }

        function parseGOfficerCode(name, position) {
            const trimmed = String(name || '').trim();
            if (/^[TG]([1-6])([78])/i.test(trimmed)) return null;
            const m = trimmed.match(/^[TG]([1-4])(?!\d)/i);
            if (m) return parseInt(m[1], 10);
            const fromPos = getPositionCodeFromText(position);
            return fromPos >= 1 && fromPos <= 4 ? fromPos : null;
        }

        const membersResult = await pool.query(
            `SELECT id, name, baptism_name, gender, position, pr_name, pr_type, curia_officer, curia_officer_elected_on,
                    officer_appointed_on, phone_full, phone_last4, church_name,
                    curia_meeting_on, curia_meeting_place,
                    pr_meeting_weekday, pr_meeting_hour, pr_meeting_minute, pr_meeting_place,
                    pr_founded_on, pr_approved_on
             FROM member
             WHERE curia_name = $1
             ORDER BY pr_name ASC NULLS LAST, id ASC`,
            [curiaName]
        );

        let spiritual = { role: '영적지도자', name: '', baptism_name: '', phone_home: '', phone_mobile: '', elected_on: '' };
        const officersByK = new Map();

        for (const row of membersResult.rows) {
            const pos = String(row.position || '');
            const nm = String(row.name || '');
            if (!spiritual.name && (/영적/.test(pos) || /영적지도/.test(nm))) {
                spiritual = {
                    role: '영적지도자',
                    name: displayName(row.name),
                    baptism_name: row.baptism_name || '',
                    phone_home: '',
                    phone_mobile: row.phone_full || '',
                    elected_on: formatDate(row.officer_appointed_on || row.curia_officer_elected_on)
                };
            }
            const k = String(row.curia_officer || '').trim().toUpperCase();
            if (ROLE_BY_K[k] && !officersByK.has(k)) {
                officersByK.set(k, {
                    role: ROLE_BY_K[k],
                    name: displayName(row.name),
                    baptism_name: row.baptism_name || '',
                    phone_home: '',
                    phone_mobile: row.phone_full || '',
                    elected_on: formatDate(row.curia_officer_elected_on)
                });
            }
        }

        const officers = [
            spiritual,
            officersByK.get('K1') || { role: '단장', name: '', baptism_name: '', phone_home: '', phone_mobile: '', elected_on: '' },
            officersByK.get('K2') || { role: '부단장', name: '', baptism_name: '', phone_home: '', phone_mobile: '', elected_on: '' },
            officersByK.get('K3') || { role: '서기', name: '', baptism_name: '', phone_home: '', phone_mobile: '', elected_on: '' },
            officersByK.get('K4') || { role: '회계', name: '', baptism_name: '', phone_home: '', phone_mobile: '', elected_on: '' }
        ];

        const prMap = new Map();
        const curiaStats = {
            church_name: '',
            pr_count: 0,
            active_m: 0,
            active_f: 0,
            active_t: 0,
            praetorian: 0,
            aux_m: 0,
            aux_f: 0,
            aux_t: 0,
            adjutorian: 0,
            meeting_weekday: '',
            meeting_time_place: '',
            founded_on: ''
        };

        function memberCodeFromRow(row) {
            const fromPos = getPositionCodeFromText(row.position);
            if (fromPos) return fromPos;
            const trimmed = String(row.name || '').trim();
            const m = trimmed.match(/^[TG]((?:10|[1-9]))/i);
            return m ? parseInt(m[1], 10) : null;
        }

        for (const row of membersResult.rows) {
            if (!curiaStats.church_name && row.church_name) {
                curiaStats.church_name = String(row.church_name).trim();
            }
            if (!curiaStats.founded_on) {
                curiaStats.founded_on = formatDate(row.pr_founded_on) || formatDate(row.pr_approved_on);
            }
            if (!curiaStats.meeting_weekday && row.curia_meeting_on) {
                const parts = formatDate(row.curia_meeting_on).split('-');
                if (parts.length === 3) {
                    const wd = ['일', '월', '화', '수', '목', '금', '토'];
                    const dt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
                    if (!Number.isNaN(dt.getTime())) curiaStats.meeting_weekday = wd[dt.getUTCDay()];
                }
            }
            if (!curiaStats.meeting_time_place && row.curia_meeting_place) {
                curiaStats.meeting_time_place = String(row.curia_meeting_place).trim();
            }

            const code = memberCodeFromRow(row);
            const gender = String(row.gender || '').trim();
            if (code === 7) curiaStats.praetorian += 1;
            else if (code === 8) curiaStats.adjutorian += 1;
            else if (code === 6) {
                if (gender === '남') curiaStats.aux_m += 1;
                else if (gender === '여') curiaStats.aux_f += 1;
                curiaStats.aux_t += 1;
            } else if (!code || (code >= 1 && code <= 5) || code === 9 || code === 10) {
                if (gender === '남') curiaStats.active_m += 1;
                else if (gender === '여') curiaStats.active_f += 1;
                curiaStats.active_t += 1;
            }

            const prName = String(row.pr_name || '').trim();
            if (!prName) continue;
            if (!prMap.has(prName)) {
                prMap.set(prName, {
                    pr_name: prName,
                    founded_on: formatDate(row.pr_founded_on) || formatDate(row.pr_approved_on),
                    meeting_weekday: String(row.pr_meeting_weekday || '').trim(),
                    meeting_time_place: [
                        row.pr_meeting_hour != null && row.pr_meeting_hour !== ''
                            ? `${row.pr_meeting_hour}시${row.pr_meeting_minute != null && row.pr_meeting_minute !== '' ? ` ${row.pr_meeting_minute}분` : ''}`
                            : '',
                        String(row.pr_meeting_place || '').trim()
                    ].filter(Boolean).join(' '),
                    active_m: 0,
                    active_f: 0,
                    aux_m: 0,
                    aux_f: 0,
                    officers: {
                        단장: { name: '', baptism_name: '', appointed_on: '' },
                        부단장: { name: '', baptism_name: '', appointed_on: '' },
                        서기: { name: '', baptism_name: '', appointed_on: '' },
                        회계: { name: '', baptism_name: '', appointed_on: '' }
                    }
                });
            }
            const pr = prMap.get(prName);
            if (!pr.founded_on) pr.founded_on = formatDate(row.pr_founded_on) || formatDate(row.pr_approved_on);
            if (!pr.meeting_weekday && row.pr_meeting_weekday) pr.meeting_weekday = String(row.pr_meeting_weekday).trim();
            if (code === 6) {
                if (gender === '남') pr.aux_m += 1;
                else if (gender === '여') pr.aux_f += 1;
            } else if (!code || (code >= 1 && code <= 5) || code === 9 || code === 10) {
                if (gender === '남') pr.active_m += 1;
                else if (gender === '여') pr.active_f += 1;
            }
            const gCode = parseGOfficerCode(row.name, row.position);
            if (!gCode) continue;
            const role = ROLE_BY_G[gCode];
            const slot = pr.officers[role];
            if (slot && !slot.name) {
                slot.name = displayName(row.name);
                slot.baptism_name = row.baptism_name || '';
                slot.appointed_on = formatDate(row.officer_appointed_on);
            }
        }

        const praesidia = [...prMap.values()].sort((a, b) =>
            String(a.pr_name).localeCompare(String(b.pr_name), 'ko')
        );
        curiaStats.pr_count = praesidia.length;

        res.json({
            success: true,
            curia_name: curiaName,
            officers,
            praesidia,
            curia_stats: curiaStats
        });
    } catch (err) {
        console.error('꾸리아 종합보고 명부 조회 오류:', err);
        res.status(500).json({ success: false, error: '꾸리아 종합보고 명부 조회 중 오류가 발생했습니다.' });
    }
});

// 꾸리아 종합보고: 산하 Pr 행사 집계 (레지오 행사 / 기타 행사)
app.get('/api/curia-comprehensive-events', async (req, res) => {
    try {
        const curiaName = String(req.query.curia_name || req.query.name || '').trim();
        const startDate = String(req.query.start_date || '').trim();
        const endDate = String(req.query.end_date || '').trim();
        if (!curiaName) {
            return res.status(400).json({ success: false, error: '꾸리아 명칭이 필요합니다.' });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            return res.status(400).json({ success: false, error: '시작일·종료일(YYYY-MM-DD)이 필요합니다.' });
        }

        const LEGION_EVENT_DEFS = [
            { title: '아치에스 행사', labels: ['아치에스'] },
            { title: '야외 행사', labels: ['야외 행사', '야외행사'] },
            { title: '연차 총친목회', labels: ['연차 총 친목회', '연차총친목회', '총친목회'] },
            { title: '쁘레시디움 친목회', labels: ['쁘레시디움 친목회', 'Pr친목회', 'Pr 친목회', '친목회'] },
            { title: '토론대회', labels: ['토론 대회', '토론대회'] }
        ];

        function matchLegionTitle(rawTitle) {
            const t = String(rawTitle || '').replace(/\s+/g, '').toLowerCase();
            if (!t) return null;
            for (const def of LEGION_EVENT_DEFS) {
                const hit = def.labels.some((lb) => {
                    const n = String(lb).replace(/\s+/g, '').toLowerCase();
                    if (n === '친목회') {
                        // 연차총친목회와 구분: 제목이 친목회(또는 Pr친목회류)인 경우만
                        return t === '친목회' || t.includes('쁘레시디움친목회') || t.includes('pr친목회');
                    }
                    return t.includes(n);
                });
                if (hit) return def.title;
            }
            return null;
        }

        const result = await pool.query(
            `SELECT
                m.id AS member_id,
                m.name,
                m.pr_name,
                m.church_name,
                ac.category_name,
                ar.activity_date::text AS activity_date,
                ar.note,
                ar.count
             FROM activity_records ar
             INNER JOIN activity_categories ac ON ar.category_id = ac.id
             INNER JOIN member m ON ar.member_id = m.id
             WHERE m.curia_name = $1
               AND ar.activity_date::date BETWEEN $2::date AND $3::date
               AND ac.category_name LIKE '메모및 행사-%'
               AND ac.category_name <> '메모및 행사-메모'
             ORDER BY ar.activity_date, m.pr_name, m.id`,
            [curiaName, startDate, endDate]
        );

        function parseTargetLecturer(content) {
            const text = String(content || '').trim();
            let target = '';
            let lecturer = text;
            const targetMatch = text.match(/대상\s*[:：]\s*([^/]+)/i);
            if (targetMatch) target = targetMatch[1].trim();
            const lecturerMatch = text.match(/(?:강사|강사·제목|강사제목)\s*[:：]\s*([^/]+)/i);
            if (lecturerMatch) {
                lecturer = lecturerMatch[1].trim();
            } else if (targetMatch) {
                lecturer = text.replace(targetMatch[0], '').replace(/^\s*[\/·,]\s*/, '').trim();
            }
            return { target, lecturer };
        }

        function normalizeHost(host) {
            const parsed = parseCouncilOrgLabel(host);
            return parsed.name || String(host || '').trim();
        }

        const rawEvents = [];
        const rawEducation = [];
        const rawRetreat = [];

        for (const row of result.rows) {
            const eventType = String(row.category_name || '').replace(/^메모및 행사-/, '').trim();
            if (!eventType || eventType === '메모') continue;

            const parsed = parseMemoEventNote(row.note, eventType);
            const rows = parsed.rows.length
                ? parsed.rows
                : [{
                    kind: '',
                    title: eventType,
                    host: '',
                    date: row.activity_date || '',
                    place: '',
                    content: '',
                    attendees: Number(row.count) > 0 ? String(row.count) : ''
                }];

            for (const er of rows) {
                if (!(er.kind || er.title || er.date || er.place || er.content || er.attendees)) continue;
                const kind = String(er.kind || '').trim();
                // 계획: 참석 0/미입력도 집계에 표시 (실시와 동일하게 포함)

                const datetime = normalizeEventDateText(er.date || row.activity_date || '', row.activity_date || '');
                const prName = String(row.pr_name || '').trim();
                const attendance = er.attendees || (Number(row.count) > 0 ? String(row.count) : '')
                    || (kind === '계획' ? '0' : '');

                if (eventType === '교육' || eventType === '피정및연수') {
                    const { target, lecturer } = parseTargetLecturer(er.content);
                    // 제목 없으면 내용을 교육명칭으로, 있으면 내용은 강사·제목란
                    const hasTitle = Boolean(String(er.title || '').trim());
                    const item = {
                        title: hasTitle ? er.title : (er.content || eventType),
                        datetime,
                        place: er.place || '',
                        organizer: normalizeHost(er.host) || '',
                        target,
                        attendance,
                        lecturer: hasTitle ? (lecturer || er.content || '') : '',
                        pr_name: prName,
                        event_type: eventType
                    };
                    if (item.lecturer && item.lecturer === item.title) item.lecturer = '';
                    if (eventType === '교육') rawEducation.push(item);
                    else rawRetreat.push(item);
                    continue;
                }

                const title = er.title || eventType;
                rawEvents.push({
                    title,
                    datetime,
                    place: er.place || '',
                    attendance,
                    event_type: eventType,
                    pr_name: prName,
                    kind
                });
            }
        }

        const seen = new Set();
        const deduped = [];
        for (const ev of rawEvents) {
            const key = [
                memoEventDedupeKey(ev),
                String(ev.pr_name || '').trim()
            ].join('|');
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(ev);
        }

        const legion_events = [];
        const matchedKeys = new Set();
        for (const def of LEGION_EVENT_DEFS) {
            const matches = deduped.filter((ev) => matchLegionTitle(ev.title) === def.title);
            if (!matches.length) {
                legion_events.push({
                    title: def.title,
                    datetime: '',
                    place: '',
                    attendance: '',
                    pr_name: ''
                });
                continue;
            }
            matches.sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
            for (const ev of matches) {
                matchedKeys.add([memoEventDedupeKey(ev), ev.pr_name].join('|'));
                legion_events.push({
                    title: def.title,
                    datetime: ev.datetime || '',
                    place: ev.place || '',
                    attendance: ev.attendance || '',
                    pr_name: ev.pr_name || ''
                });
            }
        }

        const other_events = deduped
            .filter((ev) => {
                const key = [memoEventDedupeKey(ev), ev.pr_name].join('|');
                if (matchedKeys.has(key)) return false;
                return !matchLegionTitle(ev.title);
            })
            .sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)))
            .map((ev) => ({
                title: ev.title || '',
                datetime: ev.datetime || '',
                place: ev.place || '',
                attendance: ev.attendance || '',
                pr_name: ev.pr_name || ''
            }));

        function dedupeEducation(list) {
            const seenEdu = new Set();
            const out = [];
            for (const ev of list) {
                // 동일 교육·피정(복수 회원 기록)은 Pr 구분 없이 1건만 표시
                const key = [
                    String(ev.title || ''),
                    String(ev.datetime || ''),
                    String(ev.place || ''),
                    String(ev.organizer || ''),
                    String(ev.attendance || ''),
                    String(ev.target || ''),
                    String(ev.lecturer || '')
                ].join('|');
                if (seenEdu.has(key)) continue;
                seenEdu.add(key);
                out.push(ev);
            }
            out.sort((a, b) => {
                const t = String(a.title || '').localeCompare(String(b.title || ''), 'ko');
                if (t) return t;
                return String(a.datetime || '').localeCompare(String(b.datetime || ''));
            });
            return out;
        }

        res.json({
            success: true,
            curia_name: curiaName,
            start_date: startDate,
            end_date: endDate,
            legion_events,
            other_events,
            education_events: dedupeEducation(rawEducation),
            retreat_events: dedupeEducation(rawRetreat)
        });
    } catch (err) {
        console.error('꾸리아 종합보고 행사 집계 오류:', err);
        res.status(500).json({ success: false, error: '꾸리아 종합보고 행사 집계 중 오류가 발생했습니다.' });
    }
});

// 평의회 행사·교육 집계 (개인활동 note 주관 / 단체행사 평의회 헤더 기준)
app.get('/api/council-event-report', async (req, res) => {
    try {
        const type = String(req.query.type || 'curia').trim().toLowerCase();
        const name = String(req.query.name || '').trim();
        const startDate = String(req.query.start_date || '').trim();
        const endDate = String(req.query.end_date || '').trim();

        if (!MEMO_EVENT_ORG_TYPE_LABELS[type]) {
            return res.status(400).json({ success: false, error: '평의회 유형이 올바르지 않습니다.' });
        }
        if (!name) {
            return res.status(400).json({ success: false, error: '평의회 명칭이 필요합니다.' });
        }
        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, error: '시작일과 종료일은 필수입니다.' });
        }

        const { events, groups } = await fetchCouncilOrganizerEvents({
            type,
            name,
            startDate: startDate.slice(0, 10),
            endDate: endDate.slice(0, 10)
        });

        res.json({
            success: true,
            type,
            label: MEMO_EVENT_ORG_TYPE_LABELS[type],
            council_name: name,
            start_date: startDate.slice(0, 10),
            end_date: endDate.slice(0, 10),
            events,
            groups
        });
    } catch (err) {
        console.error('평의회 행사 집계 오류:', err);
        res.status(500).json({ success: false, error: '평의회 행사 집계 중 오류가 발생했습니다.' });
    }
});

// Pr(쁘레시디움) 월례보고서 — 공식 양식, DB 보유 항목만 자동 기입
app.get('/api/pr-monthly-report', async (req, res) => {
    try {
        const churchName = String(req.query.church_name || '').trim();
        const prName = String(req.query.pr_name || req.query.name || '').trim();
        if (!churchName) {
            return res.status(400).json({ success: false, error: '성당 명칭이 필요합니다.' });
        }
        if (!prName) {
            return res.status(400).json({ success: false, error: 'Pr 명칭이 필요합니다.' });
        }

        const now = new Date();
        let year = parseInt(req.query.year, 10);
        let month = parseInt(req.query.month, 10);
        if (!year || year < 2000 || year > 2100) year = now.getFullYear();
        if (!month || month < 1 || month > 12) month = now.getMonth() + 1;

        const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
        const monthEndDate = new Date(year, month, 0);
        const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(monthEndDate.getDate()).padStart(2, '0')}`;

        function displayName(memberName) {
            return String(memberName || '').replace(/^[TG](?:10|[1-6][78]|[1-9])/i, '') || memberName || '';
        }

        function memberCode(row) {
            // 이름 G1~G4가 있으면 직책 문자열(아듀 등)보다 우선 — 월례 간부·임명일 누락 방지
            const prefix = matchPositionPrefix(row.name);
            if (prefix && prefix.code >= 1 && prefix.code <= 4) return prefix.code;
            const fromPos = getPositionCodeFromText(row.position);
            if (fromPos) return fromPos;
            if (prefix && prefix.code >= 1 && prefix.code <= 10) return prefix.code;
            return null;
        }

        const membersResult = await pool.query(
            `SELECT id, name, baptism_name, gender, position, pr_name, pr_type, curia_name, church_name,
                    senatus_name, officer_appointed_on, phone_full, phone_last4,
                    pr_meeting_weekday, pr_meeting_hour, pr_meeting_minute, pr_meeting_place,
                    pr_founded_on, pr_approved_on
             FROM member
             WHERE church_name = $1 AND pr_name = $2
             ORDER BY id`,
            [churchName, prName]
        );

        function formatAppointedOn(value) {
            if (!value) return '';
            if (typeof value === 'string') {
                const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
                if (m) return m[1];
            }
            if (value instanceof Date && !Number.isNaN(value.getTime())) {
                // DATE: UTC 자정은 UTC 일자, 그 외(타임존 보정값)는 로컬 일자
                const useUtc = value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0;
                const y = useUtc ? value.getUTCFullYear() : value.getFullYear();
                const m = String((useUtc ? value.getUTCMonth() : value.getMonth()) + 1).padStart(2, '0');
                const d = String(useUtc ? value.getUTCDate() : value.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            }
            const s = String(value).trim();
            if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
            return s;
        }

        function pickPrMeeting(rows) {
            // 단장 → 다른 간부 → 그 외 순으로 주회합 값이 있는 회원 사용
            const ranked = [...rows].sort((a, b) => {
                const ca = memberCode(a) || 99;
                const cb = memberCode(b) || 99;
                return ca - cb;
            });
            for (const row of ranked) {
                const weekday = String(row.pr_meeting_weekday || '').trim();
                if (!weekday) continue;
                const hourRaw = row.pr_meeting_hour;
                const minuteRaw = row.pr_meeting_minute;
                const hour = hourRaw == null || hourRaw === '' ? '' : String(Number(hourRaw));
                const minute = minuteRaw == null || minuteRaw === ''
                    ? ''
                    : String(Number(minuteRaw)).padStart(2, '0');
                const place = String(row.pr_meeting_place || '').trim();
                return { weekday, hour, minute, place };
            }
            return { weekday: '', hour: '', minute: '', place: '' };
        }

        function pickPrDates(rows) {
            const ranked = [...rows].sort((a, b) => {
                const ca = memberCode(a) || 99;
                const cb = memberCode(b) || 99;
                return ca - cb;
            });
            for (const row of ranked) {
                const founded = formatAppointedOn(row.pr_founded_on);
                const approved = formatAppointedOn(row.pr_approved_on);
                if (founded || approved) {
                    return { founded_on: founded, approved_on: approved };
                }
            }
            return { founded_on: '', approved_on: '' };
        }

        const ROLE_BY_CODE = {
            1: '단장',
            2: '부단장',
            3: '서기',
            4: '회계'
        };

        const officersByCode = new Map();
        const membership = {
            active_m: 0,
            active_f: 0,
            active_t: 0,
            praetorian: 0,
            aux_m: 0,
            aux_f: 0,
            aux_t: 0,
            adjutorian: 0
        };
        const curiaCounts = new Map();
        const g5MemberIds = [];
        const officerMemberIds = [];
        let prType = '';

        for (const row of membersResult.rows) {
            const code = memberCode(row);
            const gender = String(row.gender || '').trim();
            if (!prType && row.pr_type) prType = String(row.pr_type).trim();

            const curia = String(row.curia_name || '').trim();
            if (curia) curiaCounts.set(curia, (curiaCounts.get(curia) || 0) + 1);

            if (code >= 1 && code <= 4 && !officersByCode.has(code)) {
                officersByCode.set(code, row);
                if (row.id != null) officerMemberIds.push(row.id);
            }

            // 단원출석 분모: G5(행동단원)만 — 간부 G1~G4·협조·쁘레·아듀 제외
            if (code === 5 && row.id != null) {
                g5MemberIds.push(row.id);
            }

            if (code === 7) {
                membership.praetorian += 1;
                continue;
            }
            if (code === 8) {
                membership.adjutorian += 1;
                continue;
            }
            if (code === 6) {
                if (gender === '남') membership.aux_m += 1;
                else if (gender === '여') membership.aux_f += 1;
                membership.aux_t += 1;
                continue;
            }

            const isActive = !code || (code >= 1 && code <= 5);
            if (!isActive) continue;
            if (gender === '남') membership.active_m += 1;
            else if (gender === '여') membership.active_f += 1;
            membership.active_t += 1;
        }

        let councilName = '';
        let maxCuria = 0;
        for (const [name, count] of curiaCounts) {
            if (count > maxCuria) {
                maxCuria = count;
                councilName = name;
            }
        }

        const officers = [1, 2, 3, 4].map((code) => {
            const found = officersByCode.get(code);
            if (!found) {
                return {
                    role: ROLE_BY_CODE[code],
                    name: '',
                    baptism_name: '',
                    appointed_on: '',
                    address: '',
                    phone: '',
                    remark: ''
                };
            }
            const phone = String(found.phone_full || '').trim()
                || (found.phone_last4 ? `****${String(found.phone_last4).slice(-4)}` : '');
            return {
                role: ROLE_BY_CODE[code],
                name: displayName(found.name),
                baptism_name: found.baptism_name || '',
                appointed_on: formatAppointedOn(found.officer_appointed_on),
                address: '',
                phone,
                remark: ''
            };
        });

        const meetingInfo = pickPrMeeting(membersResult.rows);
        const prDatesInfo = pickPrDates(membersResult.rows);

        let events = [];
        try {
            const organizerEvents = await fetchCouncilOrganizerEvents({
                type: 'pr',
                name: prName,
                startDate: monthStart,
                endDate: monthEnd,
                churchName
            });
            events = organizerEvents.events || [];
        } catch (eventError) {
            console.warn('Pr 월례 행사 조회 생략:', eventError.message);
            events = [];
        }

        // 메모장 → 메모 / 주요활동내역 / 질의·건의 (개인활동보고 기록분)
        let memoText = '';
        let majorActivities = '';
        let inquiries = '';
        try {
            const formatted = await fetchFormattedMemoPad({
                memberWhereSql: 'm.church_name = $1 AND m.pr_name = $2',
                memberParams: [churchName, prName],
                monthStart,
                monthEnd,
                displayNameFn: displayName
            });
            memoText = formatted.memo;
            majorActivities = formatted.major_activities;
            inquiries = formatted.inquiries;
        } catch (memoError) {
            console.warn('Pr 월례 메모 조회 생략:', memoError.message);
        }

        // 단원현황: 보고월 조회 시 스냅샷 저장 + 전월 자료가 있으면 전월/증/감 표시
        let membershipCurrent = { ...membership };
        let membershipPrevious = blankMembershipRow();
        let membershipIncrease = blankMembershipRow();
        let membershipDecrease = blankMembershipRow();
        try {
            const today = new Date();
            const todayY = today.getFullYear();
            const todayM = today.getMonth() + 1;
            const isReportMonthCurrent = year === todayY && month === todayM;
            const isReportMonthFuture = year > todayY || (year === todayY && month > todayM);

            // 미래 월 제외: 이번 달은 갱신, 과거·이번 보고월은 조회 시 저장
            // (과거 달은 기존 스냅샷이 있으면 덮어쓰지 않음)
            if (!isReportMonthFuture) {
                await saveMonthlyOrgSnapshot({
                    scopeType: 'pr',
                    churchName,
                    orgName: prName,
                    year,
                    month,
                    stats: membership,
                    onlyIfAbsent: !isReportMonthCurrent
                });
            }

            // 과거 월이면 저장된 보고월 스냅샷 우선
            if (!isReportMonthCurrent) {
                const monthSnap = await loadMonthlyOrgSnapshot({
                    scopeType: 'pr',
                    churchName,
                    orgName: prName,
                    year,
                    month
                });
                if (monthSnap) {
                    membershipCurrent = {};
                    for (const key of PR_MEMBERSHIP_KEYS) {
                        const n = Number(monthSnap[key]);
                        membershipCurrent[key] = Number.isFinite(n) ? n : 0;
                    }
                }
            }

            const prevYm = previousYearMonth(year, month);
            const prevIsFuture = prevYm.year > todayY
                || (prevYm.year === todayY && prevYm.month > todayM);
            // 전월 스냅샷이 없으면 조회 시점에 현재 인원으로 한 번만 시드(기존 값 덮어쓰지 않음)
            if (!prevIsFuture) {
                await saveMonthlyOrgSnapshot({
                    scopeType: 'pr',
                    churchName,
                    orgName: prName,
                    year: prevYm.year,
                    month: prevYm.month,
                    stats: membership,
                    onlyIfAbsent: true
                });
            }

            const prevStats = await loadMonthlyOrgSnapshot({
                scopeType: 'pr',
                churchName,
                orgName: prName,
                year: prevYm.year,
                month: prevYm.month
            });
            if (prevStats) {
                membershipPrevious = {};
                for (const key of PR_MEMBERSHIP_KEYS) {
                    const n = Number(prevStats[key]);
                    membershipPrevious[key] = Number.isFinite(n) ? n : null;
                }
                const changes = buildMembershipChangeRows(membershipCurrent, membershipPrevious);
                membershipIncrease = changes.increase;
                membershipDecrease = changes.decrease;
            }
        } catch (snapError) {
            console.warn('Pr 단원현황 전월 비교 생략:', snapError.message);
        }

        // 대구 세나뚜스 양식용: 해당 월 Pr 활동 합계
        let activityTotals = [];
        try {
            const actResult = await pool.query(
                `SELECT ac.category_name,
                        COALESCE(SUM(ar.count), 0)::int AS count,
                        COALESCE(SUM(ar.catechism_guide), 0)::int AS catechism_guide,
                        COALESCE(SUM(ar.group_join), 0)::int AS group_join,
                        COALESCE(SUM(ar.resolution), 0)::int AS resolution,
                        COALESCE(SUM(ar.sacrament), 0)::int AS sacrament,
                        COALESCE(SUM(ar.confirmation), 0)::int AS confirmation,
                        COALESCE(SUM(ar.baptism), 0)::int AS baptism,
                        COALESCE(SUM(ar.first_communion), 0)::int AS first_communion,
                        COALESCE(SUM(ar.funeral_attendance), 0)::int AS funeral_attendance,
                        COALESCE(SUM(ar.funeral_mass), 0)::int AS funeral_mass,
                        COALESCE(SUM(ar.memorial_mass), 0)::int AS memorial_mass,
                        COALESCE(SUM(ar.conditional_baptism), 0)::int AS conditional_baptism,
                        COALESCE(SUM(ar.conditional_communion), 0)::int AS conditional_communion,
                        COALESCE(SUM(ar.membership), 0)::int AS membership
                 FROM activity_records ar
                 INNER JOIN activity_categories ac ON ar.category_id = ac.id
                 INNER JOIN member m ON ar.member_id = m.id
                 WHERE m.church_name = $1 AND m.pr_name = $2
                   AND ar.activity_date::date BETWEEN $3::date AND $4::date
                 GROUP BY ac.category_name`,
                [churchName, prName, monthStart, monthEnd]
            );
            activityTotals = actResult.rows || [];
        } catch (actError) {
            console.warn('Pr 월례 활동합계 조회 생략:', actError.message);
            activityTotals = [];
        }

        // 세나뚜스(다수 소속)
        const senatusCounts = new Map();
        for (const row of membersResult.rows) {
            const s = String(row.senatus_name || '').trim();
            if (!s) continue;
            senatusCounts.set(s, (senatusCounts.get(s) || 0) + 1);
        }
        let senatusName = '';
        let maxSenatus = 0;
        for (const [name, count] of senatusCounts) {
            if (count > maxSenatus) {
                maxSenatus = count;
                senatusName = name;
            }
        }

        // 교육·피정 / 레지오·기타행사 텍스트 (대구 양식 4·5)
        const eduLines = [];
        const legionEventLines = [];
        for (const ev of events) {
            const kind = String(ev.kind || '').trim();
            const title = String(ev.title || '').trim();
            const line = [kind, title, ev.datetime, ev.place, ev.attendance].filter(Boolean).join(' / ');
            if (!line) continue;
            if (/교육|피정|연수/.test(`${kind}${title}`)) eduLines.push(line);
            else legionEventLines.push(line);
        }

        // 증감(순증) — 대구 양식은 증/감 분리 없이 한 행
        const membershipDelta = blankMembershipRow();
        const hasPrev = PR_MEMBERSHIP_KEYS.some((k) => membershipPrevious[k] !== null && membershipPrevious[k] !== undefined);
        if (hasPrev) {
            for (const key of PR_MEMBERSHIP_KEYS) {
                const cur = Number(membershipCurrent[key]);
                const prev = Number(membershipPrevious[key]);
                if (!Number.isFinite(cur) || !Number.isFinite(prev)) {
                    membershipDelta[key] = null;
                } else {
                    membershipDelta[key] = cur - prev;
                }
            }
        }

        const membershipBlock = {
            previous: membershipPrevious,
            current: membershipCurrent,
            increase: membershipIncrease,
            decrease: membershipDecrease,
            delta: membershipDelta
        };

        // 출석: 단원 = 출석한 G5 / Pr 전체 G5
        // (주회 출석부 없음 → 해당 월 활동기록이 있는 회원을 출석으로 산정)
        let g5Present = 0;
        let officersPresent = 0;
        try {
            const attendIds = [...new Set([...g5MemberIds, ...officerMemberIds])];
            if (attendIds.length) {
                const presentResult = await pool.query(
                    `SELECT DISTINCT ar.member_id
                     FROM activity_records ar
                     WHERE ar.member_id = ANY($1::int[])
                       AND ar.activity_date::date BETWEEN $2::date AND $3::date`,
                    [attendIds, monthStart, monthEnd]
                );
                const presentSet = new Set(presentResult.rows.map((r) => Number(r.member_id)));
                g5Present = g5MemberIds.filter((id) => presentSet.has(Number(id))).length;
                officersPresent = officerMemberIds.filter((id) => presentSet.has(Number(id))).length;
            }
        } catch (attError) {
            console.warn('Pr 월례 출석 산정 생략:', attError.message);
        }

        const g5Total = g5MemberIds.length;
        const officersTotal = officers.filter((o) => o.name).length;
        const memberRate = g5Total > 0 ? Math.round((g5Present / g5Total) * 100) : '';

        res.json({
            success: true,
            form_title: '레지오 마리애 쁘레시디움 월례 보고서',
            church_name: churchName,
            pr_name: prName,
            senatus_name: senatusName,
            year,
            month,
            report_day: monthEndDate.getDate(),
            meeting_from: '',
            meeting_to: '',
            meeting: meetingInfo,
            pr_founded_on: prDatesInfo.founded_on,
            pr_approved_on: prDatesInfo.approved_on,
            attendance: {
                officers_present: officersTotal ? officersPresent : '',
                officers_total: officersTotal || '',
                members_present: g5Total ? g5Present : '',
                members_total: g5Total || '',
                duty_days: '',
                attended_days: '',
                rate: memberRate
            },
            spiritual_director: '',
            officers,
            membership: membershipBlock,
            events,
            activity_totals: activityTotals,
            edu_text: eduLines.join('\n'),
            legion_event_text: legionEventLines.join('\n'),
            finance: {
                brought_forward: '',
                income: '',
                expense: '',
                balance: '',
                expense_detail: { contribution: '', flowers: '', others: '' }
            },
            memo: memoText,
            major_activities: majorActivities,
            inquiries,
            council_name: councilName,
            president_name: officers.find((o) => o.role === '단장')?.name || '',
            affiliation: prType || '',
            total_members: membersResult.rows.length
        });
    } catch (err) {
        console.error('Pr 월례보고 오류:', err);
        res.status(500).json({ success: false, error: 'Pr 월례보고 조회 중 오류가 발생했습니다.' });
    }
});

app.get('/api/council-organization', async (req, res) => {
    try {
        const type = String(req.query.type || 'curia').trim().toLowerCase();
        const name = String(req.query.name || req.query.curia_name || '').trim();
        if (!name) {
            return res.status(400).json({ success: false, error: '평의회 명칭이 필요합니다.' });
        }
        if (!['curia', 'comitia', 'regia'].includes(type)) {
            return res.status(400).json({ success: false, error: '평의회 유형이 올바르지 않습니다.' });
        }

        function positionSortKey(position, memberName) {
            const p = String(position || '');
            if (p.includes('부단장')) return 2;
            if (p.includes('단장')) return 1;
            if (p.includes('서기')) return 3;
            if (p.includes('회계')) return 4;
            if (p.includes('행동')) return 5;
            if (p.includes('협조')) return 6;
            if (p.includes('쁘레')) return 7;
            if (p.includes('아듀')) return 8;
            if (p.includes('예비')) return 9;
            if (p.includes('휴가')) return 10;
            const m = String(memberName || '').match(/^[TG](10|[1-6][78]|[1-9])/i);
            if (!m) return 99;
            const raw = m[1];
            if (raw.length === 2 && /[1-6][78]/.test(raw)) return parseInt(raw[1], 10);
            return parseInt(raw, 10);
        }

        function displayName(memberName) {
            return String(memberName || '').replace(/^[TG](?:10|[1-6][78]|[1-9])/i, '') || memberName || '';
        }

        function toMember(row) {
            return {
                id: row.id,
                name: row.name,
                display_name: displayName(row.name),
                baptism_name: row.baptism_name || '',
                gender: row.gender || '',
                position: row.position || '',
                officer_code: row.curia_officer || '',
                church_name: row.church_name || '',
                pr_name: row.pr_name || '',
                pr_type: row.pr_type || '',
                curia_name: row.curia_name || '',
                comitia_name: row.comitia_name || '',
                regia_name: row.regia_name || ''
            };
        }

        function sortMembers(members) {
            members.sort((a, b) => {
                const ka = positionSortKey(a.position, a.name);
                const kb = positionSortKey(b.position, b.name);
                if (ka !== kb) return ka - kb;
                return String(a.display_name).localeCompare(String(b.display_name), 'ko');
            });
            return members;
        }

        let whereSql = '';
        let groupField = 'pr_name';
        if (type === 'curia') {
            whereSql = 'curia_name = $1';
            groupField = 'pr_name';
        } else if (type === 'comitia') {
            whereSql = 'comitia_name = $1';
            groupField = 'curia_name';
        } else {
            whereSql = 'regia_name = $1';
            groupField = 'comitia_name';
        }

        const result = await pool.query(
            `SELECT id, name, baptism_name, gender, position, pr_name, pr_type, curia_officer,
                    church_name, curia_name, comitia_name, regia_name
             FROM member
             WHERE ${whereSql}
             ORDER BY id`,
            [name]
        );

        const byGroup = new Map();
        for (const row of result.rows) {
            const title = String(row[groupField] || '').trim()
                || (groupField === 'pr_name' ? '(Pr 미등록)'
                    : groupField === 'curia_name' ? '(꾸리아 미등록)'
                        : '(꼬미시움 미등록)');
            if (!byGroup.has(title)) {
                byGroup.set(title, {
                    title,
                    subtitle: groupField === 'pr_name' ? (row.pr_type || null) : null,
                    members: []
                });
            }
            const group = byGroup.get(title);
            if (groupField === 'pr_name' && !group.subtitle && row.pr_type) {
                group.subtitle = row.pr_type;
            }
            group.members.push(toMember(row));
        }

        const groups = [...byGroup.values()].map((group) => {
            sortMembers(group.members);
            return group;
        }).sort((a, b) => String(a.title).localeCompare(String(b.title), 'ko'));

        res.json({
            success: true,
            type,
            name,
            total_members: result.rows.length,
            groups
        });
    } catch (err) {
        console.error('평의회 월례보고 조회 오류:', err);
        res.status(500).json({ success: false, error: '평의회 월례보고 조회 중 오류가 발생했습니다.' });
    }
});

// 하위호환: 꾸리아 조직현황 → 월례보고 API
app.get('/api/curia-organization', async (req, res) => {
    const curiaName = String(req.query.curia_name || '').trim();
    if (!curiaName) {
        return res.status(400).json({ success: false, error: '꾸리아 명칭이 필요합니다.' });
    }
    try {
        const result = await pool.query(
            `SELECT id, name, baptism_name, gender, position, pr_name, pr_type, curia_officer, church_name, curia_name
             FROM member WHERE curia_name = $1 ORDER BY pr_name NULLS LAST, id`,
            [curiaName]
        );
        const byPr = new Map();
        for (const row of result.rows) {
            const prName = String(row.pr_name || '').trim() || '(Pr 미등록)';
            if (!byPr.has(prName)) {
                byPr.set(prName, { pr_name: prName, pr_type: row.pr_type || null, members: [] });
            }
            const group = byPr.get(prName);
            if (!group.pr_type && row.pr_type) group.pr_type = row.pr_type;
            group.members.push({
                id: row.id,
                name: row.name,
                display_name: String(row.name || '').replace(/^[TG](?:10|[1-6][78]|[1-9])/i, '') || row.name,
                baptism_name: row.baptism_name || '',
                gender: row.gender || '',
                position: row.position || '',
                officer_code: row.curia_officer || '',
                church_name: row.church_name || ''
            });
        }
        res.json({
            success: true,
            curia_name: curiaName,
            total_members: result.rows.length,
            groups: [...byPr.values()]
        });
    } catch (err) {
        console.error('꾸리아 조직현황 조회 오류:', err);
        res.status(500).json({ success: false, error: '꾸리아 조직현황 조회 중 오류가 발생했습니다.' });
    }
});

// 샘플 명단 (회원 3~103번) — 로컬 모의 전용
app.get('/api/sample-member-roster', async (req, res) => {
    try {
        if (rejectSampleToolsInDeploy(req, res)) return;
        const result = await pool.query(
            `SELECT id, name, church_name, pr_name, phone_last4, passno
             FROM member
             WHERE id BETWEEN $1 AND $2
             ORDER BY id`,
            [3, 103]
        );

        const members = result.rows.map((row) => {
            const displayName = extractRealNameFromMemberName(row.name);
            const phone4 = String(row.phone_last4 || '').replace(/\D/g, '').slice(-4).padStart(4, '0');
            return {
                id: row.id,
                display_name: displayName,
                name: row.name,
                phone_last4: phone4,
                login_id: `${displayName}${phone4}`,
                church_name: row.church_name || '',
                pr_name: row.pr_name || '',
                password: row.passno || ''
            };
        });

        res.json({
            success: true,
            count: members.length,
            members
        });
    } catch (err) {
        console.error('샘플 명단 조회 오류:', err);
        res.status(500).json({ success: false, error: '샘플 명단 조회 중 오류가 발생했습니다.' });
    }
});

// 1연간 샘플 활동 (회원 3~103번, 2025년) — 로컬 모의 전용
app.get('/api/sample-annual-activity', async (req, res) => {
    if (rejectSampleToolsInDeploy(req, res)) return;
    try {
        const year = parseInt(req.query.year, 10) || 2025;
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;
        const memberMin = 3;
        const memberMax = 103;

        const membersResult = await pool.query(
            `SELECT id, name, passno, phone_last4, resident_id_front6, church_name, pr_name
             FROM member
             WHERE id BETWEEN $1 AND $2
             ORDER BY id`,
            [memberMin, memberMax]
        );

        const activityRows = await fetchActivityReportRows(startDate, endDate, {
            member_id_min: memberMin,
            member_id_max: memberMax
        });
        const assignmentRows = await fetchAssignmentReportRows(startDate, endDate, {
            member_id_min: memberMin,
            member_id_max: memberMax
        });

        const activityMap = new Map();
        for (const row of activityRows) {
            if (!activityMap.has(row.member_id)) activityMap.set(row.member_id, []);
            activityMap.get(row.member_id).push({
                category_name: row.category_name,
                activity_date: row.activity_date
            });
        }

        const assignmentMap = new Map();
        for (const row of assignmentRows) {
            if (!assignmentMap.has(row.member_id)) assignmentMap.set(row.member_id, []);
            assignmentMap.get(row.member_id).push({
                활동배당: row['활동배당'],
                활동대상자: row['활동대상자'],
                created_at: row.created_at
            });
        }

        const members = membersResult.rows.map((row) => {
            const passno = row.passno
                || `${row.phone_last4 || ''}${row.resident_id_front6 || ''}`
                || '';
            return {
                id: row.id,
                name: row.name,
                display_name: extractRealNameFromMemberName(row.name),
                passno,
                church_name: row.church_name || '',
                pr_name: row.pr_name || '',
                assignments: assignmentMap.get(row.id) || [],
                activities: activityMap.get(row.id) || []
            };
        });

        res.json({
            success: true,
            year,
            start: startDate,
            end: endDate,
            count: members.length,
            members
        });
    } catch (err) {
        console.error('1연간 샘플 활동 조회 오류:', err);
        res.status(500).json({ success: false, error: '1연간 샘플 활동 조회 중 오류가 발생했습니다.' });
    }
});

// 활동배당지시 저장 (G1~G4 로그인 회원만)
app.post('/api/activity-assignment', async (req, res) => {
    try {
        const { member_id, assigner_name, 활동배당, 활동대상자 } = req.body;

        if (!member_id || !assigner_name || !활동배당) {
            return res.status(400).json({ success: false, error: '필수 정보를 모두 입력해주세요.' });
        }

        if (!new RegExp(`^${POSITION_PREFIX_LETTER_CLASS}[1234]`, 'i').test(assigner_name)) {
            return res.status(403).json({
                success: false,
                error: '활동배당지시는 G1~G4(단장·부단장·서기·회계) 회원만 사용할 수 있습니다.'
            });
        }

        const assignerResult = await pool.query(
            'SELECT id, name, church_name, pr_name FROM member WHERE name = $1',
            [assigner_name]
        );
        if (assignerResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: '배당 지시자를 찾을 수 없습니다.' });
        }
        const assigner = assignerResult.rows[0];

        const memberResult = await pool.query(
            'SELECT id, name, church_name, pr_name FROM member WHERE id = $1',
            [member_id]
        );
        if (memberResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: '선택한 회원을 찾을 수 없습니다.' });
        }
        const member = memberResult.rows[0];

        if (member.church_name !== assigner.church_name || member.pr_name !== assigner.pr_name) {
            return res.status(403).json({
                success: false,
                error: '같은 Pr 소속 회원에게만 배당할 수 있습니다.'
            });
        }

        const result = await pool.query(
            `INSERT INTO activity_assignments
                (member_id, assigner_id, "활동배당", "활동대상자", church_name, pr_name)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, member_id, assigner_id, "활동배당", "활동대상자", church_name, pr_name, created_at`,
            [member_id, assigner.id, 활동배당, 활동대상자 || null, member.church_name, member.pr_name]
        );

        res.json({
            success: true,
            message: '활동배당이 저장되었습니다.',
            record: result.rows[0]
        });
    } catch (err) {
        console.error('활동배당 저장 오류:', err);
        res.status(500).json({ success: false, error: '활동배당 저장 중 오류가 발생했습니다.' });
    }
});

// 로그인 회원 성당의 Pr 목록
app.get('/api/church-prs', async (req, res) => {
    try {
        const currentUserName = req.query.current_user_name;
        const churchNameParam = req.query.church_name;
        let churchName = churchNameParam || null;

        if (!churchName && currentUserName) {
            const userResult = await pool.query(
                'SELECT church_name FROM member WHERE name = $1',
                [currentUserName]
            );
            if (userResult.rows.length > 0) {
                churchName = userResult.rows[0].church_name;
            }
        }

        if (!churchName) {
            return res.status(400).json({ error: '성당 정보를 확인할 수 없습니다. 로그인 후 다시 시도해주세요.' });
        }

        const result = await pool.query(
            `SELECT DISTINCT pr_name FROM member
             WHERE church_name = $1 AND pr_name IS NOT NULL AND TRIM(pr_name) <> ''
             ORDER BY pr_name`,
            [churchName]
        );
        res.json({ church_name: churchName, prs: result.rows.map(r => r.pr_name) });
    } catch (err) {
        console.error('Pr 목록 조회 오류:', err);
        res.status(500).json({ error: 'Pr 목록 조회 중 오류가 발생했습니다.' });
    }
});

// 꼬미시움 소속 꾸리아 목록
app.get('/api/comitia-curias', async (req, res) => {
    try {
        const comitiaName = String(req.query.comitia_name || '').trim();
        if (!comitiaName) {
            return res.status(400).json({ error: '꼬미시움 명칭이 필요합니다.' });
        }

        const result = await pool.query(
            `SELECT DISTINCT curia_name
             FROM member
             WHERE comitia_name = $1
               AND curia_name IS NOT NULL
               AND TRIM(curia_name) <> ''
             ORDER BY curia_name`,
            [comitiaName]
        );

        res.json({
            success: true,
            comitia_name: comitiaName,
            curias: result.rows.map((r) => r.curia_name)
        });
    } catch (err) {
        console.error('꼬미시움 꾸리아 목록 조회 오류:', err);
        res.status(500).json({ error: '꼬미시움 소속 꾸리아 목록 조회 중 오류가 발생했습니다.' });
    }
});

// 레지아 소속 꼬미시움 목록
app.get('/api/regia-comitias', async (req, res) => {
    try {
        const regiaName = String(req.query.regia_name || '').trim();
        if (!regiaName) {
            return res.status(400).json({ error: '레지아 명칭이 필요합니다.' });
        }

        const result = await pool.query(
            `SELECT DISTINCT comitia_name
             FROM member
             WHERE regia_name = $1
               AND comitia_name IS NOT NULL
               AND TRIM(comitia_name) <> ''
             ORDER BY comitia_name`,
            [regiaName]
        );

        res.json({
            success: true,
            regia_name: regiaName,
            comitias: result.rows.map((r) => r.comitia_name)
        });
    } catch (err) {
        console.error('레지아 꼬미시움 목록 조회 오류:', err);
        res.status(500).json({ error: '레지아 소속 꼬미시움 목록 조회 중 오류가 발생했습니다.' });
    }
});

// 세나뚜스 소속 레지아 목록
app.get('/api/senatus-regias', async (req, res) => {
    try {
        const senatusName = String(req.query.senatus_name || '').trim();
        if (!senatusName) {
            return res.status(400).json({ error: '세나뚜스 명칭이 필요합니다.' });
        }

        const result = await pool.query(
            `SELECT DISTINCT regia_name
             FROM member
             WHERE senatus_name = $1
               AND regia_name IS NOT NULL
               AND TRIM(regia_name) <> ''
             ORDER BY regia_name`,
            [senatusName]
        );

        res.json({
            success: true,
            senatus_name: senatusName,
            regias: result.rows.map((r) => r.regia_name)
        });
    } catch (err) {
        console.error('세나뚜스 레지아 목록 조회 오류:', err);
        res.status(500).json({ error: '세나뚜스 소속 레지아 목록 조회 중 오류가 발생했습니다.' });
    }
});

// Pr별 활동배당 조회 (start_date, end_date로 기간 필터)
app.get('/api/activity-assignments', async (req, res) => {
    try {
        const { church_name, pr_name, start_date, end_date } = req.query;
        if (!church_name || !pr_name) {
            return res.status(400).json({ error: 'church_name과 pr_name이 필요합니다.' });
        }
        let query = `
            SELECT aa.id, aa.member_id, m.name AS member_name, m.baptism_name,
                   aa."활동배당", aa."활동대상자", aa.created_at::text AS created_at
            FROM activity_assignments aa
            JOIN member m ON aa.member_id = m.id
            WHERE m.church_name = $1 AND m.pr_name = $2`;
        const params = [church_name, pr_name];
        if (start_date && end_date) {
            const startOnly = String(start_date).slice(0, 10);
            const endOnly = String(end_date).slice(0, 10);
            query += ` AND aa.created_at::date BETWEEN $3::date AND $4::date`;
            params.push(startOnly, endOnly);
        }
        query += ` ORDER BY m.name, aa.created_at DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('활동배당 조회 오류:', err);
        res.status(500).json({ error: '활동배당 조회 중 오류가 발생했습니다.' });
    }
});

// TEST 자료입력: G가 붙은 테스트 회원 100명 생성 (성당 4개 × Pr별 7/7/6/5명)
// 이름 형식: G1김민수, G2이동식 … (Pr 내 순번 + 성명, 초과 인원은 G5·G6·G7 등)
app.post('/api/generate-test-members', async (req, res) => {
    if (rejectSampleToolsInDeploy(req, res)) return;
    const prDistribution = [7, 7, 6, 5];
    const koreanNames = [
        '김민수','이동식','박철수','최지영','정현우','강수진','윤서연','임동현','한미영','송태호',
        '조은영','신동욱','오혜진','유재석','백지민','남궁민','고은비','문성준','양미경','구자철',
        '손영수','배수정','조현우','홍길동','김철수','박민수','최영수','정민호','강미라','윤지훈',
        '임서준','한소희','송지아','조민재','신유진','오준혁','유나영','백승호','남다은','고태민',
        '문하늘','양지원','구민석','손예진','배준영','조서연','홍민지','김도윤','이서윤','박지호',
        '최유나','정우진','강하은','윤성민','임채원','한지훈','송민서','조예린','신현우','오지민',
        '유서현','백도현','남수아','고준서','김하준','이도윤','박서준','최예준','정시우','강주원',
        '윤건우','임현준','한지후','송연우','조지안','신은우','오민준','유지호','백준우','남시윤',
        '고유준','문지환','양서진','구민준','손도현','배시현','조하준','홍준혁','김서현','이민재',
        '박태윤','최윤서','정하윤','강지유','윤서연','임채은','한수빈','송지우','조예나','신다은',
        '오서윤','유하은','백지아','남수연','고예원','문소율','양채윤','구나은','손하린','배서아',
        '조유진','홍채원','김나연','이소은','박다인','최하연','정유나','강서아','윤채은','임나윤',
        '한예서','송하영','조유나','신서윤','오채아','유지유','백서영','남하윤','고예진','문지은'
    ];
    const baptismalNames = ['마리아','요셉','베드로','바오로','요한','루카','마르코','마태오','안드레아','야고보',
        '토마스','스테파노','테레사','카타리나','루치아','아가타','체칠리아','안나','엘리사벳','클라라'];
    const churchGroups = [
        { church: '성모성심성당', prs: ['자비의모후', '도움의모후', '승리의모후', '지혜의옥좌'], curias: ['성모성심 제1꾸리아', '성모성심 제2꾸리아'] },
        { church: '성요셉성당', prs: ['평화의모후', '신비로운장미', '계약의궤', '새벽별'], curias: ['성요셉 제1꾸리아', '성요셉 제2꾸리아'] },
        { church: '성베드로성당', prs: ['천상의모후', '병자의건강', '죄인의의탁', '천사들의모후'], curias: ['성베드로 제1꾸리아', '성베드로 제2꾸리아'] },
        { church: '성바오로성당', prs: ['은총의모후', '사도들의모후', '순교자들의모후', '동정녀들의모후'], curias: ['성바오로 제1꾸리아', '성바오로 제2꾸리아'] }
    ];

    const pad = (n, len) => String(n).padStart(len, '0');
    const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
    const genBirth6 = () => pad(randInt(0, 99), 2) + pad(randInt(1, 12), 2) + pad(randInt(1, 28), 2);
    const genPhoneFull = () => `010-${pad(randInt(0, 9999), 4)}-${pad(randInt(0, 9999), 4)}`;
    const extractPhoneLast4 = (phoneFull) => {
        const digits = String(phoneFull || '').replace(/\D/g, '');
        return digits.slice(-4).padStart(4, '0');
    };

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        await client.query(
            "SELECT setval(pg_get_serial_sequence('member', 'id'), COALESCE((SELECT MAX(id) FROM member), 0) + 1, false)"
        );

        const inserted = [];
        let nameIdx = 0;
        let baptismIdx = 0;
        for (const group of churchGroups) {
            for (let prIdx = 0; prIdx < group.prs.length; prIdx++) {
                const prName = group.prs[prIdx];
                const curiaName = group.curias[Math.floor(prIdx / 2)];
                const memberCount = prDistribution[prIdx];
                for (let memberIdx = 0; memberIdx < memberCount; memberIdx++) {
                    const name = `G${memberIdx + 1}${koreanNames[nameIdx++]}`;
                    const baptismalName = baptismalNames[baptismIdx % baptismalNames.length];
                    baptismIdx++;
                    const birth6 = genBirth6();
                    const phoneFull = genPhoneFull();
                    const phoneLast4 = extractPhoneLast4(phoneFull);
                    const passno = phoneLast4 + birth6;
                    const officerCode = memberIdx + 1;
                    const isOfficer = officerCode >= 1 && officerCode <= 4;
                    const position = isOfficer
                        ? ({ 1: '단장', 2: '부단장', 3: '서기', 4: '회계' }[officerCode])
                        : '단원';
                    // G1~G4 임명일: 2023-01-01 ~ 2026-07-31 (Pr·직책별 결정적 일자)
                    let appointedOn = null;
                    if (isOfficer) {
                        const start = Date.UTC(2023, 0, 1);
                        const span = Math.floor((Date.UTC(2026, 6, 31) - start) / 86400000);
                        let h = 2166136261;
                        const key = `${group.church}|${prName}|G${officerCode}`;
                        for (let i = 0; i < key.length; i += 1) {
                            h ^= key.charCodeAt(i);
                            h = Math.imul(h, 16777619);
                        }
                        appointedOn = new Date(start + ((h >>> 0) % (span + 1)) * 86400000)
                            .toISOString()
                            .slice(0, 10);
                    }

                    const result = await client.query(
                        `INSERT INTO member
                            (name, baptism_name, church_name, curia_name, pr_name, position,
                             phone_last4, resident_id_front6, phone_full, passno, officer_appointed_on)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::date)
                         RETURNING id, name, church_name, pr_name`,
                        [name, baptismalName, group.church, curiaName, prName, position,
                         phoneLast4, birth6, phoneFull, passno, appointedOn]
                    );
                    inserted.push(result.rows[0]);
                }
            }
        }

        await client.query('COMMIT');
        console.log(`✅ 테스트 회원 ${inserted.length}명 생성 완료`);
        res.json({
            success: true,
            message: `테스트 회원 ${inserted.length}명이 생성되었습니다.`,
            count: inserted.length,
            sample: inserted.slice(0, 5)
        });
    } catch (err) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (e) {}
        }
        console.error('❌ 테스트 회원 생성 오류:', err);
        res.status(500).json({ success: false, error: '테스트 회원 생성 중 오류가 발생했습니다.' });
    } finally {
        if (client) client.release();
    }
});

function toDateString(value) {
    if (!value) return '';
    if (typeof value === 'string') {
        const match = value.match(/(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : value;
    }
    const d = new Date(value);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function addDaysToDateString(dateStr, days) {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + days);
    return toDateString(d);
}

function subtractOneMonthFromDateString(dateStr) {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setMonth(d.getMonth() - 1);
    return toDateString(d);
}

function getPreviousCalendarMonthRange(anchorDateStr) {
    const d = new Date(`${anchorDateStr}T12:00:00`);
    const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const end = new Date(d.getFullYear(), d.getMonth(), 0);
    return { start: toDateString(start), end: toDateString(end) };
}

function aggregateMembersFromActivityRows(rows) {
    const memberMap = new Map();
    for (const row of rows) {
        if (!memberMap.has(row.member_id)) {
            const passno = row.passno
                || `${row.phone_last4 || ''}${row.resident_id_front6 || ''}`
                || '';
            memberMap.set(row.member_id, {
                name: row.name,
                passno,
                activities: [],
                assignments: []
            });
        }
        memberMap.get(row.member_id).activities.push({
            category_name: row.category_name,
            activity_date: row.activity_date
        });
    }
    return Array.from(memberMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

function mergeMembersFromActivitiesAndAssignments(activityRows, assignmentRows) {
    const memberMap = new Map();

    for (const row of activityRows) {
        if (!memberMap.has(row.member_id)) {
            const passno = row.passno
                || `${row.phone_last4 || ''}${row.resident_id_front6 || ''}`
                || '';
            memberMap.set(row.member_id, {
                name: row.name,
                passno,
                activities: [],
                assignments: []
            });
        }
        memberMap.get(row.member_id).activities.push({
            category_name: row.category_name,
            activity_date: row.activity_date
        });
    }

    for (const row of assignmentRows) {
        if (!memberMap.has(row.member_id)) {
            const passno = row.passno
                || `${row.phone_last4 || ''}${row.resident_id_front6 || ''}`
                || '';
            memberMap.set(row.member_id, {
                name: row.name,
                passno,
                activities: [],
                assignments: []
            });
        }
        memberMap.get(row.member_id).assignments.push({
            활동배당: row['활동배당'],
            활동대상자: row['활동대상자'],
            created_at: row.created_at
        });
    }

    return Array.from(memberMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/** 평의회 행사 집계: note 헤더(단체행사 평의회 선택) + 행 주관 필드 매칭 */
const MEMO_EVENT_ORG_TYPE_LABELS = {
    curia: '꾸리아',
    comitia: '꼬미시움',
    regia: '레지아',
    pr: 'Pr',
    senatus: '세나뚜스'
};

function normalizeCouncilText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseCouncilOrgLabel(text) {
    const t = normalizeCouncilText(text);
    const m = t.match(/^(Pr|꾸리아|꼬미시움|레지아|세나뚜스|본당)\s*[:：]\s*(.+)$/i);
    if (!m) return { type: '', name: t };
    const typeRaw = String(m[1] || '');
    const type = /^pr$/i.test(typeRaw) ? 'Pr' : typeRaw;
    return { type, name: normalizeCouncilText(m[2]) };
}

function isCouncilOrgHeader(text) {
    return /^(Pr|꾸리아|꼬미시움|레지아|세나뚜스|본당)\s*[:：]/i.test(normalizeCouncilText(text));
}

function matchesCouncilOrganizer(text, councilTypeLabel, councilName) {
    const wantName = normalizeCouncilText(councilName);
    const wantType = normalizeCouncilText(councilTypeLabel);
    if (!wantName) return false;
    const parsed = parseCouncilOrgLabel(text);
    if (!parsed.name) return false;
    if (parsed.type) {
        if (normalizeCouncilText(parsed.type) !== wantType) return false;
        return parsed.name === wantName;
    }
    return parsed.name === wantName;
}

function parseMemoEventNote(note, fallbackLabel = '') {
    const text = note != null ? String(note).trim() : '';
    if (!text) {
        return { label: fallbackLabel || '', rows: [] };
    }

    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    let label = fallbackLabel || '';
    let startIdx = 0;

    if (lines.length && !/^\d+\.\s*/.test(lines[0])) {
        label = lines[0];
        startIdx = 1;
    }

    const rows = [];
    for (let i = startIdx; i < lines.length; i += 1) {
        const line = lines[i].replace(/^\d+\.\s*/, '');
        const parts = line.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
        const row = {
            kind: '',
            title: '',
            host: '',
            date: '',
            place: '',
            content: '',
            attendees: ''
        };

        parts.forEach((part, idx) => {
            if (part.startsWith('구분:')) row.kind = part.slice(3).trim();
            else if (part.startsWith('제목:')) {
                const t = part.slice(3).trim();
                row.title = t === '(제목없음)' || t === '(명칭없음)' ? '' : t;
            }
            else if (part.startsWith('주관:')) row.host = part.slice(3).trim();
            else if (part.startsWith('일자:')) row.date = part.slice(3).trim();
            else if (part.startsWith('장소:')) row.place = part.slice(3).trim();
            else if (part.startsWith('내용:')) row.content = part.slice(3).trim();
            else if (part.startsWith('참석:')) row.attendees = part.slice(3).trim();
            else if (idx === 0 || (idx === 1 && !row.title && !row.kind)) {
                // 구형식: 첫 항목이 제목(또는 실시/계획이면 구분)
                const raw = part === '(명칭없음)' || part === '(제목없음)' ? '' : part;
                if (!row.kind && /^(실시|계획)$/.test(raw)) row.kind = raw;
                else if (!row.title) row.title = raw;
            }
            else if (!row.content) row.content = part;
        });

        if (row.kind || row.title || row.host || row.date || row.place || row.content || row.attendees) {
            rows.push(row);
        }
    }

    if (!rows.length && text) {
        rows.push({
            kind: '',
            title: fallbackLabel || '',
            host: '',
            date: '',
            place: '',
            content: text,
            attendees: ''
        });
        if (!label) label = fallbackLabel || '';
    }

    return { label: label || fallbackLabel || '행사', rows };
}

function extractCouncilMatchedEventRows(note, categoryName, activityDate, count, councilTypeLabel, councilName) {
    const eventType = String(categoryName || '').replace(/^메모및 행사-/, '').trim();
    if (!eventType || eventType === '메모') {
        return { label: '', rows: [], eventType: '' };
    }

    const parsed = parseMemoEventNote(note, eventType);
    const headerMatch = isCouncilOrgHeader(parsed.label)
        && matchesCouncilOrganizer(parsed.label, councilTypeLabel, councilName);

    const rows = [];
    if (parsed.rows.length) {
        for (const row of parsed.rows) {
            if (row.host) {
                if (matchesCouncilOrganizer(row.host, councilTypeLabel, councilName)) {
                    rows.push({
                        ...row,
                        host: row.host || councilName,
                        date: normalizeEventDateText(row.date, activityDate)
                    });
                }
            } else if (headerMatch) {
                rows.push({
                    ...row,
                    host: councilName,
                    date: normalizeEventDateText(row.date, activityDate)
                });
            }
        }
    } else if (headerMatch) {
        rows.push({
            title: eventType,
            host: councilName,
            date: normalizeEventDateText('', activityDate),
            place: '',
            content: '',
            attendees: Number(count) > 0 ? String(count) : ''
        });
    }

    const label = headerMatch
        ? parsed.label
        : (rows.length ? `${councilTypeLabel}: ${councilName}` : '');

    return { label, rows, eventType };
}

/** 교육·피정및연수: 주관(Pr:) 헤더 없이도 note 행 전체를 양식용으로 추출 */
function extractEducationRetreatEventRows(note, categoryName, activityDate, count) {
    const eventType = String(categoryName || '').replace(/^메모및 행사-/, '').trim();
    if (eventType !== '교육' && eventType !== '피정및연수') {
        return { label: '', rows: [], eventType: '' };
    }

    const parsed = parseMemoEventNote(note, eventType);
    const rows = [];

    if (parsed.rows.length) {
        for (const row of parsed.rows) {
            // 주관만 있는 빈 행 제외
            if (!(row.kind || row.title || row.date || row.place || row.content || row.attendees)) {
                continue;
            }
            rows.push({
                ...row,
                title: row.title || eventType,
                date: row.date || activityDate || '',
                attendees: row.attendees
                    || (Number(count) > 0 ? String(count) : '')
                    || (isPlanEventKind(row.kind) ? '0' : '')
            });
        }
    }

    if (!rows.length && (note != null && String(note).trim())) {
        rows.push({
            kind: '',
            title: eventType,
            host: '',
            date: activityDate || '',
            place: '',
            content: String(note).trim(),
            attendees: Number(count) > 0 ? String(count) : ''
        });
    }

    return { label: eventType, rows, eventType };
}

function isEducationOrRetreatCategory(categoryName) {
    const eventType = String(categoryName || '').replace(/^메모및 행사-/, '').trim();
    return eventType === '교육' || eventType === '피정및연수';
}

function isHigherCouncilOrganizerText(text) {
    const parsed = parseLooseCouncilOrganizer(text);
    return parsed.type === '꾸리아'
        || parsed.type === '꼬미시움'
        || parsed.type === '레지아'
        || parsed.type === '본당';
}

function isPrOrHigherCouncilOrganizerText(text) {
    const parsed = parseLooseCouncilOrganizer(text);
    return parsed.type === 'Pr'
        || parsed.type === '꾸리아'
        || parsed.type === '꼬미시움'
        || parsed.type === '레지아'
        || parsed.type === '본당';
}

function isPlanEventKind(kind) {
    return String(kind || '').trim() === '계획';
}

function rowHasMemberAttendance(row, count, options = {}) {
    // 구분=계획: 참석인원 0·미입력이어도 집계에 포함
    if (isPlanEventKind(row?.kind)) return true;
    if (String(row?.attendees || '').trim()) return true;
    // activity_records.count 는 note 안 여러 행사행에 공통으로 붙지 않음 — 의미 있는 행이 1개일 때만 fallback
    if (options.allowCountFallback && Number(count) > 0) return true;
    return false;
}

/** 주관만 있고 제목·일자·장소·내용·참석이 비어 있는 빈 행(깨진 note 잔여행) 제외 */
function memoEventRowHasSubstance(row) {
    return !!(
        String(row?.kind || '').trim()
        || String(row?.title || '').trim()
        || String(row?.date || '').trim()
        || String(row?.place || '').trim()
        || String(row?.content || '').trim()
        || String(row?.attendees || '').trim()
    );
}

function memoEventDedupeKey(event) {
    return [
        normalizeCouncilText(event.kind),
        normalizeCouncilText(event.title),
        normalizeCouncilText(event.organizer),
        normalizeEventDateText(event.datetime, ''),
        normalizeCouncilText(event.place),
        normalizeCouncilText(event.attendance)
    ].join('\u0001');
}

/** 주관 텍스트 파싱: `꾸리아: 이름` 또는 유형만(`꾸리아`) */
function parseLooseCouncilOrganizer(text) {
    const t = normalizeCouncilText(text);
    if (!t) return { type: '', name: '' };

    const labeled = parseCouncilOrgLabel(t);
    if (labeled.type) return labeled;

    const bare = t.match(/^(Pr|꾸리아|꼬미시움|레지아|세나뚜스|본당)$/i);
    if (bare) {
        const typeRaw = String(bare[1] || '');
        const type = /^pr$/i.test(typeRaw) ? 'Pr' : typeRaw;
        return { type, name: '' };
    }
    return { type: '', name: t };
}

function formatCouncilOrganizerText(type, name) {
    const t = normalizeCouncilText(type);
    const n = normalizeCouncilText(name);
    if (!t) return '';
    return n ? `${t}: ${n}` : t;
}

function memberOrgNameForType(memberRow, type) {
    if (!memberRow) return '';
    if (type === 'Pr') return memberRow.pr_name;
    if (type === '꾸리아') return memberRow.curia_name;
    if (type === '꼬미시움') return memberRow.comitia_name;
    if (type === '레지아') return memberRow.regia_name;
    if (type === '본당') return memberRow.church_name;
    return '';
}

/** YYYYMMDD / YYYY-MM-DD → YYYY-MM-DD (잘못된 자릿수는 activity_date로 대체) */
function normalizeEventDateText(value, fallback) {
    const raw = String(value || '').trim();
    const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
    const dashed = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dashed) return `${dashed[1]}-${dashed[2]}-${dashed[3]}`;
    const fb = String(fallback || '').trim();
    const fbDash = fb.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (fbDash) return `${fbDash[1]}-${fbDash[2]}-${fbDash[3]}`;
    // 2025102 처럼 자릿수가 잘못된 경우 빈 값 대신 fallback 원문/빈문자
    if (/^\d+$/.test(raw) && raw.length !== 8) return fbDash ? `${fbDash[1]}-${fbDash[2]}-${fbDash[3]}` : (fb.slice(0, 10) || '');
    return raw || fb;
}

/**
 * note 헤더·주관 칸·회원 소속으로 행사 주관(Pr/꾸리아/꼬미시움/레지아) 판별
 * - 주관 칸에 명칭만 있어도(헤더에 평의회 유형이 있으면) 인식
 * - 주관이 `꾸리아`처럼 유형만 있어도 회원 소속명으로 보강
 */
function resolveCouncilOrganizerText(row, parsedLabel, memberRow) {
    const host = normalizeCouncilText(row?.host);
    const label = normalizeCouncilText(parsedLabel);

    const fromHost = parseLooseCouncilOrganizer(host);
    if (fromHost.type) {
        const name = fromHost.name || memberOrgNameForType(memberRow, fromHost.type);
        return formatCouncilOrganizerText(fromHost.type, name);
    }

    const fromLabel = parseLooseCouncilOrganizer(label);
    if (fromLabel.type) {
        if (!host || host === normalizeCouncilText(fromLabel.name)) {
            const name = fromLabel.name || memberOrgNameForType(memberRow, fromLabel.type);
            return formatCouncilOrganizerText(fromLabel.type, name);
        }
        return formatCouncilOrganizerText(fromLabel.type, host);
    }

    if (host && memberRow) {
        const pairs = [
            ['Pr', memberRow.pr_name],
            ['꾸리아', memberRow.curia_name],
            ['꼬미시움', memberRow.comitia_name],
            ['레지아', memberRow.regia_name]
        ];
        for (const [type, name] of pairs) {
            if (normalizeCouncilText(name) && host === normalizeCouncilText(name)) {
                return formatCouncilOrganizerText(type, name);
            }
        }
    }

    return '';
}

/**
 * Pr 소속 회원이 참석한 행사 추출
 * - 주관 유무와 관계없이 참석인원이 있으면 포함 (단체/기타/교육 등)
 */
function extractPrMemberHigherCouncilAttendedRows(note, categoryName, activityDate, count, memberRow = null) {
    const eventType = String(categoryName || '').replace(/^메모및 행사-/, '').trim();
    if (!eventType || eventType === '메모') {
        return { label: '', rows: [], eventType: '' };
    }

    const parsed = parseMemoEventNote(note, eventType);
    const rows = [];
    const substantive = (parsed.rows || []).filter(memoEventRowHasSubstance);
    const allowCountFallback = substantive.length <= 1;

    if (parsed.rows.length) {
        for (const row of parsed.rows) {
            if (!memoEventRowHasSubstance(row)) continue;
            if (!rowHasMemberAttendance(row, count, { allowCountFallback })) continue;
            const orgText = resolveCouncilOrganizerText(row, parsed.label, memberRow);
            const hostRaw = normalizeCouncilText(row.host);
            const ownAttendees = String(row.attendees || '').trim();
            rows.push({
                ...row,
                host: orgText || hostRaw || '',
                title: row.title || eventType,
                date: normalizeEventDateText(row.date, activityDate),
                attendees: ownAttendees
                    || (allowCountFallback && Number(count) > 0 ? String(count) : '')
                    || (isPlanEventKind(row.kind) ? '0' : '')
            });
        }
    } else if (rowHasMemberAttendance({}, count, { allowCountFallback: true }) && String(note || '').trim()) {
        rows.push({
            kind: '',
            title: eventType,
            host: isPrOrHigherCouncilOrganizerText(parsed.label) ? parsed.label : '',
            date: normalizeEventDateText('', activityDate),
            place: '',
            content: '',
            attendees: Number(count) > 0 ? String(count) : ''
        });
    }

    return {
        label: parsed.label || eventType,
        rows,
        eventType
    };
}

function getMemberOrgNameForCouncilType(row, typeKey) {
    if (typeKey === 'pr') return row.pr_name;
    if (typeKey === 'curia') return row.curia_name;
    if (typeKey === 'comitia') return row.comitia_name;
    if (typeKey === 'regia') return row.regia_name;
    return '';
}

function displayMemberNameForEvent(memberName) {
    return String(memberName || '').replace(/^[TG](?:10|[1-6][78]|[1-9])/i, '') || memberName || '';
}

/** 메모장 note → 메모 / 주요활동내역 / 질의 / 건의 분리 */
function splitMemoNoteSections(note) {
    const text = String(note || '').trim();
    const empty = { memo: '', major: '', inquiry: '', suggest: '' };
    if (!text) return empty;

    const hasTagged =
        /\[메모\]/i.test(text)
        || /\[주요활동내역\]/i.test(text)
        || /\[질의\]/i.test(text)
        || /\[건의\]/i.test(text)
        || /\[질의및건의\]/i.test(text);

    if (!hasTagged) {
        // 태그 없는 예전 메모 → 메모란
        return { ...empty, memo: text };
    }

    const take = (tag) => {
        const re = new RegExp(
            `\\[${tag}\\]\\s*([\\s\\S]*?)(?=\\n\\s*\\[(?:메모|주요활동내역|질의|건의|질의및건의)\\]|\\s*$)`,
            'i'
        );
        const m = text.match(re);
        return (m?.[1] || '').trim();
    };

    const memo = take('메모');
    const major = take('주요활동내역');
    let inquiry = take('질의');
    let suggest = take('건의');
    const legacyBoth = take('질의및건의');
    if (legacyBoth && !inquiry && !suggest) {
        inquiry = legacyBoth;
    }

    return { memo, major, inquiry, suggest };
}

function formatMemoNoteLines(rows, displayNameFn) {
    const memos = [];
    const majors = [];
    const inquiries = [];

    for (const row of rows || []) {
        const who = displayNameFn ? displayNameFn(row.name) : String(row.name || '');
        const date = String(row.activity_date || '').slice(0, 10);
        const prefix = [date, who ? `(${who})` : ''].filter(Boolean).join(' ');
        const split = splitMemoNoteSections(row.note);

        if (split.memo) {
            memos.push(prefix ? `${prefix}\n${split.memo}` : split.memo);
        }
        if (split.major) {
            majors.push(prefix ? `${prefix}\n${split.major}` : split.major);
        }

        const inquiryParts = [];
        if (split.inquiry) inquiryParts.push(`질의: ${split.inquiry}`);
        if (split.suggest) inquiryParts.push(`건의: ${split.suggest}`);
        if (inquiryParts.length) {
            const body = inquiryParts.join('\n');
            inquiries.push(prefix ? `${prefix}\n${body}` : body);
        }
    }

    const dedupeLines = (lines) => {
        const seen = new Set();
        const out = [];
        for (const line of lines || []) {
            const text = String(line || '').trim();
            if (!text) continue;
            // 본문(날짜·이름 제외) 기준 중복 제거 — 종목 note + 메모 종목 이중 저장 대응
            const parts = text.split(/\n/);
            const body = parts.length > 1 ? parts.slice(1).join('\n').trim() : text;
            const key = (body || text).replace(/\s+/g, ' ').trim().toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(text);
        }
        return out;
    };

    return {
        memo: dedupeLines(memos).join('\n\n'),
        major_activities: dedupeLines(majors).join('\n\n'),
        inquiries: dedupeLines(inquiries).join('\n\n')
    };
}

/**
 * 개인활동 메모장(메모/주요활동/질의/건의) 조회
 * - 정식 종목「메모및 행사-메모」
 * - 다른 종목에 태그가 붙은 note도 포함 (잘못 저장된 질의·건의 수집)
 */
async function fetchFormattedMemoPad({ memberWhereSql, memberParams, monthStart, monthEnd, displayNameFn }) {
    const startIdx = memberParams.length + 1;
    const endIdx = memberParams.length + 2;
    const memoRows = await pool.query(
        `SELECT DISTINCT ON (m.id, ar.activity_date, md5(COALESCE(ar.note, '')))
                ar.activity_date::text AS activity_date, ar.note, m.name
         FROM activity_records ar
         INNER JOIN activity_categories ac ON ar.category_id = ac.id
         INNER JOIN member m ON ar.member_id = m.id
         WHERE ${memberWhereSql}
           AND ar.activity_date::date BETWEEN $${startIdx}::date AND $${endIdx}::date
           AND NULLIF(TRIM(ar.note), '') IS NOT NULL
           AND (
                ac.category_name = '메모및 행사-메모'
                OR ar.note ~* '\\[(메모|주요활동내역|질의|건의|질의및건의)\\]'
           )
         ORDER BY m.id, ar.activity_date, md5(COALESCE(ar.note, '')), ar.id`,
        [...memberParams, monthStart, monthEnd]
    );
    return formatMemoNoteLines(memoRows.rows, displayNameFn);
}

const PR_MEMBERSHIP_KEYS = [
    'active_m', 'active_f', 'active_t',
    'praetorian',
    'aux_m', 'aux_f', 'aux_t',
    'adjutorian'
];

let monthlyOrgSnapshotReady = false;

async function ensureMonthlyOrgSnapshotTable() {
    if (monthlyOrgSnapshotReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS monthly_org_snapshot (
            id SERIAL PRIMARY KEY,
            scope_type TEXT NOT NULL,
            church_name TEXT NOT NULL DEFAULT '',
            org_name TEXT NOT NULL,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            stats JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (scope_type, church_name, org_name, year, month)
        )
    `);
    monthlyOrgSnapshotReady = true;
}

function previousYearMonth(year, month) {
    let y = Number(year);
    let m = Number(month) - 1;
    if (m < 1) {
        m = 12;
        y -= 1;
    }
    return { year: y, month: m };
}

function blankMembershipRow(keys = PR_MEMBERSHIP_KEYS) {
    const row = {};
    for (const key of keys) row[key] = null;
    return row;
}

function buildMembershipChangeRows(current, previous, keys = PR_MEMBERSHIP_KEYS) {
    const increase = blankMembershipRow(keys);
    const decrease = blankMembershipRow(keys);
    if (!previous || typeof previous !== 'object') {
        return { increase, decrease };
    }
    for (const key of keys) {
        const cur = Number(current?.[key]);
        const prev = Number(previous?.[key]);
        if (!Number.isFinite(cur) || !Number.isFinite(prev)) continue;
        const diff = cur - prev;
        if (diff > 0) increase[key] = diff;
        else if (diff < 0) decrease[key] = Math.abs(diff);
    }
    return { increase, decrease };
}

async function saveMonthlyOrgSnapshot({
    scopeType,
    churchName = '',
    orgName,
    year,
    month,
    stats,
    onlyIfAbsent = false
}) {
    await ensureMonthlyOrgSnapshotTable();
    if (onlyIfAbsent) {
        await pool.query(
            `INSERT INTO monthly_org_snapshot (scope_type, church_name, org_name, year, month, stats, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
             ON CONFLICT (scope_type, church_name, org_name, year, month)
             DO NOTHING`,
            [
                String(scopeType || '').trim(),
                String(churchName || '').trim(),
                String(orgName || '').trim(),
                Number(year),
                Number(month),
                JSON.stringify(stats || {})
            ]
        );
        return;
    }
    await pool.query(
        `INSERT INTO monthly_org_snapshot (scope_type, church_name, org_name, year, month, stats, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
         ON CONFLICT (scope_type, church_name, org_name, year, month)
         DO UPDATE SET stats = EXCLUDED.stats, updated_at = NOW()`,
        [
            String(scopeType || '').trim(),
            String(churchName || '').trim(),
            String(orgName || '').trim(),
            Number(year),
            Number(month),
            JSON.stringify(stats || {})
        ]
    );
}

async function loadMonthlyOrgSnapshot({ scopeType, churchName = '', orgName, year, month }) {
    await ensureMonthlyOrgSnapshotTable();
    const result = await pool.query(
        `SELECT stats
         FROM monthly_org_snapshot
         WHERE scope_type = $1
           AND church_name = $2
           AND org_name = $3
           AND year = $4
           AND month = $5
         LIMIT 1`,
        [
            String(scopeType || '').trim(),
            String(churchName || '').trim(),
            String(orgName || '').trim(),
            Number(year),
            Number(month)
        ]
    );
    if (!result.rows.length) return null;
    const stats = result.rows[0].stats;
    return stats && typeof stats === 'object' ? stats : null;
}

async function fetchCouncilOrganizerEvents({ type, name, startDate, endDate, churchName = '' }) {
    const typeKey = String(type || '').trim().toLowerCase();
    const councilTypeLabel = MEMO_EVENT_ORG_TYPE_LABELS[typeKey] || '';
    const councilName = normalizeCouncilText(name);
    const church = normalizeCouncilText(churchName);
    if (!councilTypeLabel || !councilName || !startDate || !endDate) {
        return { events: [], groups: {} };
    }

    const params = [startDate, endDate];
    let churchSql = '';
    if (church) {
        params.push(church);
        churchSql = ` AND m.church_name = $${params.length}`;
    }

    const result = await pool.query(
        `SELECT
            m.id AS member_id,
            m.name,
            m.pr_name,
            m.curia_name,
            m.comitia_name,
            m.regia_name,
            ac.category_name,
            ar.activity_date::text AS activity_date,
            ar.note,
            ar.count
         FROM activity_records ar
         INNER JOIN activity_categories ac ON ar.category_id = ac.id
         INNER JOIN member m ON ar.member_id = m.id
         WHERE ar.activity_date::date BETWEEN $1::date AND $2::date
           AND ac.category_name LIKE '메모및 행사-%'
           AND ac.category_name <> '메모및 행사-메모'
           ${churchSql}
         ORDER BY ar.activity_date, m.id, ac.category_name`,
        params
    );

    const events = [];
    const groupMap = new Map();

    for (const row of result.rows) {
        let extracted = extractCouncilMatchedEventRows(
            row.note,
            row.category_name,
            row.activity_date,
            row.count,
            councilTypeLabel,
            councilName
        );

                // 교육·피정은 주관(Pr:) 없이 저장되므로, 해당 평의회 소속 회원 기록은 별도로 포함
        // Pr: 참석인원 있으면 포함. 구분=계획은 참석 0이어도 포함.
        if (!extracted.rows.length) {
            const memberOrgName = getMemberOrgNameForCouncilType(row, typeKey);
            if (normalizeCouncilText(memberOrgName) === councilName) {
                if (isEducationOrRetreatCategory(row.category_name)) {
                    extracted = extractEducationRetreatEventRows(
                        row.note,
                        row.category_name,
                        row.activity_date,
                        row.count
                    );
                }
                if (!extracted.rows.length && typeKey === 'pr') {
                    extracted = extractPrMemberHigherCouncilAttendedRows(
                        row.note,
                        row.category_name,
                        row.activity_date,
                        row.count,
                        row
                    );
                }
            }
        }

        if (!extracted.rows.length) continue;

        const groupLabel = extracted.label || `${councilTypeLabel}: ${councilName}`;
        if (!groupMap.has(groupLabel)) groupMap.set(groupLabel, []);

        for (const er of extracted.rows) {
            // 교육·피정 등 제목 없이 내용만 있는 경우 월례표 '제목'란에 내용 표시
            const displayTitle = er.title || er.content || extracted.eventType || '';
            const displayContent = (er.content && er.content !== displayTitle) ? er.content : '';
            const groupRow = {
                ...er,
                title: displayTitle,
                content: displayContent,
                date: normalizeEventDateText(er.date || row.activity_date || '', row.activity_date || '')
            };
            groupMap.get(groupLabel).push(groupRow);
            // 주관에 '꾸리아: 이름' 형태가 오면 이름만 노출
            let organizer = er.host || councilName;
            const orgParsed = parseCouncilOrgLabel(organizer);
            if (orgParsed.type && orgParsed.name) {
                organizer = orgParsed.name;
            }
            events.push({
                kind: er.kind || '',
                title: displayTitle,
                organizer,
                datetime: groupRow.date,
                place: er.place || '',
                attendance: er.attendees || '',
                content: displayContent,
                event_type: extracted.eventType || '',
                member_name: displayMemberNameForEvent(row.name)
            });
        }
    }

    // 동일 행사 중복(깨진 note 잔여행·복수 회원 기록) 제거
    const seen = new Set();
    const deduped = [];
    for (const ev of events) {
        const key = memoEventDedupeKey(ev);
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(ev);
    }

    const dedupedGroups = {};
    for (const [label, rows] of groupMap.entries()) {
        const seenRows = new Set();
        const uniq = [];
        for (const er of rows) {
            const key = [
                normalizeCouncilText(er.kind),
                normalizeCouncilText(er.title),
                normalizeCouncilText(er.host),
                normalizeEventDateText(er.date, ''),
                normalizeCouncilText(er.place),
                normalizeCouncilText(er.content),
                normalizeCouncilText(er.attendees)
            ].join('\u0001');
            if (seenRows.has(key)) continue;
            seenRows.add(key);
            uniq.push(er);
        }
        if (uniq.length) dedupedGroups[label] = uniq;
    }

    return {
        events: deduped,
        groups: dedupedGroups
    };
}

async function fetchActivityReportRows(startDate, endDate, filters = {}) {
    let query = `
        SELECT
            m.id AS member_id,
            m.name,
            m.passno,
            m.phone_last4,
            m.resident_id_front6,
            ac.category_name,
            ar.activity_date::text AS activity_date
        FROM member m
        INNER JOIN activity_records ar ON ar.member_id = m.id
        LEFT JOIN activity_categories ac ON ar.category_id = ac.id
        WHERE ar.activity_date::date BETWEEN $1::date AND $2::date
    `;
    const params = [startDate, endDate];
    let paramIndex = 3;

    if (filters.member_id) {
        query += ` AND m.id = $${paramIndex}`;
        params.push(filters.member_id);
        paramIndex++;
    }
    if (filters.member_id_min) {
        query += ` AND m.id >= $${paramIndex}`;
        params.push(filters.member_id_min);
        paramIndex++;
    }
    if (filters.member_id_max) {
        query += ` AND m.id <= $${paramIndex}`;
        params.push(filters.member_id_max);
        paramIndex++;
    }
    if (filters.church_name) {
        query += ` AND m.church_name = $${paramIndex}`;
        params.push(filters.church_name);
        paramIndex++;
    }
    if (filters.pr_name) {
        query += ` AND m.pr_name = $${paramIndex}`;
        params.push(filters.pr_name);
        paramIndex++;
    }
    if (filters.curia_name) {
        query += ` AND m.curia_name = $${paramIndex}`;
        params.push(filters.curia_name);
        paramIndex++;
    }
    if (filters.comitia_name) {
        query += ` AND m.comitia_name = $${paramIndex}`;
        params.push(filters.comitia_name);
        paramIndex++;
    }
    if (filters.regia_name) {
        query += ` AND m.regia_name = $${paramIndex}`;
        params.push(filters.regia_name);
        paramIndex++;
    }

    query += ' ORDER BY m.name, ar.activity_date, ac.category_name';
    const result = await pool.query(query, params);
    return result.rows;
}

async function fetchAssignmentReportRows(startDate, endDate, filters = {}) {
    let query = `
        SELECT
            m.id AS member_id,
            m.name,
            m.passno,
            m.phone_last4,
            m.resident_id_front6,
            aa."활동배당",
            aa."활동대상자",
            aa.created_at::text AS created_at
        FROM activity_assignments aa
        INNER JOIN member m ON aa.member_id = m.id
        WHERE aa.created_at::date BETWEEN $1::date AND $2::date
    `;
    const params = [startDate, endDate];
    let paramIndex = 3;

    if (filters.member_id) {
        query += ` AND m.id = $${paramIndex}`;
        params.push(filters.member_id);
        paramIndex++;
    }
    if (filters.member_id_min) {
        query += ` AND m.id >= $${paramIndex}`;
        params.push(filters.member_id_min);
        paramIndex++;
    }
    if (filters.member_id_max) {
        query += ` AND m.id <= $${paramIndex}`;
        params.push(filters.member_id_max);
        paramIndex++;
    }
    if (filters.church_name) {
        query += ` AND m.church_name = $${paramIndex}`;
        params.push(filters.church_name);
        paramIndex++;
    }
    if (filters.pr_name) {
        query += ` AND m.pr_name = $${paramIndex}`;
        params.push(filters.pr_name);
        paramIndex++;
    }
    if (filters.curia_name) {
        query += ` AND m.curia_name = $${paramIndex}`;
        params.push(filters.curia_name);
        paramIndex++;
    }

    query += ' ORDER BY m.name, aa.created_at, aa."활동배당"';
    const result = await pool.query(query, params);
    return result.rows;
}

async function pickRandomWeekStartForMember(memberId) {
    // 활동배당이 있는 주를 우선 선택 (활동만 있는 주는 배당 열이 비는 경우가 많음)
    const assignWeeks = await pool.query(
        `SELECT DISTINCT date_trunc('week', aa.created_at::timestamp)::date AS week_start
         FROM activity_assignments aa
         WHERE aa.member_id = $1
         ORDER BY week_start DESC`,
        [memberId]
    );
    if (assignWeeks.rows.length > 0) {
        const picked = assignWeeks.rows[Math.floor(Math.random() * assignWeeks.rows.length)].week_start;
        return toDateString(picked);
    }

    const weeks = await pool.query(
        `SELECT DISTINCT date_trunc('week', ar.activity_date::timestamp)::date AS week_start
         FROM activity_records ar
         WHERE ar.member_id = $1
           AND ar.activity_date >= (CURRENT_DATE - INTERVAL '52 weeks')
         ORDER BY week_start DESC`,
        [memberId]
    );

    if (weeks.rows.length > 0) {
        const picked = weeks.rows[Math.floor(Math.random() * weeks.rows.length)].week_start;
        return toDateString(picked);
    }

    const today = new Date();
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    const weeksAgo = Math.floor(Math.random() * 52);
    monday.setDate(monday.getDate() - weeksAgo * 7);
    return toDateString(monday);
}

// TEST 자료 PDF: 로그인 회원 기준 개인 1주 + 소속 Pr 1개월 + 소속 꾸리아 1개월
app.get('/api/test-export/report', async (req, res) => {
    if (rejectSampleToolsInDeploy(req, res)) return;
    try {
        const memberId = parseInt(req.query.member_id, 10);
        const { church_name, pr_name, curia_name } = req.query;

        if (!memberId || Number.isNaN(memberId)) {
            return res.status(400).json({ success: false, error: '로그인 회원 정보가 필요합니다.' });
        }

        const memberCheck = await pool.query(
            'SELECT id, name, passno, phone_last4, resident_id_front6, church_name, pr_name, curia_name FROM member WHERE id = $1',
            [memberId]
        );
        if (memberCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: '회원 정보를 찾을 수 없습니다.' });
        }

        const member = memberCheck.rows[0];
        const churchName = church_name || member.church_name;
        const prName = pr_name || member.pr_name;
        const curiaName = curia_name || member.curia_name;

        const weekStart = await pickRandomWeekStartForMember(memberId);
        const weekEnd = addDaysToDateString(weekStart, 6);
        const prMonthStart = subtractOneMonthFromDateString(weekEnd);
        const prMonthEnd = weekEnd;
        const curiaMonth = getPreviousCalendarMonthRange(weekEnd);

        const personalRows = await fetchActivityReportRows(weekStart, weekEnd, { member_id: memberId });
        const personalAssignRows = await fetchAssignmentReportRows(weekStart, weekEnd, { member_id: memberId });
        let personalMembers = mergeMembersFromActivitiesAndAssignments(personalRows, personalAssignRows);

        if (personalMembers.length === 0) {
            const passno = member.passno
                || `${member.phone_last4 || ''}${member.resident_id_front6 || ''}`
                || '';
            personalMembers = [{
                name: member.name,
                passno,
                activities: [],
                assignments: personalAssignRows.map(row => ({
                    활동배당: row['활동배당'],
                    활동대상자: row['활동대상자'],
                    created_at: row.created_at
                }))
            }];
        }

        let prMembers = [];
        if (churchName && prName) {
            const prRows = await fetchActivityReportRows(prMonthStart, prMonthEnd, {
                church_name: churchName,
                pr_name: prName
            });
            prMembers = aggregateMembersFromActivityRows(prRows);
        }

        let curiaMembers = [];
        if (churchName && prName && curiaName) {
            const curiaRows = await fetchActivityReportRows(curiaMonth.start, curiaMonth.end, {
                church_name: churchName,
                pr_name: prName,
                curia_name: curiaName
            });
            curiaMembers = aggregateMembersFromActivityRows(curiaRows);
        }

        console.log(`TEST 자료출력: ${member.name}, 개인주 ${weekStart}~${weekEnd}, Pr ${prMonthStart}~${prMonthEnd}, 꾸리아 ${curiaMonth.start}~${curiaMonth.end}`);

        res.json({
            success: true,
            user: {
                member_id: memberId,
                name: member.name,
                church_name: churchName,
                pr_name: prName,
                curia_name: curiaName
            },
            personal_week: {
                title: '로그인 회원 개인 1주일',
                start: weekStart,
                end: weekEnd,
                include_assignments: true,
                members: personalMembers
            },
            pr_month: {
                title: `소속 Pr (${prName || '-'}) 1개월`,
                start: prMonthStart,
                end: prMonthEnd,
                include_assignments: false,
                members: prMembers
            },
            curia_month: {
                title: `소속 Pr·꾸리아 (${prName || '-'} / ${curiaName || '-'}) 이전 1개월`,
                start: curiaMonth.start,
                end: curiaMonth.end,
                include_assignments: false,
                members: curiaMembers
            }
        });
    } catch (err) {
        console.error('TEST 자료출력 조회 오류:', err);
        res.status(500).json({ success: false, error: 'TEST 자료 조회 중 오류가 발생했습니다.' });
    }
});

// TEST 자료 PDF: T회원 + 기간 내 활동 (성명·비번·활동만)
app.get('/api/test-members/activity-report', async (req, res) => {
    if (rejectSampleToolsInDeploy(req, res)) return;
    try {
        const { start_date, end_date } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({ success: false, error: '시작일과 종료일은 필수입니다.' });
        }

        const result = await pool.query(
            `SELECT
                m.id AS member_id,
                m.name,
                m.passno,
                m.phone_last4,
                m.resident_id_front6,
                ac.category_name,
                ar.activity_date::text AS activity_date
             FROM member m
             INNER JOIN activity_records ar ON ar.member_id = m.id
             LEFT JOIN activity_categories ac ON ar.category_id = ac.id
             WHERE m.name LIKE 'T%'
               AND ar.activity_date::date BETWEEN $1::date AND $2::date
             ORDER BY m.name, ar.activity_date, ac.category_name`,
            [start_date, end_date]
        );

        const memberMap = new Map();
        for (const row of result.rows) {
            if (!memberMap.has(row.member_id)) {
                const passno = row.passno
                    || ((row.phone_last4 || '') + (row.resident_id_front6 || ''))
                    || '';
                memberMap.set(row.member_id, {
                    name: row.name,
                    passno,
                    activities: []
                });
            }
            memberMap.get(row.member_id).activities.push({
                category_name: row.category_name,
                activity_date: row.activity_date
            });
        }

        const members = Array.from(memberMap.values());
        console.log(`TEST 활동보고 조회: ${start_date} ~ ${end_date}, 회원 ${members.length}명, 활동 ${result.rows.length}건`);

        res.json({
            success: true,
            start_date,
            end_date,
            total_members: members.length,
            total_activities: result.rows.length,
            members
        });
    } catch (err) {
        console.error('TEST 활동보고 조회 오류:', err);
        res.status(500).json({ success: false, error: 'TEST 활동자료 조회 중 오류가 발생했습니다.' });
    }
});

// TEST 자료삭제: 이름이 G로 시작하는 테스트 회원 및 관련 활동자료 일괄 삭제
app.delete('/api/test-members', async (req, res) => {
    if (rejectSampleToolsInDeploy(req, res)) return;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // 삭제 대상 테스트 회원 id 목록 조회 (이름이 G1~G7로 시작)
        const targets = await client.query(
            "SELECT id FROM member WHERE name ~ '^G[1-7]'"
        );
        const ids = targets.rows.map(r => r.id);

        if (ids.length === 0) {
            await client.query('COMMIT');
            return res.json({
                success: true,
                message: '삭제할 테스트 회원이 없습니다.',
                deletedCount: 0
            });
        }

        // 외래키 제약 방지를 위해 관련 활동자료 먼저 삭제 (테이블이 없으면 무시)
        const relatedTables = ['activity_records', 'daily_activities', 'prayer_activities', 'community_activities'];
        for (const table of relatedTables) {
            try {
                await client.query(`DELETE FROM ${table} WHERE member_id = ANY($1::int[])`, [ids]);
            } catch (relErr) {
                console.log(`관련 테이블(${table}) 정리 건너뜀:`, relErr.message);
            }
        }

        // 테스트 회원 삭제
        const deleted = await client.query(
            "DELETE FROM member WHERE name ~ '^G[1-7]' RETURNING id, name"
        );

        await client.query('COMMIT');
        console.log(`✅ 테스트 회원 ${deleted.rows.length}명 삭제 완료`);
        res.json({
            success: true,
            message: `테스트 회원 ${deleted.rows.length}명이 삭제되었습니다.`,
            deletedCount: deleted.rows.length
        });
    } catch (err) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (e) {}
        }
        console.error('❌ 테스트 회원 삭제 오류:', err);
        res.status(500).json({ success: false, error: '테스트 회원 삭제 중 오류가 발생했습니다.' });
    } finally {
        if (client) client.release();
    }
});

// 개별 회원 조회 API
app.get('/api/members/:id', async (req, res) => {
    try {
        const memberId = parseInt(req.params.id);
        
        if (isNaN(memberId)) {
            return res.status(400).json({ error: '유효하지 않은 회원 ID입니다.' });
        }
        
        const result = await pool.query(
            'SELECT * FROM member WHERE id = $1',
            [memberId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
        }
        
        res.json(result.rows[0]);
        
    } catch (err) {
        console.error('개별 회원 조회 오류:', err);
        res.status(500).json({ error: '회원 조회 중 오류가 발생했습니다.' });
    }
});

// 회원 정보 수정 API
app.put('/api/members/:id', async (req, res) => {
    try {
        const memberId = parseInt(req.params.id);
        const { name, baptism_name, church_name, curia_name, pr_name, position, phone_last4, resident_id_front6, phone_full, resident_id_full } = req.body;
        
        if (isNaN(memberId)) {
            return res.status(400).json({ error: '유효하지 않은 회원 ID입니다.' });
        }
        
        // 회원 존재 확인
        const existingMember = await pool.query(
            'SELECT * FROM member WHERE id = $1',
            [memberId]
        );
        
        if (existingMember.rows.length === 0) {
            return res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
        }
        
        // 회원 정보 수정
        const result = await pool.query(
            `UPDATE member SET 
             name = $1, baptism_name = $2, church_name = $3, curia_name = $4, pr_name = $5, position = $6,
             phone_last4 = $7, resident_id_front6 = $8, phone_full = $9, resident_id_full = $10
             WHERE id = $11
             RETURNING *`,
            [name, baptism_name, church_name, curia_name, pr_name, position, phone_last4, resident_id_front6, phone_full, resident_id_full, memberId]
        );
        
        console.log('회원 정보 수정 성공:', result.rows[0].name);
        res.json({
            success: true,
            message: '회원 정보가 성공적으로 수정되었습니다.',
            member: result.rows[0]
        });
        
    } catch (err) {
        console.error('회원 정보 수정 오류:', err);
        res.status(500).json({ error: '회원 정보 수정 중 오류가 발생했습니다.' });
    }
});

// 1. 활동종목 조회 API
app.get('/api/categories', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM activity_categories ORDER BY category_group, category_name');
        res.json(result.rows);
    } catch (err) {
        console.error('활동종목 조회 오류:', err);
        res.status(500).json({ error: '활동종목 조회 중 오류가 발생했습니다.' });
    }
});

// 1-1. 활동종목 조회 API (활동자료 입력 페이지용)
// 그룹을 정해진 순서로 묶고, 그룹 내에서는 등록(id) 순서로 정렬한다.
// → 나중에 추가된 종목도 같은 그룹끼리 이어서 표시됨
app.get('/api/activity-categories', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM activity_categories
            ORDER BY
                CASE category_group
                    WHEN '기도생활' THEN 1
                    WHEN '영성생활' THEN 1
                    WHEN '가정성화활동' THEN 2
                    WHEN '지구와함께' THEN 3
                    WHEN '복음선교' THEN 4
                    WHEN '이웃에 가톨릭 알리기활동' THEN 4
                    WHEN '입교 권면' THEN 5
                    WHEN '예비신자 돌봄' THEN 6
                    WHEN '예비자 돌봄' THEN 6
                    WHEN '예비신자와 함께하는 활동' THEN 6
                    WHEN '교우돌봄' THEN 7
                    WHEN '이웃돌봄' THEN 8
                    WHEN '가정을 위한 활동, 교우 돌봄' THEN 7
                    WHEN '성사권유 및 혼인장애자를 위한 활동' THEN 7
                    WHEN '어려운자돌봄' THEN 8
                    WHEN '어려움을 겪는 이웃과 나눔 활동' THEN 8
                    WHEN '레지오활동' THEN 9
                    WHEN '레지오의 발전을 위한 활동' THEN 9
                    WHEN '확장' THEN 9
                    WHEN '소공동체와 함께하는 활동' THEN 10
                    WHEN '본당교회협조' THEN 11
                    WHEN '본당협조활동' THEN 11
                    WHEN '본당협조' THEN 11
                    WHEN '특별활동' THEN 12
                    WHEN '자연보호 및 생명존중 운동에 동참' THEN 13
                    WHEN '자연보호' THEN 13
                    WHEN '상급평의회가 지시한 활동' THEN 14
                    WHEN '기타 활동' THEN 15
                    WHEN '기타활동' THEN 15
                    WHEN '자연보호및 기타활동' THEN 15
                    WHEN '기타' THEN 15
                    ELSE 99
                END,
                id
        `);
        res.json({ success: true, categories: result.rows });
    } catch (err) {
        console.error('활동종목 조회 오류:', err);
        res.status(500).json({ success: false, error: '활동종목 조회 중 오류가 발생했습니다.' });
    }
});

// 2. 활동종목 컬럼 추가 API
app.post('/api/categories', async (req, res) => {
    try {
        const { category_name, category_group, description } = req.body;

        console.log('활동 카테고리 추가 요청:', {
            category_name,
            category_group,
            description
        });

        // 필수 필드 검증
        if (!category_name || !category_group) {
            return res.status(400).json({ error: '활동종목명과 활동그룹은 필수입니다.' });
        }

        // 중복 확인
        const existingCategory = await pool.query(
            'SELECT id FROM activity_categories WHERE category_name = $1',
            [category_name]
        );

        if (existingCategory.rows.length > 0) {
            return res.status(400).json({ error: '이미 존재하는 활동종목명입니다.' });
        }

        // 새 활동 카테고리 추가
        const result = await pool.query(
            `INSERT INTO activity_categories (category_name, category_group, description) 
             VALUES ($1, $2, $3) 
             RETURNING id, category_name, category_group, description`,
            [category_name, category_group, description || null]
        );

        console.log('활동 카테고리 추가 성공:', result.rows[0]);

        res.status(201).json({
            success: true,
            message: '활동 카테고리가 성공적으로 추가되었습니다.',
            category: result.rows[0]
        });

    } catch (err) {
        console.error('활동 카테고리 추가 오류:', err);
        res.status(500).json({ error: '활동 카테고리 추가 중 오류가 발생했습니다.' });
    }
});

// 3. 활동종목 수정 API
app.put('/api/categories/:id', async (req, res) => {
    try {
        const categoryId = parseInt(req.params.id);
        const { category_name, category_group, description } = req.body;

        console.log('활동 카테고리 수정 요청:', {
            categoryId,
            category_name,
            category_group,
            description
        });

        if (isNaN(categoryId)) {
            return res.status(400).json({ error: '유효하지 않은 카테고리 ID입니다.' });
        }

        // 필수 필드 검증
        if (!category_name || !category_group) {
            return res.status(400).json({ error: '활동종목명과 활동그룹은 필수입니다.' });
        }

        // 카테고리 존재 확인
        const existingCategory = await pool.query(
            'SELECT id FROM activity_categories WHERE id = $1',
            [categoryId]
        );

        if (existingCategory.rows.length === 0) {
            return res.status(404).json({ error: '활동 카테고리를 찾을 수 없습니다.' });
        }

        // 중복 확인 (다른 카테고리와 동일한 이름인지)
        const duplicateCategory = await pool.query(
            'SELECT id FROM activity_categories WHERE category_name = $1 AND id != $2',
            [category_name, categoryId]
        );

        if (duplicateCategory.rows.length > 0) {
            return res.status(400).json({ error: '이미 존재하는 활동종목명입니다.' });
        }

        // 활동 카테고리 수정
        const result = await pool.query(
            `UPDATE activity_categories 
             SET category_name = $1, category_group = $2, description = $3
             WHERE id = $4 
             RETURNING id, category_name, category_group, description`,
            [category_name, category_group, description || null, categoryId]
        );

        console.log('활동 카테고리 수정 성공:', result.rows[0]);

        res.json({
            success: true,
            message: '활동 카테고리가 성공적으로 수정되었습니다.',
            category: result.rows[0]
        });

    } catch (err) {
        console.error('활동 카테고리 수정 오류:', err);
        res.status(500).json({ error: '활동 카테고리 수정 중 오류가 발생했습니다.' });
    }
});

// 4. 활동자료 조회 API (카테고리별)
app.get('/api/activity-records/:categoryId', async (req, res) => {
    try {
        const categoryId = parseInt(req.params.categoryId);
        const memberId = req.query.member_id ? parseInt(req.query.member_id) : null;
        
        if (isNaN(categoryId)) {
            return res.status(400).json({ error: '유효하지 않은 카테고리 ID입니다.' });
        }

        let query = `SELECT ar.id, ar.member_id, ar.category_id, ar.target, ar.count,
                            ar.catechism_guide, ar.group_join, ar.meeting_head, ar.resolution,
                            ar.sacrament, ar.confirmation, ar.baptism, ar.first_communion,
                            ar.year_count, ar.funeral_mass, ar.funeral_attendance, ar.inout_count,
                            ar.conditional_baptism, ar.conditional_communion, ar.membership,
                            ar.establishment, ar.memorial_mass, ar.note, ar.created_at, ar.updated_at,
                            TO_CHAR(ar.activity_date, 'YYYY-MM-DD') as activity_date,
                            m.name as member_name 
                     FROM activity_records ar 
                     LEFT JOIN member m ON ar.member_id = m.id 
                     WHERE ar.category_id = $1`;
        let params = [categoryId];

        if (memberId) {
            query += ` AND ar.member_id = $2`;
            params.push(memberId);
        }

        query += ` ORDER BY ar.activity_date DESC`;

        const result = await pool.query(query, params);

        console.log(`활동자료 조회 성공: 카테고리 ${categoryId}, ${result.rows.length}개`);
        res.json(result.rows);

    } catch (err) {
        console.error('활동자료 조회 오류:', err);
        res.status(500).json({ error: '활동자료 조회 중 오류가 발생했습니다.' });
    }
});

// 5. 활동자료 추가 API (동적 필드 지원)
app.post('/api/activity-records', async (req, res) => {
    try {
        const { category_id, member_id, target, count, catechism_guide, group_join, meeting_head, 
                resolution, sacrament, confirmation, baptism, first_communion, 
                year_count, funeral_mass, funeral_attendance, inout_count, conditional_baptism, 
                conditional_communion, membership, establishment, memorial_mass, note, activity_date, 
                category_name, field_data } = req.body;

        console.log('활동자료 추가 요청:', { category_id, member_id, category_name, activity_date, field_data });
        
        // 날짜 처리 개선 - 시간대 문제 방지
        let processedDate = activity_date;
        if (activity_date && typeof activity_date === 'string') {
            // YYYY-MM-DD 형식인 경우 그대로 사용
            if (activity_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                processedDate = activity_date;
            } else {
                // 다른 형식인 경우 날짜 부분만 추출
                const dateMatch = activity_date.match(/(\d{4}-\d{2}-\d{2})/);
                if (dateMatch) {
                    processedDate = dateMatch[1];
                }
            }
        }

        // 새로운 동적 필드 방식 처리
        if (category_name && field_data) {
            if (!member_id || !activity_date) {
                return res.status(400).json({ error: '회원 ID와 활동 날짜는 필수입니다.' });
            }

            // 카테고리 ID 조회
            let categoryId = category_id;
            if (!categoryId && category_name) {
                const categoryResult = await pool.query(
                    'SELECT id FROM activity_categories WHERE category_name = $1',
                    [category_name]
                );
                
                if (categoryResult.rows.length === 0) {
                    return res.status(400).json({ error: '존재하지 않는 카테고리입니다.' });
                }
                categoryId = categoryResult.rows[0].id;
            }

            // 동적 필드 데이터를 기존 컬럼에 매핑
            const mappedData = {
                category_id: categoryId,
                member_id: member_id,
                target: field_data.target || null,
                count: field_data['활동 회수'] || field_data.활동횟수 || field_data.횟수 || field_data.count || 0,
                catechism_guide: field_data['교리반 인도'] || field_data['성경 쓰기'] || field_data['첫 영성체 교리반 인도'] || field_data.교리반인도 || field_data.catechism_guide || 0,
                group_join: field_data['단체 가입'] || field_data['협조단원 입단'] || field_data['협조단원 모집'] || field_data.기타 || field_data.단체가입 || field_data.group_join || 0,
                meeting_head: field_data['쉬는 교우 회두'] || field_data.회두 || field_data.meeting_head || 0,
                resolution: field_data['혼인 장애 해소'] || field_data['혼인장애 해소'] || field_data.해소 || field_data.resolution || 0,
                sacrament: field_data['판공 성사'] || field_data.판공 || field_data.병자성사 || field_data.성사 || field_data.sacrament || 0,
                confirmation: field_data['견진 성사'] || field_data.견진 || field_data.confirmation || 0,
                baptism: field_data['세례자 () 명'] || field_data.세례자 || field_data.영세자 || field_data['유아세례 외 영세'] || field_data['유아 세례'] || field_data.유아세례 || field_data.세례 || field_data.baptism || 0,
                first_communion: field_data.봉성체 || field_data.병자영성체 || field_data.첫영성체 || field_data.first_communion || 0,
                year_count: field_data['성경 통독'] || field_data.위령기도 || field_data.연도 || field_data.면담 || field_data.year_count || 0,
                funeral_mass: field_data['장례미사(고별식)'] || field_data.장례미사 || field_data.funeral_mass || 0,
                funeral_attendance: field_data['기타 상가 활동'] || field_data.상가방문 || field_data.장지참석 || field_data.funeral_attendance || 0,
                inout_count: field_data.장지수행 || field_data.입출관 || field_data.inout_count || 0,
                conditional_baptism: field_data['죽을 위험 중의 세례'] || field_data.대세자 || field_data.대세 || field_data.conditional_baptism || 0,
                conditional_communion: field_data.세례보충예식 || field_data.보례자 || field_data.보례 || field_data.conditional_communion || 0,
                membership: field_data['행동단원 입단'] || field_data['행동단원 모집'] || field_data['피정참가 () 명'] || field_data.피정참가 || field_data.입단 || field_data.membership || 0,
                establishment: field_data['자기 소개서'] || field_data['묵주 기도'] || field_data.묵주기도 || field_data['병원 및 복지시설'] || field_data['교육참가 () 명'] || field_data.교육참가 || field_data.설립 || field_data.establishment || 0,
                memorial_mass: field_data.추모미사 || field_data.memorial_mass || 0,
                note: field_data.note || note || null,
                activity_date: processedDate
            };

            const result = await pool.query(
                `INSERT INTO activity_records 
                 (category_id, member_id, target, count, catechism_guide, group_join, meeting_head, 
                  resolution, sacrament, confirmation, baptism, first_communion, 
                  year_count, funeral_mass, funeral_attendance, inout_count, conditional_baptism, 
                  conditional_communion, membership, establishment, note, memorial_mass, activity_date)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23::date)
                 RETURNING *`,
                [
                    mappedData.category_id, mappedData.member_id, mappedData.target, mappedData.count,
                    mappedData.catechism_guide, mappedData.group_join, mappedData.meeting_head,
                    mappedData.resolution, mappedData.sacrament, mappedData.confirmation, mappedData.baptism,
                    mappedData.first_communion, mappedData.year_count, mappedData.funeral_mass,
                    mappedData.funeral_attendance, mappedData.inout_count, mappedData.conditional_baptism, mappedData.conditional_communion,
                    mappedData.membership, mappedData.establishment, mappedData.note, mappedData.memorial_mass, mappedData.activity_date
                ]
            );

            console.log('동적 필드 활동자료 추가 성공:', result.rows[0].id);
            res.json({
                success: true,
                record: result.rows[0]
            });

        } else {
            // 기존 방식 처리 (하위 호환성)
            if (!category_id || !member_id || !activity_date) {
                return res.status(400).json({ error: '카테고리 ID, 회원 ID, 활동 날짜는 필수입니다.' });
            }

            const result = await pool.query(
                `INSERT INTO activity_records 
                 (category_id, member_id, target, count, catechism_guide, group_join, meeting_head, 
                  resolution, sacrament, confirmation, baptism, first_communion, 
                  year_count, funeral_mass, funeral_attendance, inout_count, conditional_baptism, 
                  conditional_communion, membership, establishment, note, memorial_mass, activity_date)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23::date)
                 RETURNING *`,
                [category_id, member_id, target, count || 0, catechism_guide || 0, group_join || 0, meeting_head || 0,
                 resolution || 0, sacrament || 0, confirmation || 0, baptism || 0, first_communion || 0,
                 year_count || 0, funeral_mass || 0, funeral_attendance || 0, inout_count || 0, conditional_baptism || 0,
                 conditional_communion || 0, membership || 0, establishment || 0, note, memorial_mass || 0, processedDate || new Date().toISOString().split('T')[0]]
            );

            console.log('기존 방식 활동자료 추가 성공:', result.rows[0].id);
            res.json({
                success: true,
                record: result.rows[0]
            });
        }

    } catch (err) {
        console.error('활동자료 추가 오류:', err);
        res.status(500).json({ error: '활동자료 추가 중 오류가 발생했습니다.' });
    }
});

// 6. 활동자료 수정 API
app.put('/api/activity-records/:id', async (req, res) => {
    try {
        const recordId = parseInt(req.params.id);
        const { target, count, catechism_guide, group_join, meeting_head, 
                resolution, sacrament, confirmation, baptism, first_communion, 
                year_count, funeral_mass, funeral_attendance, inout_count, conditional_baptism, 
                conditional_communion, membership, establishment, memorial_mass, note, activity_date } = req.body;

        if (isNaN(recordId)) {
            return res.status(400).json({ error: '유효하지 않은 활동자료 ID입니다.' });
        }

        console.log('활동자료 수정 요청:', { recordId, target, activity_date });

        const result = await pool.query(
            `UPDATE activity_records SET 
             target = $1, count = $2, catechism_guide = $3, group_join = $4, meeting_head = $5,
             resolution = $6, sacrament = $7, confirmation = $8, baptism = $9, first_communion = $10,
             year_count = $11, funeral_mass = $12, funeral_attendance = $13, inout_count = $14, conditional_baptism = $15,
             conditional_communion = $16, membership = $17, establishment = $18, note = $19, memorial_mass = $20, activity_date = $21::date,
             updated_at = CURRENT_TIMESTAMP
             WHERE id = $22 RETURNING *`,
            [target, count || 0, catechism_guide || 0, group_join || 0, meeting_head || 0,
             resolution || 0, sacrament || 0, confirmation || 0, baptism || 0, first_communion || 0,
             year_count || 0, funeral_mass || 0, funeral_attendance || 0, inout_count || 0, conditional_baptism || 0,
             conditional_communion || 0, membership || 0, establishment || 0, note, memorial_mass || 0, activity_date, recordId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: '활동자료를 찾을 수 없습니다.' });
        }

        console.log('활동자료 수정 성공:', result.rows[0].id);
        res.json({
            success: true,
            record: result.rows[0]
        });

    } catch (err) {
        console.error('활동자료 수정 오류:', err);
        res.status(500).json({ error: '활동자료 수정 중 오류가 발생했습니다.' });
    }
});

// 관리자 인증 API (지정활동 수정, 새 카테고리 추가 전용)
app.post('/api/admin-verify', async (req, res) => {
    try {
        const { name, password } = req.body;
        if (!await verifyAdminAccess(name, password)) {
            return res.status(403).json({
                success: false,
                error: '접근 권한이 없습니다. 관리자만 이용할 수 있습니다.'
            });
        }
        res.json({ success: true, message: '관리자 인증이 완료되었습니다.' });
    } catch (err) {
        console.error('관리자 인증 오류:', err);
        res.status(500).json({ success: false, error: '인증 처리 중 오류가 발생했습니다.' });
    }
});

// 로그인 ID: G직책번호 + 성명 + 폰뒷4자리 (예: G1최유나1234)
// 샘플 G7/G8: 기존 G1~G6 뒤에 7·8을 붙인 형태 허용 (예: G17임채은, G58신동욱)
const POSITION_PREFIX_LETTER_CLASS = '[TG]';
// G10 우선 매칭 (한 자리 1~9보다 먼저)
const POSITION_PREFIX_CODE_CLASS = '(?:10|[1-9])';
const POSITION_CODE_MAX = 10;

function stripLeadingPositionDigit(value) {
    return String(value || '').trim()
        .replace(new RegExp(`^(?:10|[1-9])(?=${POSITION_PREFIX_LETTER_CLASS}${POSITION_PREFIX_CODE_CLASS})`, 'i'), '');
}

function matchPositionPrefix(value) {
    const trimmed = stripLeadingPositionDigit(value);
    // G17 / G58 등: 직책 코드는 마지막 자리(7·8)
    const compound = trimmed.match(new RegExp(`^(${POSITION_PREFIX_LETTER_CLASS})([1-6])([78])`, 'i'));
    if (compound) {
        return {
            letter: compound[1].toUpperCase(),
            code: parseInt(compound[3], 10),
            rest: trimmed.slice(compound[0].length),
            compoundDigits: `${compound[2]}${compound[3]}`
        };
    }
    const match = trimmed.match(new RegExp(`^(${POSITION_PREFIX_LETTER_CLASS})(${POSITION_PREFIX_CODE_CLASS})`, 'i'));
    if (!match) return null;
    return {
        letter: match[1].toUpperCase(),
        code: parseInt(match[2], 10),
        rest: trimmed.slice(match[0].length)
    };
}

/** G7성명 → [G7성명, G17성명 … G67성명] (샘플 Gx7/Gx8 조회용) */
function expandLoginNameVariants(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return [];
    const variants = new Set([trimmed]);
    const compound = trimmed.match(new RegExp(`^(${POSITION_PREFIX_LETTER_CLASS})([1-6])([78])(.+)$`, 'i'));
    if (compound) {
        const letter = compound[1].toUpperCase();
        variants.add(`${letter}${compound[3]}${compound[4]}`);
        return [...variants];
    }
    const simple = trimmed.match(new RegExp(`^(${POSITION_PREFIX_LETTER_CLASS})([78])(.+)$`, 'i'));
    if (simple) {
        const letter = simple[1].toUpperCase();
        const digit = simple[2];
        const rest = simple[3];
        for (let i = 1; i <= 6; i += 1) {
            variants.add(`${letter}${i}${digit}${rest}`);
        }
    }
    return [...variants];
}

function getPositionCodeFromText(position) {
    const p = String(position || '').trim();
    if (!p) return null;
    if (p.includes('부단장')) return 2;
    if (p.includes('단장')) return 1;
    if (p.includes('서기')) return 3;
    if (p.includes('회계')) return 4;
    if (p.includes('행동')) return 5;
    if (p.includes('협조')) return 6;
    if (p.includes('쁘레또리운') || p.includes('쁘레토리움') || p.includes('프레토리움')) return 7;
    if (p.includes('아듀또리움') || p.includes('아듀토리움') || p.includes('오디토리움')) return 8;
    if (p.includes('예비')) return 9;
    if (p.includes('휴가')) return 10;
    return null;
}

function inferPositionCode(position, name) {
    const fromPosition = getPositionCodeFromText(position);
    if (fromPosition) return fromPosition;
    const prefix = matchPositionPrefix(name);
    if (prefix && prefix.code >= 1 && prefix.code <= POSITION_CODE_MAX) return prefix.code;
    return 5;
}

function buildLoginId(member) {
    const phone4 = String(member.phone_last4 || '').replace(/\D/g, '').slice(-4).padStart(4, '0');
    const realName = extractRealNameFromMemberName(member.name);
    return `${realName}${phone4}`;
}

function parseLoginId(loginId) {
    const trimmed = String(loginId || '').trim();
    const withoutLeadingCode = stripLeadingPositionDigit(trimmed);

    // G17성명1234 / G58성명1234
    const compoundFull = withoutLeadingCode.match(
        new RegExp(`^(${POSITION_PREFIX_LETTER_CLASS})([1-6])([78])(.+?)(\\d{4})$`, 'i')
    );
    if (compoundFull) {
        const letter = compoundFull[1].toUpperCase();
        return {
            positionCode: parseInt(compoundFull[3], 10),
            name: `${letter}${compoundFull[2]}${compoundFull[3]}${compoundFull[4]}`,
            phone_last4: compoundFull[5],
            style: 'prefixed'
        };
    }

    const fullMatch = withoutLeadingCode.match(new RegExp(`^(${POSITION_PREFIX_LETTER_CLASS})(${POSITION_PREFIX_CODE_CLASS})(.+?)(\\d{4})$`, 'i'));
    if (fullMatch) {
        const letter = fullMatch[1].toUpperCase();
        return {
            positionCode: parseInt(fullMatch[2], 10),
            name: `${letter}${fullMatch[2]}${fullMatch[3]}`,
            phone_last4: fullMatch[4],
            style: 'prefixed'
        };
    }
    const legacyMatch = trimmed.match(/^(10|[1-9])(.+?)(\d{4})$/);
    if (legacyMatch) {
        return {
            positionCode: parseInt(legacyMatch[1], 10),
            name: legacyMatch[2],
            phone_last4: legacyMatch[3],
            style: 'prefixed'
        };
    }

    // 로그인 기본: 성명+숫자4자리 (직책 접두사 없음) — 예: 김민수7327
    const plainMatch = trimmed.match(/^(.+?)(\d{4})$/);
    if (plainMatch) {
        const namePart = String(plainMatch[1] || '').trim();
        if (namePart.length >= 2 && !/\d/.test(namePart)) {
            return {
                positionCode: null,
                name: namePart,
                phone_last4: plainMatch[2],
                style: 'plain'
            };
        }
    }
    return null;
}

function memberMatchesLoginRealName(memberName, loginRealName) {
    const real = extractRealNameFromMemberName(memberName);
    const target = String(loginRealName || '').trim();
    if (!target) return false;
    return real === target || real.replace(/\d+$/, '') === target;
}

const LEGACY_FIND_MEMBER_ID_MIN = 3;
const LEGACY_FIND_MEMBER_ID_MAX = 103;

function isSampleMemberId(memberId) {
    const id = parseInt(memberId, 10);
    if (Number.isNaN(id)) return false;
    return id >= LEGACY_FIND_MEMBER_ID_MIN && id <= LEGACY_FIND_MEMBER_ID_MAX;
}

function parseLoginIdForFind(loginId) {
    const full = parseLoginId(loginId);
    if (full) {
        return { ...full, hasPhoneSuffix: true };
    }

    const trimmed = String(loginId || '').trim();
    const withoutLeadingCode = stripLeadingPositionDigit(trimmed);

    const compoundShort = withoutLeadingCode.match(
        new RegExp(`^(${POSITION_PREFIX_LETTER_CLASS})([1-6])([78])(.+)$`, 'i')
    );
    if (compoundShort && compoundShort[4]) {
        const letter = compoundShort[1].toUpperCase();
        return {
            positionCode: parseInt(compoundShort[3], 10),
            name: `${letter}${compoundShort[2]}${compoundShort[3]}${compoundShort[4]}`,
            phone_last4: null,
            hasPhoneSuffix: false
        };
    }

    const shortMatch = withoutLeadingCode.match(new RegExp(`^(${POSITION_PREFIX_LETTER_CLASS})(${POSITION_PREFIX_CODE_CLASS})(.+)$`, 'i'));
    if (!shortMatch || !shortMatch[3]) {
        const plain = trimmed;
        if (plain && !new RegExp(`^${POSITION_PREFIX_LETTER_CLASS}${POSITION_PREFIX_CODE_CLASS}`, 'i').test(plain)) {
            return {
                name: plain,
                positionCode: null,
                phone_last4: null,
                hasPhoneSuffix: false,
                isLegacyName: true
            };
        }
        return null;
    }

    const letter = shortMatch[1].toUpperCase();
    return {
        positionCode: parseInt(shortMatch[2], 10),
        name: `${letter}${shortMatch[2]}${shortMatch[3]}`,
        phone_last4: null,
        hasPhoneSuffix: false
    };
}

function expandChurchNameVariants(churchName) {
    const base = String(churchName || '').trim();
    if (!base) return [];
    const variants = new Set([base]);
    if (base.endsWith('성당')) {
        const without = base.slice(0, -2).trim();
        if (without) variants.add(without);
    } else {
        variants.add(`${base}성당`);
    }
    return [...variants];
}

function extractRealNameFromMemberName(memberName) {
    const trimmed = String(memberName || '').trim();
    const prefix = matchPositionPrefix(trimmed);
    if (prefix) return prefix.rest;
    return trimmed;
}

function matchesChurchForFind(member, churchVariants) {
    if (!churchVariants || churchVariants.length === 0) return false;
    return churchVariants.includes(member.church_name);
}

function matchesRealNameForFind(member, realName) {
    const input = String(realName || '').trim();
    if (!input) return false;
    return extractRealNameFromMemberName(member.name) === input;
}

function matchesIdForFind(member, parsed) {
    if (!parsed) return false;
    if (parsed.isLegacyName) {
        return member.name === parsed.name;
    }
    const nameVariants = expandLoginNameVariants(parsed.name);
    if (!nameVariants.includes(member.name)) return false;
    const expectedCode = inferPositionCode(member.position, member.name);
    if (expectedCode !== parsed.positionCode) return false;
    if (parsed.hasPhoneSuffix && parsed.phone_last4) {
        const phone4 = String(member.phone_last4 || '').replace(/\D/g, '').slice(-4).padStart(4, '0');
        return phone4 === parsed.phone_last4;
    }
    return member.id >= LEGACY_FIND_MEMBER_ID_MIN && member.id <= LEGACY_FIND_MEMBER_ID_MAX;
}

function scoreMemberForFind(member, { churchVariants, real_name, parsed }) {
    let score = 0;
    if (matchesChurchForFind(member, churchVariants)) score++;
    if (matchesRealNameForFind(member, real_name)) score++;
    if (matchesIdForFind(member, parsed)) score++;
    return score;
}

async function findPasswordCandidates({ churchVariants, real_name, parsed }) {
    const byId = new Map();

    if (churchVariants && churchVariants.length > 0) {
        const result = await pool.query(
            `SELECT id, name, church_name, passno, phone_last4, resident_id_front6, position, email, email_verified
             FROM member WHERE church_name = ANY($1::text[])`,
            [churchVariants]
        );
        result.rows.forEach((member) => byId.set(member.id, member));
    }

    if (real_name) {
        const escaped = String(real_name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const result = await pool.query(
            `SELECT id, name, church_name, passno, phone_last4, resident_id_front6, position, email, email_verified
             FROM member WHERE name = $1 OR name ~ $2`,
            [real_name, `^${POSITION_PREFIX_LETTER_CLASS}${POSITION_PREFIX_CODE_CLASS}${escaped}$`]
        );
        result.rows.forEach((member) => byId.set(member.id, member));
    }

    if (parsed) {
        let result;
        if (parsed.isLegacyName) {
            result = await pool.query(
                `SELECT id, name, church_name, passno, phone_last4, resident_id_front6, position, email, email_verified
                 FROM member WHERE name = $1`,
                [parsed.name]
            );
        } else if (parsed.hasPhoneSuffix && parsed.phone_last4) {
            result = await pool.query(
                `SELECT id, name, church_name, passno, phone_last4, resident_id_front6, position, email, email_verified
                 FROM member WHERE name = ANY($1::text[]) AND phone_last4 = $2`,
                [expandLoginNameVariants(parsed.name), parsed.phone_last4]
            );
        } else {
            result = await pool.query(
                `SELECT id, name, church_name, passno, phone_last4, resident_id_front6, position, email, email_verified
                 FROM member WHERE name = ANY($1::text[]) AND id BETWEEN $2 AND $3`,
                [expandLoginNameVariants(parsed.name), LEGACY_FIND_MEMBER_ID_MIN, LEGACY_FIND_MEMBER_ID_MAX]
            );
        }
        result.rows.forEach((member) => byId.set(member.id, member));
    }

    return [...byId.values()];
}

function buildLoginUserResponse(user) {
    return {
        id: user.id,
        name: user.name,
        login_id: buildLoginId(user),
        baptism_name: user.baptism_name,
        church_name: user.church_name,
        curia_name: user.curia_name,
        curia_officer: user.curia_officer || null,
        comitia_name: user.comitia_name || null,
        regia_name: user.regia_name || null,
        senatus_name: user.senatus_name || null,
        gender: user.gender || null,
        pr_name: user.pr_name,
        pr_type: user.pr_type || null,
        officer_appointed_on: toDateString(user.officer_appointed_on) || null,
        pr_meeting_weekday: user.pr_meeting_weekday || null,
        pr_meeting_hour: user.pr_meeting_hour == null ? null : Number(user.pr_meeting_hour),
        pr_meeting_minute: user.pr_meeting_minute == null ? null : Number(user.pr_meeting_minute),
        pr_meeting_place: user.pr_meeting_place || null,
        pr_founded_on: toDateString(user.pr_founded_on) || null,
        pr_approved_on: toDateString(user.pr_approved_on) || null,
        curia_officer_elected_on: toDateString(user.curia_officer_elected_on) || null,
        curia_approved_on: toDateString(user.curia_approved_on) || null,
        curia_meeting_on: toDateString(user.curia_meeting_on) || null,
        curia_meeting_place: user.curia_meeting_place || null,
        position: user.position,
        email: user.email || null,
        is_admin: isCategoryAdminMember(user)
    };
}

const ALLOWED_COUNCIL_OFFICERS = new Set(['K1', 'K2', 'K3', 'K4']);
const COUNCIL_TYPE_META = {
    '꾸리아': { letter: 'K', nameField: 'curia_name' }
};
const COUNCIL_ROLE_NUM = {
    '단장': '1',
    '부단장': '2',
    '서기': '3',
    '회계': '4'
};
const LETTER_TO_COUNCIL_TYPE = {
    K: '꾸리아'
};
const NUM_TO_COUNCIL_ROLE = {
    '1': '단장',
    '2': '부단장',
    '3': '서기',
    '4': '회계'
};

function resolveCouncilOfficerPayload(body) {
    const councilType = String(body.council_type || '').trim();
    const positionRole = String(body.position_role || '').trim();
    const councilName = String(body.council_name || body.curia_name || '').trim();
    let officerCode = String(body.curia_officer || '').trim().toUpperCase();

    if (councilType && councilType !== '꾸리아') {
        return { error: '꾸리아 직급만 등록할 수 있습니다.' };
    }

    if ((councilType === '꾸리아' || !councilType) && positionRole) {
        const meta = COUNCIL_TYPE_META['꾸리아'];
        const num = COUNCIL_ROLE_NUM[positionRole];
        if (!meta || !num) {
            return { error: '직책 선택이 올바르지 않습니다.' };
        }
        officerCode = `${meta.letter}${num}`;
    } else if (ALLOWED_COUNCIL_OFFICERS.has(officerCode)) {
        // 하위호환: 코드만 온 경우 직책 추론
    } else {
        return { error: '꾸리아와 직책(단장/부단장/서기/회계)을 선택해주세요.' };
    }

    if (!ALLOWED_COUNCIL_OFFICERS.has(officerCode)) {
        return { error: '분류번호는 K1~K4 형식이어야 합니다.' };
    }

    const num = officerCode[1];
    const resolvedType = '꾸리아';
    const resolvedRole = positionRole || NUM_TO_COUNCIL_ROLE[num];
    const meta = COUNCIL_TYPE_META[resolvedType];
    if (!meta || !resolvedRole) {
        return { error: '직책 선택이 올바르지 않습니다.' };
    }
    if (!councilName) {
        return { error: '꾸리아 이름을 입력해주세요.' };
    }

    return {
        councilType: resolvedType,
        positionRole: resolvedRole,
        councilName,
        officerCode,
        nameField: meta.nameField
    };
}

function isG1toG4Member(user) {
    if (!user) return false;
    const code = inferPositionCode(user.position, user.name);
    return code >= 1 && code <= 4;
}

async function resolveFindPasswordMember(body) {
    const loginId = (body.id || '').trim();
    const church_name = (body.church_name || '').trim();
    const real_name = (body.real_name || '').trim();

    const providedCount = [loginId, church_name, real_name].filter(Boolean).length;
    if (providedCount < 2) {
        const error = new Error('FIND_INPUT_REQUIRED');
        error.status = 400;
        throw error;
    }

    const parsed = loginId ? parseLoginIdForFind(loginId) : null;
    const churchVariants = church_name ? expandChurchNameVariants(church_name) : null;
    const candidates = await findPasswordCandidates({ churchVariants, real_name, parsed });
    const matched = candidates.filter((member) => scoreMemberForFind(member, {
        churchVariants,
        real_name,
        parsed
    }) >= 2);

    if (matched.length === 0) {
        const error = new Error('FIND_NOT_FOUND');
        error.status = 404;
        throw error;
    }
    if (matched.length > 1) {
        const error = new Error('FIND_AMBIGUOUS');
        error.status = 404;
        throw error;
    }
    return matched[0];
}

function mapFindPasswordError(error, res) {
    const code = error.message;
    if (code === 'FIND_INPUT_REQUIRED') {
        return res.status(400).json({ error: '성당, 본명, ID 중 2가지 이상 입력해주세요.' });
    }
    if (code === 'FIND_NOT_FOUND') {
        return res.status(404).json({ error: '일치하는 회원 정보를 찾을 수 없습니다.' });
    }
    if (code === 'FIND_AMBIGUOUS') {
        return res.status(404).json({ error: '여러 명이 일치합니다. 입력 정보를 더 정확히 입력해주세요.' });
    }
    if (code === 'EMAIL_NOT_REGISTERED') {
        return res.status(400).json({ error: '등록된 Gmail이 없습니다. 프로필수정에서 Gmail을 등록해주세요.' });
    }
    if (code === 'GMAIL_ONLY') {
        return res.status(400).json({ error: 'Gmail 주소만 사용할 수 있습니다.' });
    }
    if (code === 'CODE_NOT_FOUND' || code === 'CODE_INVALID') {
        return res.status(400).json({ error: '인증코드가 올바르지 않습니다.' });
    }
    if (code === 'CODE_EXPIRED') {
        return res.status(400).json({ error: '인증코드가 만료되었습니다. 다시 요청해주세요.' });
    }
    if (code === 'CODE_ALREADY_USED') {
        return res.status(400).json({ error: '이미 사용된 인증코드입니다. 다시 요청해주세요.' });
    }
    if (code === 'TOKEN_INVALID' || code === 'TOKEN_EXPIRED') {
        return res.status(400).json({ error: '이메일 인증이 만료되었습니다. 다시 인증해주세요.' });
    }
    if (code === 'GOOGLE_NOT_CONFIGURED') {
        return res.status(503).json({ error: 'Google 로그인이 설정되지 않았습니다.' });
    }
    if (code === 'GOOGLE_INVALID_TOKEN' || code === 'GOOGLE_EMAIL_NOT_VERIFIED') {
        return res.status(401).json({ error: 'Google 인증에 실패했습니다.' });
    }
    return null;
}

async function getMemberVerifiedEmail(memberId) {
    const id = parseInt(memberId, 10);
    if (!id || Number.isNaN(id)) {
        const error = new Error('MEMBER_NOT_FOUND');
        error.status = 400;
        throw error;
    }
    const result = await pool.query(
        'SELECT id, email, email_verified FROM member WHERE id = $1',
        [id]
    );
    if (result.rows.length === 0) {
        const error = new Error('MEMBER_NOT_FOUND');
        error.status = 404;
        throw error;
    }
    const member = result.rows[0];
    if (!member.email || !member.email_verified) {
        const error = new Error('EMAIL_NOT_REGISTERED');
        error.status = 400;
        throw error;
    }
    return member;
}

function isCategoryAdminEmail(email) {
    return normalizeEmail(email) === normalizeEmail(CATEGORY_ADMIN_EMAIL);
}

function isCategoryAdminMember(member) {
    if (!member) return false;
    if (String(member.name || '').trim() === ADMIN_NAME) return true;
    return isCategoryAdminEmail(member.email);
}

async function getMemberById(memberId) {
    const result = await pool.query(
        `SELECT id, name, email, email_verified, baptism_name, church_name,
                curia_name, pr_name, position, phone_last4, phone_full
         FROM member
         WHERE id = $1`,
        [memberId]
    );
    return result.rows[0] || null;
}

async function assertDeleteMemberAdmin(memberId) {
    const member = await getMemberById(memberId);
    if (!member) {
        const error = new Error('MEMBER_NOT_FOUND');
        error.status = 404;
        throw error;
    }
    if (!isCategoryAdminMember(member)) {
        const error = new Error('DELETE_ADMIN_ONLY');
        error.status = 403;
        throw error;
    }
    return member;
}

/** 관리자 요청자 확인 (김학숭은 이메일 없이 허용) */
async function assertAdminRequester(requesterMemberId) {
    const member = await assertDeleteMemberAdmin(requesterMemberId);
    const isNamedAdmin = String(member.name || '').trim() === ADMIN_NAME;
    if (!isNamedAdmin && (!member.email || !member.email_verified)) {
        const error = new Error('EMAIL_NOT_REGISTERED');
        error.status = 400;
        throw error;
    }
    return member;
}

function matchesNameForDeleteSearch(memberName, inputName) {
    const input = String(inputName || '').trim();
    if (!input) return false;
    const full = String(memberName || '').trim();
    const real = extractRealNameFromMemberName(full);
    const realNoDigits = real.replace(/\d+$/, '');
    return full === input
        || real === input
        || realNoDigits === input
        || full.includes(input)
        || real.includes(input);
}

async function consumeSensitiveActionToken(memberId, purpose, verificationToken) {
    if (!SENSITIVE_ACTION_PURPOSES.includes(purpose)) {
        const error = new Error('INVALID_PURPOSE');
        error.status = 400;
        throw error;
    }
    const member = await getMemberVerifiedEmail(memberId);
    const context = await consumeVerificationToken(pool, member.email, purpose, verificationToken);
    const ctxMemberId = context && context.member_id != null
        ? parseInt(context.member_id, 10)
        : parseInt(memberId, 10);
    if (ctxMemberId !== parseInt(memberId, 10)) {
        const error = new Error('TOKEN_MEMBER_MISMATCH');
        error.status = 403;
        throw error;
    }
    return member;
}

function mapSensitiveActionError(error, res) {
    const mapped = mapFindPasswordError(error, res);
    if (mapped) return mapped;
    if (error.message === 'MEMBER_NOT_FOUND') {
        return res.status(error.status || 404).json({ error: '회원 정보를 찾을 수 없습니다.' });
    }
    if (error.message === 'TOKEN_MEMBER_MISMATCH') {
        return res.status(403).json({ error: '이메일 인증 정보가 일치하지 않습니다.' });
    }
    if (error.message === 'INVALID_PURPOSE') {
        return res.status(400).json({ error: '지원하지 않는 인증 용도입니다.' });
    }
    if (error.message === 'DELETE_ADMIN_ONLY') {
        return res.status(403).json({ error: '회원 삭제는 관리자(김학숭)만 이용할 수 있습니다.' });
    }
    return null;
}

function buildFindPasswordResponse(member) {
    const passwords = [];
    const passno = String(member.passno || '').trim();
    const legacy = String(member.phone_last4 || '').padStart(4, '0').slice(-4)
        + String(member.resident_id_front6 || '').padStart(6, '0').slice(-6);

    if (passno) {
        passwords.push({ label: '등록 비밀번호', value: passno });
    }
    if (legacy && legacy !== passno) {
        passwords.push({ label: '기존 비밀번호', value: legacy });
    }

    return {
        passwords,
        member: {
            name: member.name,
            church_name: member.church_name,
            login_id: buildLoginId(member)
        }
    };
}

// Google Play 인앱결제 (Play Console 설정 후 활성화)
app.get('/api/billing/config', (req, res) => {
    res.json({
        success: true,
        ...getBillingPublicConfig()
    });
});

app.post('/api/billing/verify', async (req, res) => {
    try {
        const memberId = parseInt(req.body.member_id, 10);
        const productId = String(req.body.product_id || '').trim();
        const purchaseToken = String(req.body.purchase_token || '').trim();

        if (!memberId || Number.isNaN(memberId) || !productId || !purchaseToken) {
            return res.status(400).json({ success: false, error: 'member_id, product_id, purchase_token 이 필요합니다.' });
        }

        if (!isPlayBillingConfigured()) {
            return res.status(503).json({
                success: false,
                error: 'Google Play 인앱결제가 아직 설정되지 않았습니다. Play Console 연동 후 이용 가능합니다.'
            });
        }

        const memberCheck = await pool.query('SELECT id FROM member WHERE id = $1', [memberId]);
        if (memberCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: '회원을 찾을 수 없습니다.' });
        }

        const verified = await verifyPurchaseWithGoogle({ productId, purchaseToken });
        const saved = await saveVerifiedPurchase(pool, memberId, verified);

        res.json({
            success: true,
            message: '구매가 검증되었습니다.',
            purchase: {
                id: saved.id,
                product_id: saved.product_id,
                order_id: saved.order_id,
                purchase_state: saved.purchase_state
            }
        });
    } catch (err) {
        if (err.message === 'PLAY_BILLING_NOT_CONFIGURED') {
            return res.status(503).json({ success: false, error: 'Google Play 인앱결제 설정이 필요합니다.' });
        }
        if (err.message === 'PURCHASE_NOT_COMPLETED') {
            return res.status(400).json({ success: false, error: '완료되지 않은 구매입니다.' });
        }
        console.error('인앱결제 검증 오류:', err);
        res.status(500).json({ success: false, error: '구매 검증 중 오류가 발생했습니다.' });
    }
});

// 인증 설정
app.get('/api/auth/config', (req, res) => {
    res.json({
        success: true,
        googleClientId: getGoogleClientId(),
        googleLoginEnabled: isGoogleLoginConfigured(),
        emailAuthEnabled: true,
        gmailOnly: true,
        playBilling: getBillingPublicConfig()
    });
});

app.post('/api/auth/email/send-code', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const purpose = String(req.body.purpose || '').trim();

        if (!email || !purpose) {
            return res.status(400).json({ error: 'Gmail과 용도를 입력해주세요.' });
        }
        if (!['register', 'find_password', 'withdraw', 'delete_member'].includes(purpose)) {
            return res.status(400).json({ error: '지원하지 않는 인증 용도입니다.' });
        }

        if (purpose === 'register') {
            const existing = await pool.query(
                'SELECT id FROM member WHERE LOWER(email) = LOWER($1)',
                [email]
            );
            if (existing.rows.length > 0) {
                return res.status(400).json({ error: '이미 등록된 Gmail입니다.' });
            }
        }

        const result = await createEmailVerification(pool, email, purpose, req.body.context || null);
        res.json({
            success: true,
            message: '인증코드를 발송했습니다.',
            emailHint: result.emailHint,
            devMode: result.devMode,
            devCode: result.devCode || undefined
        });
    } catch (error) {
        const mapped = mapFindPasswordError(error, res);
        if (mapped) return mapped;
        console.error('인증코드 발송 오류:', error);
        res.status(500).json({ error: '인증코드 발송 중 오류가 발생했습니다.' });
    }
});

app.post('/api/auth/email/verify-code', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const code = String(req.body.code || '').trim();
        const purpose = String(req.body.purpose || '').trim();

        if (!email || !code || !purpose) {
            return res.status(400).json({ error: 'Gmail, 인증코드, 용도를 입력해주세요.' });
        }

        const result = await verifyEmailCode(pool, email, code, purpose);
        res.json({
            success: true,
            message: 'Gmail 인증이 완료되었습니다.',
            verification_token: result.verification_token
        });
    } catch (error) {
        const mapped = mapFindPasswordError(error, res);
        if (mapped) return mapped;
        console.error('인증코드 확인 오류:', error);
        res.status(500).json({ error: '인증코드 확인 중 오류가 발생했습니다.' });
    }
});

app.post('/api/auth/sensitive-action/send-code', async (req, res) => {
    try {
        const memberId = parseInt(req.body.member_id, 10);
        const purpose = String(req.body.purpose || '').trim();

        if (!memberId || Number.isNaN(memberId) || !SENSITIVE_ACTION_PURPOSES.includes(purpose)) {
            return res.status(400).json({ error: '요청 정보가 올바르지 않습니다.' });
        }

        if (purpose === 'delete_member') {
            await assertDeleteMemberAdmin(memberId);
        }

        if (purpose === 'withdraw' && isSampleMemberId(memberId)) {
            return res.status(403).json({ error: '샘플 회원(3~103번)은 탈단을 할 수 없습니다.' });
        }

        const member = await getMemberVerifiedEmail(memberId);
        const result = await createEmailVerification(pool, member.email, purpose, { member_id: memberId });
        res.json({
            success: true,
            message: '인증코드를 발송했습니다.',
            email: member.email,
            emailHint: result.emailHint,
            devMode: result.devMode,
            devCode: result.devCode || undefined
        });
    } catch (error) {
        const mapped = mapSensitiveActionError(error, res);
        if (mapped) return mapped;
        console.error('민감 작업 인증코드 발송 오류:', error);
        res.status(500).json({ error: '인증코드 발송 중 오류가 발생했습니다.' });
    }
});

app.post('/api/auth/google', async (req, res) => {
    try {
        const credential = String(req.body.credential || '').trim();
        if (!credential) {
            return res.status(400).json({ error: 'Google 인증 정보가 없습니다.' });
        }

        const googleUser = await verifyGoogleCredential(credential);
        let result = await pool.query(
            `SELECT id, name, baptism_name, church_name, curia_name, pr_name, position, email
             FROM member WHERE google_id = $1`,
            [googleUser.google_id]
        );

        if (result.rows.length === 0) {
            result = await pool.query(
                `SELECT id, name, baptism_name, church_name, curia_name, pr_name, position, email
                 FROM member WHERE LOWER(email) = LOWER($1) AND email_verified = true`,
                [googleUser.email]
            );
            if (result.rows.length > 0) {
                await pool.query(
                    'UPDATE member SET google_id = $1 WHERE id = $2',
                    [googleUser.google_id, result.rows[0].id]
                );
            }
        }

        if (result.rows.length === 0) {
            return res.status(404).json({ error: '등록된 회원이 아닙니다. 먼저 Gmail 인증 후 회원가입을 해주세요.' });
        }

        const user = result.rows[0];
        setImmediate(() => {
            purgeOldActivityRecords(pool, { memberId: user.id })
                .then((purgeResult) => {
                    if (!purgeResult.skipped && purgeResult.deleted > 0) {
                        console.log(
                            `🧹 Google 로그인 시 활동자료 자동삭제: member=${user.id} ${purgeResult.deleted}건 (${purgeResult.months}개월)`
                        );
                    }
                })
                .catch((purgeError) => {
                    console.warn('Google 로그인 시 활동자료 자동삭제 실패:', purgeError.message || purgeError);
                });
        });
        res.json({
            success: true,
            message: 'Google 로그인 성공',
            user: buildLoginUserResponse(user)
        });
    } catch (error) {
        const mapped = mapFindPasswordError(error, res);
        if (mapped) return mapped;
        console.error('Google 로그인 오류:', error);
        res.status(500).json({ error: 'Google 로그인 중 오류가 발생했습니다.' });
    }
});

// 로그인 ID 후보 조회: 직책 + 성명(+선택적 숫자4자리) → 일치 회원 목록
app.get('/api/login-id-suggest', async (req, res) => {
    try {
        const rawName = String(req.query.name || '').trim();
        const phoneLast4 = String(req.query.phone_last4 || '').replace(/\D/g, '').slice(-4);
        const positionCodeRaw = parseInt(req.query.position_code, 10);
        const hasPositionFilter = Number.isFinite(positionCodeRaw)
            && positionCodeRaw >= 1
            && positionCodeRaw <= POSITION_CODE_MAX;
        const positionCode = hasPositionFilter ? positionCodeRaw : null;
        const hasPhone = phoneLast4.length === 4;

        if (!rawName) {
            return res.status(400).json({ success: false, error: '성명을 입력해주세요.' });
        }
        if (rawName.length < 2) {
            return res.status(400).json({ success: false, error: '성명을 2자 이상 입력해주세요.' });
        }

        let result;
        if (hasPhone) {
            result = await pool.query(
                `SELECT id, name, baptism_name, position, phone_last4, church_name, pr_name
                 FROM member
                 WHERE phone_last4 = $1
                 ORDER BY id
                 LIMIT 100`,
                [phoneLast4]
            );
        } else {
            result = await pool.query(
                `SELECT id, name, baptism_name, position, phone_last4, church_name, pr_name
                 FROM member
                 WHERE name ILIKE $1
                 ORDER BY id
                 LIMIT 120`,
                [`%${rawName}%`]
            );
        }

        const POSITION_LABELS = {
            1: '단장', 2: '부단장', 3: '서기', 4: '회계',
            5: '행동단원', 6: '협조단원', 7: '쁘레또리운', 8: '아듀또리움', 9: '예비단원', 10: '휴가'
        };

        const members = result.rows
            .filter((row) => {
                const real = extractRealNameFromMemberName(row.name);
                const realNoDigits = real.replace(/\d+$/, '');
                const nameOk = real === rawName
                    || realNoDigits === rawName
                    || real.startsWith(rawName)
                    || realNoDigits.startsWith(rawName);
                if (!nameOk) return false;
                if (hasPhone) {
                    const phone4 = String(row.phone_last4 || '').replace(/\D/g, '').slice(-4);
                    if (phone4 !== phoneLast4) return false;
                }
                if (hasPositionFilter) {
                    return inferPositionCode(row.position, row.name) === positionCode;
                }
                return true;
            })
            .map((row) => {
                const real = extractRealNameFromMemberName(row.name);
                const phone4 = String(row.phone_last4 || '').replace(/\D/g, '').slice(-4).padStart(4, '0');
                const exact = real === rawName || real.replace(/\d+$/, '') === rawName;
                const code = inferPositionCode(row.position, row.name);
                const tPrefix = code ? `G${code}` : '';
                return {
                    id: row.id,
                    name: row.name,
                    display_name: real,
                    baptism_name: row.baptism_name || '',
                    position: row.position || '',
                    position_code: code || '',
                    position_label: (code && POSITION_LABELS[code]) || row.position || '',
                    position_tprefix: tPrefix,
                    phone_last4: phone4,
                    church_name: row.church_name || '',
                    pr_name: row.pr_name || '',
                    id_body: `${real}${phone4}`,
                    login_id: buildLoginId(row),
                    exact_name: exact
                };
            })
            .sort((a, b) => Number(b.exact_name) - Number(a.exact_name)
                || a.display_name.localeCompare(b.display_name, 'ko')
                || Number(a.position_code || 99) - Number(b.position_code || 99));

        res.json({ success: true, count: members.length, members });
    } catch (err) {
        console.error('로그인 ID 후보 조회 오류:', err);
        res.status(500).json({ success: false, error: 'ID 후보 조회 중 오류가 발생했습니다.' });
    }
});

// 7. 로그인 API
app.post('/api/login', async (req, res) => {
    try {
        const loginId = (req.body.id || req.body.name || '').trim();
        const { password } = req.body;

        console.log('로그인 요청:', { loginId, password: password ? '***' : 'undefined' });

        if (!loginId || !password) {
            return res.status(400).json({ error: 'ID와 비밀번호를 입력해주세요.' });
        }

        let result;
        const parsed = parseLoginId(loginId);

        if (parsed && parsed.style === 'plain') {
            // 성명+숫자4자리 로그인 (DB name이 G1성명 형태여도 성명 부분으로 매칭)
            result = await pool.query(
                `SELECT * FROM member
                 WHERE phone_last4 = $1
                   AND (passno = $2 OR phone_last4 || resident_id_front6 = $2)`,
                [parsed.phone_last4, password]
            );
            result = {
                rows: result.rows.filter((row) => memberMatchesLoginRealName(row.name, parsed.name))
            };
        } else if (parsed) {
            result = await pool.query(
                `SELECT * FROM member
                 WHERE name = ANY($1::text[]) AND phone_last4 = $2
                   AND (passno = $3 OR phone_last4 || resident_id_front6 = $3)`,
                [expandLoginNameVariants(parsed.name), parsed.phone_last4, password]
            );
            if (result.rows.length > 0 && parsed.positionCode != null) {
                const expectedCode = inferPositionCode(result.rows[0].position, result.rows[0].name);
                if (expectedCode !== parsed.positionCode) {
                    return res.status(401).json({ error: 'ID(직책) 또는 비밀번호가 올바르지 않습니다.' });
                }
            }
        } else {
            // 성명만 입력(레거시): 비밀번호 일치 회원 중 성명 매칭
            result = await pool.query(
                `SELECT * FROM member
                 WHERE passno = $1 OR phone_last4 || resident_id_front6 = $1`,
                [password]
            );
            result = {
                rows: result.rows.filter((row) =>
                    row.name === loginId || memberMatchesLoginRealName(row.name, loginId)
                )
            };
        }

        if (result.rows.length === 0) {
            console.log('❌ 로그인 실패: 사용자를 찾을 수 없음');
            return res.status(401).json({ error: 'ID 또는 비밀번호가 올바르지 않습니다.' });
        }

        const user = result.rows[0];
        console.log('✅ 로그인 성공:', user.name);

        // 로그인 ID가 입력한 활동자료 중 보관기간(기본 30개월) 경과분 즉시 정리
        setImmediate(() => {
            purgeOldActivityRecords(pool, { memberId: user.id })
                .then((purgeResult) => {
                    if (!purgeResult.skipped && purgeResult.deleted > 0) {
                        console.log(
                            `🧹 로그인 시 활동자료 자동삭제: member=${user.id} ${purgeResult.deleted}건 (${purgeResult.months}개월)`
                        );
                    }
                })
                .catch((purgeError) => {
                    console.warn('로그인 시 활동자료 자동삭제 실패:', purgeError.message || purgeError);
                });
        });

        res.json({
            success: true,
            message: '로그인 성공',
            user: buildLoginUserResponse(user)
        });

    } catch (err) {
        console.error('❌ 로그인 오류:', err);

        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
            res.status(503).json({ error: '데이터베이스 연결에 실패했습니다. 잠시 후 다시 시도해주세요.' });
        } else if (err.code === 'ETIMEDOUT') {
            res.status(504).json({ error: '데이터베이스 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.' });
        } else if (err.code === '53300') {
            try {
                await reclaimOrphanedConnections();
            } catch (_) {
                /* ignore */
            }
            res.status(503).json({
                error: '데이터베이스 연결이 일시적으로 부족합니다. 잠시 후 다시 시도하거나, 서버를 재시작해 주세요.'
            });
        } else {
            res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' });
        }
    }
});

// 비밀번호 찾기 1단계: 회원 확인 후 등록 Gmail로 인증코드 발송
app.post('/api/find-password/request', async (req, res) => {
    try {
        const member = await resolveFindPasswordMember(req.body);
        if (!member.email || !member.email_verified) {
            const error = new Error('EMAIL_NOT_REGISTERED');
            return mapFindPasswordError(error, res);
        }

        const result = await createEmailVerification(pool, member.email, 'find_password', {
            member_id: member.id
        });

        res.json({
            success: true,
            message: '등록된 Gmail로 인증코드를 발송했습니다.',
            emailHint: result.emailHint,
            devMode: result.devMode,
            devCode: result.devCode || undefined
        });
    } catch (error) {
        const mapped = mapFindPasswordError(error, res);
        if (mapped) return mapped;
        console.error('비밀번호 찾기 요청 오류:', error);
        res.status(500).json({ error: '비밀번호 찾기 요청 중 오류가 발생했습니다.' });
    }
});

// 비밀번호 찾기 2단계: Gmail 인증 후 비밀번호 반환
app.post('/api/find-password/complete', async (req, res) => {
    try {
        const member = await resolveFindPasswordMember(req.body);
        const code = String(req.body.code || '').trim();
        if (!code) {
            return res.status(400).json({ error: 'Gmail 인증코드를 입력해주세요.' });
        }
        if (!member.email || !member.email_verified) {
            const error = new Error('EMAIL_NOT_REGISTERED');
            return mapFindPasswordError(error, res);
        }

        await verifyEmailCode(pool, member.email, code, 'find_password');
        const response = buildFindPasswordResponse(member);
        if (response.passwords.length === 0) {
            return res.status(404).json({ error: '비밀번호 정보를 찾을 수 없습니다.' });
        }

        res.json({
            success: true,
            ...response
        });
    } catch (error) {
        const mapped = mapFindPasswordError(error, res);
        if (mapped) return mapped;
        console.error('비밀번호 찾기 완료 오류:', error);
        res.status(500).json({ error: '비밀번호 찾기 중 오류가 발생했습니다.' });
    }
});

// 이전 단일 API 호환 (Gmail 인증 필요 안내)
app.post('/api/find-password', async (req, res) => {
    res.status(400).json({
        error: 'Gmail 인증이 필요합니다. 먼저 인증코드를 요청해주세요.',
        requireGmailVerification: true
    });
});

// 8. 세목별 활동 기록 API (daily_activities 테이블)
app.post('/api/daily-activities', async (req, res) => {
    try {
        const { member_id, activity_date, evangelism_count, care_count, needy_count, legion_count } = req.body;

        console.log('세목별 활동 기록 요청:', { member_id, activity_date, evangelism_count, care_count, needy_count, legion_count });

        if (!member_id || !activity_date) {
            return res.status(400).json({ error: '회원 ID와 활동 날짜는 필수입니다.' });
        }

        // 기존 기록이 있는지 확인
        const existingRecord = await pool.query(
            'SELECT id FROM daily_activities WHERE member_id = $1 AND activity_date = $2',
            [member_id, activity_date]
        );

        let result;
        if (existingRecord.rows.length > 0) {
            // 기존 기록 업데이트
            result = await pool.query(
                `UPDATE daily_activities SET 
                 evangelism_count = $1, care_count = $2, needy_count = $3, legion_count = $4,
                 updated_at = CURRENT_TIMESTAMP
                 WHERE member_id = $5 AND activity_date = $6
                 RETURNING *`,
                [evangelism_count || 0, care_count || 0, needy_count || 0, legion_count || 0, member_id, activity_date]
            );
            console.log('세목별 활동 기록 업데이트 성공:', result.rows[0].id);
        } else {
            // 새 기록 추가
            result = await pool.query(
                `INSERT INTO daily_activities 
                 (member_id, activity_date, evangelism_count, care_count, needy_count, legion_count)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [member_id, activity_date, evangelism_count || 0, care_count || 0, needy_count || 0, legion_count || 0]
            );
            console.log('세목별 활동 기록 추가 성공:', result.rows[0].id);
        }

        res.json({
            success: true,
            record: result.rows[0]
        });

    } catch (err) {
        console.error('세목별 활동 기록 오류:', err);
        res.status(500).json({ error: '세목별 활동 기록 중 오류가 발생했습니다.' });
    }
});

// 9. 기도생활 기록 API (prayer_activities 테이블)
app.post('/api/prayer-activities', async (req, res) => {
    try {
        const { member_id, week_start_date, daily_prayer_count, rosary_count, mass_attendance_count, confession_count } = req.body;

        console.log('기도생활 기록 요청:', { member_id, week_start_date, daily_prayer_count, rosary_count, mass_attendance_count, confession_count });

        if (!member_id || !week_start_date) {
            return res.status(400).json({ error: '회원 ID와 주 시작일은 필수입니다.' });
        }

        // 기존 기록이 있는지 확인
        const existingRecord = await pool.query(
            'SELECT id FROM prayer_activities WHERE member_id = $1 AND week_start_date = $2',
            [member_id, week_start_date]
        );

        let result;
        if (existingRecord.rows.length > 0) {
            // 기존 기록 업데이트
            result = await pool.query(
                `UPDATE prayer_activities SET 
                 daily_prayer_count = $1, rosary_count = $2, mass_attendance_count = $3, confession_count = $4,
                 updated_at = CURRENT_TIMESTAMP
                 WHERE member_id = $5 AND week_start_date = $6
                 RETURNING *`,
                [daily_prayer_count || 0, rosary_count || 0, mass_attendance_count || 0, confession_count || 0, member_id, week_start_date]
            );
            console.log('기도생활 기록 업데이트 성공:', result.rows[0].id);
        } else {
            // 새 기록 추가
            result = await pool.query(
                `INSERT INTO prayer_activities 
                 (member_id, week_start_date, daily_prayer_count, rosary_count, mass_attendance_count, confession_count)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [member_id, week_start_date, daily_prayer_count || 0, rosary_count || 0, mass_attendance_count || 0, confession_count || 0]
            );
            console.log('기도생활 기록 추가 성공:', result.rows[0].id);
        }

        res.json({
            success: true,
            record: result.rows[0]
        });

    } catch (err) {
        console.error('기도생활 기록 오류:', err);
        res.status(500).json({ error: '기도생활 기록 중 오류가 발생했습니다.' });
    }
});

// 10. 지구와 함께 활동 기록 API (community_activities 테이블)
app.post('/api/community-activities', async (req, res) => {
    try {
        const { member_id, week_start_date, community_service_count, environmental_activity_count, social_justice_count, charity_work_count } = req.body;

        console.log('지구와 함께 활동 기록 요청:', { member_id, week_start_date, community_service_count, environmental_activity_count, social_justice_count, charity_work_count });

        if (!member_id || !week_start_date) {
            return res.status(400).json({ error: '회원 ID와 주 시작일은 필수입니다.' });
        }

        // 기존 기록이 있는지 확인
        const existingRecord = await pool.query(
            'SELECT id FROM community_activities WHERE member_id = $1 AND week_start_date = $2',
            [member_id, week_start_date]
        );

        let result;
        if (existingRecord.rows.length > 0) {
            // 기존 기록 업데이트
            result = await pool.query(
                `UPDATE community_activities SET 
                 community_service_count = $1, environmental_activity_count = $2, social_justice_count = $3, charity_work_count = $4,
                 updated_at = CURRENT_TIMESTAMP
                 WHERE member_id = $1 AND week_start_date = $2
                 RETURNING *`,
                [community_service_count || 0, environmental_activity_count || 0, social_justice_count || 0, charity_work_count || 0, member_id, week_start_date]
            );
            console.log('지구와 함께 활동 기록 업데이트 성공:', result.rows[0].id);
        } else {
            // 새 기록 추가
            result = await pool.query(
                `INSERT INTO community_activities 
                 (member_id, week_start_date, community_service_count, environmental_activity_count, social_justice_count, charity_work_count)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [member_id, week_start_date, community_service_count || 0, environmental_activity_count || 0, social_justice_count || 0, charity_work_count || 0]
            );
            console.log('지구와 함께 활동 기록 추가 성공:', result.rows[0].id);
        }

        res.json({
            success: true,
            record: result.rows[0]
        });

    } catch (err) {
        console.error('지구와 함께 활동 기록 오류:', err);
        res.status(500).json({ error: '지구와 함께 활동 기록 중 오류가 발생했습니다.' });
    }
});

// 11. 개인정보 조회 API
app.get('/api/user/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        console.log('개인정보 조회 요청 - 사용자 ID:', userId, '타입:', typeof userId);
        
        if (isNaN(userId)) {
            console.log('유효하지 않은 사용자 ID:', req.params.id);
            return res.status(400).json({ error: '유효하지 않은 사용자 ID입니다.' });
        }

        console.log('데이터베이스 조회 시도 - ID:', userId);
        
        const result = await pool.query(
            `SELECT id, name, baptism_name, gender, church_name, curia_name, curia_officer,
                    comitia_name, regia_name, senatus_name, pr_name, pr_type, position, 
                    phone_last4, resident_id_front6, phone_full, resident_id_full, passno, email,
                    officer_appointed_on, pr_meeting_weekday, pr_meeting_hour, pr_meeting_minute, pr_meeting_place,
                    pr_founded_on, pr_approved_on, curia_officer_elected_on,
                    curia_approved_on, curia_meeting_on, curia_meeting_place
             FROM member WHERE id = $1`,
            [userId]
        );

        console.log('데이터베이스 조회 결과 - 행 수:', result.rows.length);

        if (result.rows.length === 0) {
            console.log('사용자를 찾을 수 없음 - ID:', userId);
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }

        console.log('개인정보 조회 성공:', result.rows[0].name, 'ID:', result.rows[0].id);
        res.json({
            success: true,
            user: result.rows[0]
        });

    } catch (err) {
        console.error('개인정보 조회 오류:', err);
        res.status(500).json({ error: '개인정보 조회 중 오류가 발생했습니다.' });
    }
});

// 탈단: 이메일 인증 후 소속 Pr 명칭(pr_name)만 삭제
app.post('/api/withdraw', async (req, res) => {
    try {
        const memberId = parseInt(req.body.member_id, 10);
        const emailVerificationToken = String(req.body.email_verification_token || '').trim();

        if (!memberId || Number.isNaN(memberId) || !emailVerificationToken) {
            return res.status(400).json({ error: '탈단 요청 정보가 올바르지 않습니다.' });
        }

        if (isSampleMemberId(memberId)) {
            return res.status(403).json({ error: '샘플 회원(3~103번)은 탈단을 할 수 없습니다.' });
        }

        try {
            await consumeSensitiveActionToken(memberId, 'withdraw', emailVerificationToken);
        } catch (error) {
            const mapped = mapSensitiveActionError(error, res);
            if (mapped) return mapped;
            throw error;
        }

        const existing = await pool.query(
            'SELECT id, name, pr_name FROM member WHERE id = $1',
            [memberId]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: '회원 정보를 찾을 수 없습니다.' });
        }

        const result = await pool.query(
            `UPDATE member
             SET pr_name = NULL
             WHERE id = $1
             RETURNING id, name, baptism_name, church_name, curia_name, pr_name, position,
                       phone_last4, resident_id_front6, phone_full, resident_id_full, email`,
            [memberId]
        );

        const user = result.rows[0];
        const hadPr = !!(existing.rows[0].pr_name && String(existing.rows[0].pr_name).trim());

        console.log('탈단 처리:', user.name, hadPr ? `Pr "${existing.rows[0].pr_name}" 삭제` : '이미 Pr 없음');

        res.json({
            success: true,
            message: hadPr ? '소속 Pr 명칭이 삭제되었습니다.' : '이미 소속 Pr가 없습니다.',
            user: buildLoginUserResponse(user)
        });
    } catch (err) {
        console.error('탈단 처리 오류:', err);
        res.status(500).json({ error: '탈단 처리 중 오류가 발생했습니다.' });
    }
});

// 평의회직책등록 (G1~G4) — K/C/R/S + 1~4
app.put('/api/user/:id/curia-officer', async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        if (isNaN(userId)) {
            return res.status(400).json({ error: '유효하지 않은 사용자 ID입니다.' });
        }

        const resolved = resolveCouncilOfficerPayload(req.body || {});
        if (resolved.error) {
            return res.status(400).json({ error: resolved.error });
        }

        const existing = await pool.query(
            'SELECT id, name, position, church_name, pr_name, email FROM member WHERE id = $1',
            [userId]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }

        const member = existing.rows[0];
        if (!isG1toG4Member(member)) {
            return res.status(403).json({ error: '평의회직책등록은 G1~G4(단장·부단장·서기·회계) 회원만 이용할 수 있습니다.' });
        }

        const electedRaw = String(req.body.elected_on || req.body.curia_officer_elected_on || '').trim();
        const electedOn = /^\d{4}-\d{2}-\d{2}$/.test(electedRaw) ? electedRaw : null;
        const approvedRaw = String(req.body.curia_approved_on || req.body.approved_on || '').trim();
        const approvedOn = /^\d{4}-\d{2}-\d{2}$/.test(approvedRaw) ? approvedRaw : null;
        const meetingRaw = String(req.body.curia_meeting_on || req.body.meeting_on || '').trim();
        const meetingOn = /^\d{4}-\d{2}-\d{2}$/.test(meetingRaw) ? meetingRaw : null;
        const meetingPlace = String(req.body.curia_meeting_place || req.body.meeting_place || '').trim().slice(0, 100) || null;

        const result = await pool.query(
            `UPDATE member
             SET ${resolved.nameField} = $1,
                 curia_officer = $2,
                 curia_officer_elected_on = COALESCE(curia_officer_elected_on, $4::date, CURRENT_DATE),
                 curia_approved_on = COALESCE($5::date, curia_approved_on),
                 curia_meeting_on = COALESCE($6::date, curia_meeting_on),
                 curia_meeting_place = COALESCE($7, curia_meeting_place)
             WHERE id = $3
             RETURNING id, name, baptism_name, church_name, curia_name, curia_officer,
                       comitia_name, regia_name, senatus_name, pr_name, position, email,
                       curia_officer_elected_on, curia_approved_on, curia_meeting_on, curia_meeting_place`,
            [resolved.councilName, resolved.officerCode, userId, electedOn, approvedOn, meetingOn, meetingPlace]
        );

        // 동일 꾸리아 소속 회원에게 승인일·회합 정보 공유
        if (resolved.nameField === 'curia_name' && resolved.councilName) {
            await pool.query(
                `UPDATE member
                 SET curia_approved_on = COALESCE($2::date, curia_approved_on),
                     curia_meeting_on = COALESCE($3::date, curia_meeting_on),
                     curia_meeting_place = COALESCE($4, curia_meeting_place)
                 WHERE curia_name = $1
                   AND id <> $5`,
                [resolved.councilName, approvedOn, meetingOn, meetingPlace, userId]
            );
        }

        console.log(
            '평의회직책등록:',
            result.rows[0].name,
            resolved.councilType,
            resolved.councilName,
            resolved.officerCode
        );
        res.json({
            success: true,
            message: '평의회 직책이 등록되었습니다.',
            user: buildLoginUserResponse(result.rows[0])
        });
    } catch (err) {
        console.error('평의회직책등록 오류:', err);
        res.status(500).json({ error: '평의회직책등록 중 오류가 발생했습니다.' });
    }
});

// 12. 개인정보 수정 API
app.put('/api/user/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        if (isNaN(userId)) {
            return res.status(400).json({ error: '유효하지 않은 사용자 ID입니다.' });
        }

        // 샘플 회원(3~103)도 프로필 수정 허용 (deploy 전 테스트용)

        const profileField = String(req.body.profile_field || '').trim();
        const {
            name,
            baptism_name,
            gender,
            church_name,
            curia_name,
            comitia_name,
            regia_name,
            senatus_name,
            pr_name,
            pr_type,
            position,
            phone_last4,
            resident_id_front6,
            phone_full,
            resident_id_full,
            password,
            officer_appointed_on,
            pr_meeting_weekday,
            pr_meeting_hour,
            pr_meeting_minute,
            pr_meeting_place,
            pr_founded_on,
            pr_approved_on
        } = req.body;

        console.log('개인정보 수정 요청:', {
            userId,
            profileField,
            name,
            baptism_name,
            gender,
            church_name,
            curia_name,
            comitia_name,
            regia_name,
            senatus_name,
            pr_name,
            pr_type,
            officer_appointed_on,
            pr_meeting_weekday,
            pr_meeting_hour,
            pr_meeting_minute,
            pr_meeting_place,
            pr_founded_on,
            pr_approved_on,
            position,
            phone_last4,
            resident_id_front6,
            phone_full,
            resident_id_full
        });

        // Pr 설립일·승인일만 저장 (G1~G4, 소속 Pr 전원 동일 반영)
        if (profileField === 'prDates') {
            const existingUser = await pool.query(
                'SELECT id, name, position, church_name, pr_name FROM member WHERE id = $1',
                [userId]
            );
            if (existingUser.rows.length === 0) {
                return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
            }
            const member = existingUser.rows[0];
            const code = inferPositionCode(member.position, member.name);
            if (!(code >= 1 && code <= 4)) {
                return res.status(403).json({ error: 'Pr 설립일·승인일은 G1~G4만 입력할 수 있습니다.' });
            }
            const foundedRaw = String(pr_founded_on || '').trim();
            const approvedRaw = String(pr_approved_on || '').trim();
            const founded = /^\d{4}-\d{2}-\d{2}$/.test(foundedRaw) ? foundedRaw : null;
            const approved = /^\d{4}-\d{2}-\d{2}$/.test(approvedRaw) ? approvedRaw : null;
            if (founded && approved && founded > approved) {
                return res.status(400).json({ error: 'Pr 승인일은 설립일 이후여야 합니다.' });
            }
            if (member.church_name && member.pr_name) {
                await pool.query(
                    `UPDATE member
                     SET pr_founded_on = $1, pr_approved_on = $2
                     WHERE church_name = $3 AND pr_name = $4`,
                    [founded, approved, member.church_name, member.pr_name]
                );
            } else {
                await pool.query(
                    `UPDATE member SET pr_founded_on = $1, pr_approved_on = $2 WHERE id = $3`,
                    [founded, approved, userId]
                );
            }
            const result = await pool.query(
                `SELECT id, name, baptism_name, gender, church_name, curia_name, curia_officer,
                        comitia_name, regia_name, senatus_name, pr_name, pr_type, position,
                        phone_last4, resident_id_front6, phone_full, resident_id_full, email,
                        officer_appointed_on, pr_meeting_weekday, pr_meeting_hour, pr_meeting_minute, pr_meeting_place,
                        pr_founded_on, pr_approved_on
                 FROM member WHERE id = $1`,
                [userId]
            );
            return res.json({
                success: true,
                message: 'Pr 설립일·승인일이 저장되었습니다.',
                user: buildLoginUserResponse(result.rows[0])
            });
        }

        // 주회합만 저장: 꾸리아 등 다른 필드 검증/갱신 없이 해당 컬럼만 업데이트
        if (profileField === 'prMeeting') {
            const existingUser = await pool.query(
                'SELECT id, church_name, pr_name FROM member WHERE id = $1',
                [userId]
            );
            if (existingUser.rows.length === 0) {
                return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
            }

            const ALLOWED_WEEKDAYS = new Set(['월', '화', '수', '목', '금', '토', '일']);
            const weekdayRaw = String(pr_meeting_weekday || '').trim();
            const hourNum = Number(pr_meeting_hour);
            const minuteNum = Number(pr_meeting_minute);
            const placeRaw = String(pr_meeting_place || '').trim().slice(0, 100);
            if (!ALLOWED_WEEKDAYS.has(weekdayRaw)) {
                return res.status(400).json({ error: '주회합 요일을 선택해주세요.' });
            }
            if (!Number.isInteger(hourNum) || hourNum < 0 || hourNum > 23) {
                return res.status(400).json({ error: '주회합 시를 선택해주세요.' });
            }
            if (!Number.isInteger(minuteNum) || minuteNum < 0 || minuteNum > 59 || minuteNum % 5 !== 0) {
                return res.status(400).json({ error: '주회합 분을 선택해주세요.' });
            }
            if (!placeRaw) {
                return res.status(400).json({ error: '주회합 장소를 입력해주세요.' });
            }

            const member = existingUser.rows[0];
            if (member.church_name && member.pr_name) {
                await pool.query(
                    `UPDATE member
                     SET pr_meeting_weekday = $1, pr_meeting_hour = $2, pr_meeting_minute = $3, pr_meeting_place = $4
                     WHERE church_name = $5 AND pr_name = $6`,
                    [weekdayRaw, hourNum, minuteNum, placeRaw, member.church_name, member.pr_name]
                );
            } else {
                await pool.query(
                    `UPDATE member
                     SET pr_meeting_weekday = $1, pr_meeting_hour = $2, pr_meeting_minute = $3, pr_meeting_place = $4
                     WHERE id = $5`,
                    [weekdayRaw, hourNum, minuteNum, placeRaw, userId]
                );
            }

            const result = await pool.query(
                `SELECT id, name, baptism_name, gender, church_name, curia_name, curia_officer,
                        comitia_name, regia_name, senatus_name, pr_name, pr_type, position,
                        phone_last4, resident_id_front6, phone_full, resident_id_full, email,
                        officer_appointed_on, pr_meeting_weekday, pr_meeting_hour, pr_meeting_minute, pr_meeting_place
                 FROM member WHERE id = $1`,
                [userId]
            );

            return res.json({
                success: true,
                message: '주회합이 저장되었습니다.',
                user: buildLoginUserResponse(result.rows[0])
            });
        }

        // 필수 필드 검증
        if (!name || !phone_last4 || !resident_id_front6) {
            return res.status(400).json({ error: '필수 정보를 모두 입력해주세요.' });
        }

        if (gender !== undefined && gender !== null && String(gender).trim() !== ''
            && gender !== '남' && gender !== '여') {
            return res.status(400).json({ error: '성별은 남 또는 여만 선택할 수 있습니다.' });
        }

        if (pr_type !== undefined && pr_type !== null && String(pr_type).trim() !== ''
            && !['성인', '직속', '청년', '소년'].includes(String(pr_type).trim())) {
            return res.status(400).json({ error: 'Pr 구분은 성인/직속/청년/소년 중 하나여야 합니다.' });
        }

        if (senatus_name !== undefined && senatus_name !== null && String(senatus_name).trim() !== ''
            && !['서울', '광주', '대구', 'LA', '뉴욕', '필라델피아', '세계', '토론토', '몬트리올', '브라질', '아르헨', '파리', '마드리드', '바르셀로나', '빌바오'].includes(String(senatus_name).trim())) {
            return res.status(400).json({ error: '세나뚜스는 서울·광주·대구·LA·뉴욕·필라델피아·세계·토론토·몬트리올·브라질·아르헨·파리·마드리드·바르셀로나·빌바오 중 하나여야 합니다.' });
        }

        // 사용자 존재 확인
        const existingUser = await pool.query(
            'SELECT id, name, curia_name FROM member WHERE id = $1',
            [userId]
        );

        if (existingUser.rows.length === 0) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }

        // 중복 확인 (다른 사용자와 동일한 성명인지)
        const duplicateName = await pool.query(
            'SELECT id, name FROM member WHERE name = $1 AND id != $2',
            [name, userId]
        );

        if (duplicateName.rows.length > 0) {
            return res.status(400).json({ error: '이미 사용 중인 성명입니다.' });
        }

        // 전화번호 끝 4자리 + 주민번호 앞 6자리 조합으로 중복 확인 (다른 사용자와)
        const duplicatePhoneResident = await pool.query(
            'SELECT id, name FROM member WHERE phone_last4 = $1 AND resident_id_front6 = $2 AND id != $3',
            [phone_last4, resident_id_front6, userId]
        );

        if (duplicatePhoneResident.rows.length > 0) {
            return res.status(400).json({ error: '이미 사용 중인 전화번호와 주민번호 조합입니다.' });
        }

        const hasPassword = password !== undefined && String(password).trim() !== '';
        if (hasPassword && !isValidPassno(password)) {
            return res.status(400).json({ error: '비밀번호는 특수문자+영문3자+숫자4자 형식이어야 합니다. (예: @abc1234)' });
        }

        const normalizedGender = gender === undefined || gender === null || String(gender).trim() === ''
            ? null
            : String(gender).trim();
        const normalizedPrType = pr_type === undefined || pr_type === null || String(pr_type).trim() === ''
            ? null
            : String(pr_type).trim();
        const normalizedSenatus = senatus_name === undefined || senatus_name === null || String(senatus_name).trim() === ''
            ? null
            : String(senatus_name).trim();

        const positionCode = inferPositionCode(position, name);
        let normalizedAppointed = null;
        let normalizedFounded = null;
        let normalizedApproved = null;
        const hasPrDatesInput = Object.prototype.hasOwnProperty.call(req.body, 'pr_founded_on')
            || Object.prototype.hasOwnProperty.call(req.body, 'pr_approved_on');
        if (positionCode >= 1 && positionCode <= 4) {
            const appointedRaw = String(officer_appointed_on || '').trim();
            if (appointedRaw) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(appointedRaw)) {
                    return res.status(400).json({ error: '간부임명일 형식이 올바르지 않습니다.' });
                }
                normalizedAppointed = appointedRaw;
            }
            if (hasPrDatesInput) {
                const foundedRaw = String(pr_founded_on || '').trim();
                const approvedRaw = String(pr_approved_on || '').trim();
                if (foundedRaw && !/^\d{4}-\d{2}-\d{2}$/.test(foundedRaw)) {
                    return res.status(400).json({ error: 'Pr 설립일 형식이 올바르지 않습니다.' });
                }
                if (approvedRaw && !/^\d{4}-\d{2}-\d{2}$/.test(approvedRaw)) {
                    return res.status(400).json({ error: 'Pr 승인일 형식이 올바르지 않습니다.' });
                }
                normalizedFounded = foundedRaw || null;
                normalizedApproved = approvedRaw || null;
                if (normalizedFounded && normalizedApproved && normalizedFounded > normalizedApproved) {
                    return res.status(400).json({ error: 'Pr 승인일은 설립일 이후여야 합니다.' });
                }
            }
        }

        const ALLOWED_WEEKDAYS = new Set(['월', '화', '수', '목', '금', '토', '일']);
        const weekdayRaw = String(pr_meeting_weekday || '').trim();
        const placeRaw = String(pr_meeting_place || '').trim().slice(0, 100);
        let normalizedWeekday = null;
        let normalizedHour = null;
        let normalizedMinute = null;
        let normalizedPlace = null;
        const hasMeetingInput = weekdayRaw !== ''
            || (pr_meeting_hour !== undefined && pr_meeting_hour !== null && String(pr_meeting_hour).trim() !== '')
            || (pr_meeting_minute !== undefined && pr_meeting_minute !== null && String(pr_meeting_minute).trim() !== '')
            || placeRaw !== '';
        if (hasMeetingInput) {
            if (!ALLOWED_WEEKDAYS.has(weekdayRaw)) {
                return res.status(400).json({ error: '주회합 요일을 선택해주세요.' });
            }
            const hourNum = Number(pr_meeting_hour);
            const minuteNum = Number(pr_meeting_minute);
            if (!Number.isInteger(hourNum) || hourNum < 0 || hourNum > 23) {
                return res.status(400).json({ error: '주회합 시를 선택해주세요.' });
            }
            if (!Number.isInteger(minuteNum) || minuteNum < 0 || minuteNum > 59 || minuteNum % 5 !== 0) {
                return res.status(400).json({ error: '주회합 분을 선택해주세요.' });
            }
            if (!placeRaw) {
                return res.status(400).json({ error: '주회합 장소를 입력해주세요.' });
            }
            normalizedWeekday = weekdayRaw;
            normalizedHour = hourNum;
            normalizedMinute = minuteNum;
            normalizedPlace = placeRaw;
        }

        const updatePrDates = hasPrDatesInput && positionCode >= 1 && positionCode <= 4;
        const updateParams = [
            name,
            baptism_name || null,
            normalizedGender,
            church_name || null,
            curia_name || null,
            comitia_name || null,
            regia_name || null,
            normalizedSenatus,
            pr_name || null,
            normalizedPrType,
            position || null,
            phone_last4,
            resident_id_front6,
            phone_full || null,
            resident_id_full || null,
            normalizedAppointed,
            normalizedWeekday,
            normalizedHour,
            normalizedMinute,
            normalizedPlace
        ];
        let nextParam = 21;
        let prDatesSql = '';
        if (updatePrDates) {
            prDatesSql = `, pr_founded_on = $${nextParam++}, pr_approved_on = $${nextParam++}`;
            updateParams.push(normalizedFounded, normalizedApproved);
        }
        let passwordSql = '';
        if (hasPassword) {
            passwordSql = `, passno = $${nextParam++}`;
            updateParams.push(normalizePassno(password));
        }
        const idParam = nextParam;
        updateParams.push(userId);

        // 개인정보 업데이트
        const result = await pool.query(
            `UPDATE member 
             SET name = $1, baptism_name = $2, gender = $3, church_name = $4, curia_name = $5,
                 comitia_name = $6, regia_name = $7, senatus_name = $8, pr_name = $9, pr_type = $10,
                 position = $11, phone_last4 = $12, resident_id_front6 = $13, 
                 phone_full = $14, resident_id_full = $15, officer_appointed_on = $16,
                 pr_meeting_weekday = COALESCE($17, pr_meeting_weekday),
                 pr_meeting_hour = COALESCE($18, pr_meeting_hour),
                 pr_meeting_minute = COALESCE($19, pr_meeting_minute),
                 pr_meeting_place = COALESCE($20, pr_meeting_place)${prDatesSql}${passwordSql}
             WHERE id = $${idParam}
             RETURNING id, name, baptism_name, gender, church_name, curia_name, curia_officer,
                       comitia_name, regia_name, senatus_name, pr_name, pr_type, position, 
                       phone_last4, resident_id_front6, phone_full, resident_id_full, email,
                       officer_appointed_on, pr_meeting_weekday, pr_meeting_hour, pr_meeting_minute, pr_meeting_place,
                       pr_founded_on, pr_approved_on`,
            updateParams
        );

        // 소속 Pr 주회합은 같은 성당·Pr 회원에게 동일 반영
        if (normalizedWeekday != null) {
            const church = result.rows[0].church_name || null;
            const pr = result.rows[0].pr_name || null;
            if (church && pr) {
                await pool.query(
                    `UPDATE member
                     SET pr_meeting_weekday = $1, pr_meeting_hour = $2, pr_meeting_minute = $3, pr_meeting_place = $4
                     WHERE church_name = $5 AND pr_name = $6`,
                    [normalizedWeekday, normalizedHour, normalizedMinute, normalizedPlace, church, pr]
                );
            }
        }

        // Pr 설립일·승인일도 소속 Pr 전원 동일 반영
        if (updatePrDates) {
            const church = result.rows[0].church_name || null;
            const pr = result.rows[0].pr_name || null;
            if (church && pr) {
                await pool.query(
                    `UPDATE member
                     SET pr_founded_on = $1, pr_approved_on = $2
                     WHERE church_name = $3 AND pr_name = $4`,
                    [normalizedFounded, normalizedApproved, church, pr]
                );
            }
        }

        console.log('개인정보 수정 성공:', result.rows[0].name);
        res.json({
            success: true,
            message: '개인정보가 성공적으로 수정되었습니다.',
            user: buildLoginUserResponse(result.rows[0])
        });

    } catch (err) {
        console.error('개인정보 수정 오류:', err);
        
        // 구체적인 에러 메시지 제공
        if (err.code === '23505') {
            if (err.detail && err.detail.includes('name')) {
                res.status(400).json({ error: '이미 사용 중인 성명입니다.' });
            } else {
                res.status(400).json({ error: '중복된 정보가 있습니다.' });
            }
        } else {
            res.status(500).json({ error: '개인정보 수정 중 오류가 발생했습니다.' });
        }
    }
});

// 10. 회원가입 API
app.post('/api/register', async (req, res) => {
    try {
        const {
            name,
            baptism_name,
            gender,
            church_name,
            curia_name,
            comitia_name,
            regia_name,
            senatus_name,
            pr_name,
            pr_type,
            position,
            phone_last4,
            resident_id_front6,
            phone_full,
            resident_id_full,
            zipcode,
            password,
            email,
            email_verification_token,
            officer_appointed_on,
            pr_founded_on,
            pr_approved_on
        } = req.body;

        console.log('회원가입 요청:', {
            name,
            church_name,
            curia_name,
            comitia_name,
            regia_name,
            senatus_name,
            pr_name,
            email: email ? maskEmail(email) : null
        });

        // 필수 필드 검증 — Gmail 인증 완료 필수
        if (!name || !church_name || !pr_name || !password || !email || !email_verification_token) {
            return res.status(400).json({ error: '필수 정보와 Gmail 인증을 완료해주세요.' });
        }

        if (!isGmailAddress(email)) {
            return res.status(400).json({ error: 'Gmail 주소만 등록할 수 있습니다.' });
        }

        try {
            await consumeVerificationToken(pool, email, 'register', email_verification_token);
        } catch (error) {
            const mapped = mapFindPasswordError(error, res);
            if (mapped) return mapped;
            throw error;
        }

        const emailToSave = normalizeEmail(email);
        const emailVerified = true;

        // 협조단원은 꾸리아 명칭 없이 가입 가능 (나중에 개인정보 수정으로 기록)

        if (!isValidPassno(password)) {
            return res.status(400).json({ error: '비밀번호는 특수문자+영문3자+숫자4자 형식이어야 합니다. (예: @abc1234)' });
        }

        const normalizedGender = String(gender || '').trim();
        if (normalizedGender !== '남' && normalizedGender !== '여') {
            return res.status(400).json({ error: '성별(남/여)을 선택해주세요.' });
        }

        const ALLOWED_PR_TYPES = new Set(['성인', '직속', '청년', '소년']);
        const normalizedPrType = String(pr_type || '').trim();
        if (!ALLOWED_PR_TYPES.has(normalizedPrType)) {
            return res.status(400).json({ error: 'Pr 구분(성인/직속/청년/소년)을 선택해주세요.' });
        }

        const positionCode = inferPositionCode(position, name);
        // 등록신청: 꼬미시움·레지아는 미입력, 세나뚜스는 허용 목록 중 선택 저장
        const comitiaToSave = null;
        const regiaToSave = null;
        const senatusRaw = String(senatus_name || '').trim();
        const allowedSenatus = ['서울', '광주', '대구', 'LA', '뉴욕', '필라델피아', '세계', '토론토', '몬트리올', '브라질', '아르헨', '파리', '마드리드', '바르셀로나', '빌바오'];
        if (!allowedSenatus.includes(senatusRaw)) {
            return res.status(400).json({ error: `세나뚜스(${allowedSenatus.join('·')})를 선택해주세요.` });
        }
        const senatusToSave = senatusRaw;

        let officerAppointedToSave = null;
        let prFoundedToSave = null;
        let prApprovedToSave = null;
        if (positionCode >= 1 && positionCode <= 4) {
            const appointedRaw = String(officer_appointed_on || '').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(appointedRaw)) {
                return res.status(400).json({ error: '간부임명일을 선택해주세요.' });
            }
            const appointedDate = new Date(`${appointedRaw}T00:00:00`);
            if (Number.isNaN(appointedDate.getTime())) {
                return res.status(400).json({ error: '간부임명일 형식이 올바르지 않습니다.' });
            }
            officerAppointedToSave = appointedRaw;

            const foundedRaw = String(pr_founded_on || '').trim();
            const approvedRaw = String(pr_approved_on || '').trim();
            if (foundedRaw) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(foundedRaw)) {
                    return res.status(400).json({ error: 'Pr 설립일 형식이 올바르지 않습니다.' });
                }
                prFoundedToSave = foundedRaw;
            }
            if (approvedRaw) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(approvedRaw)) {
                    return res.status(400).json({ error: 'Pr 승인일 형식이 올바르지 않습니다.' });
                }
                prApprovedToSave = approvedRaw;
            }
            if (prFoundedToSave && prApprovedToSave && prFoundedToSave > prApprovedToSave) {
                return res.status(400).json({ error: 'Pr 승인일은 설립일 이후여야 합니다.' });
            }
        }

        const phoneLast4 = (phone_last4 && String(phone_last4).trim().length === 4)
            ? String(phone_last4).trim()
            : String(password).slice(-4);

        let residentFront6 = (resident_id_front6 && String(resident_id_front6).trim().length === 6)
            ? String(resident_id_front6).trim()
            : await generateUniqueResidentFront6(phoneLast4);

        if (emailToSave) {
            const existingEmail = await pool.query(
                'SELECT id FROM member WHERE LOWER(email) = LOWER($1)',
                [emailToSave]
            );
            if (existingEmail.rows.length > 0) {
                return res.status(400).json({ error: '이미 등록된 Gmail입니다.' });
            }
        }

        // 중복 확인 (성명)
        const existingName = await pool.query(
            'SELECT id FROM member WHERE name = $1',
            [name]
        );

        if (existingName.rows.length > 0) {
            return res.status(400).json({ error: '이미 사용 중인 성명입니다.' });
        }

        // 중복 확인 (전화번호 끝 4자리 + 주민번호 앞 6자리)
        const existingPhoneResident = await pool.query(
            'SELECT id FROM member WHERE phone_last4 = $1 AND resident_id_front6 = $2',
            [phoneLast4, residentFront6]
        );

        if (existingPhoneResident.rows.length > 0) {
            return res.status(400).json({ error: '이미 사용 중인 전화번호와 주민번호 조합입니다.' });
        }

        // passno: 특수문자+영문3자+숫자4자 (미입력 시 자동 생성)
        let passno;
        try {
            passno = resolvePassno(password, phoneLast4, name);
        } catch (err) {
            if (err.message === 'INVALID_PASSNO') {
                return res.status(400).json({ error: '비밀번호는 특수문자+영문3자+숫자4자 형식이어야 합니다. (예: @abc1234)' });
            }
            throw err;
        }

        // 새 회원 추가
        const result = await pool.query(
            `INSERT INTO member 
             (name, baptism_name, gender, church_name, curia_name, comitia_name, regia_name, senatus_name, pr_name, pr_type, position, phone_last4, 
              resident_id_front6, phone_full, resident_id_full, passno, zipcode, email, email_verified, officer_appointed_on,
              pr_founded_on, pr_approved_on)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
             RETURNING id, name, baptism_name, gender, church_name, curia_name, comitia_name, regia_name, senatus_name, pr_name, pr_type, position, 
                       phone_last4, resident_id_front6, phone_full, resident_id_full, passno, zipcode, email, officer_appointed_on,
                       pr_founded_on, pr_approved_on`,
            [name, baptism_name || null, normalizedGender, church_name, curia_name || null, comitiaToSave, regiaToSave, senatusToSave, pr_name, normalizedPrType, position || null, 
             phoneLast4, residentFront6, phone_full || null, resident_id_full || null, passno, zipcode || null,
             emailToSave, emailVerified, officerAppointedToSave, prFoundedToSave, prApprovedToSave]
        );

        // G1~G4가 Pr 설립·승인일을 넣으면 같은 성당·Pr 기존 회원에도 반영
        if (positionCode >= 1 && positionCode <= 4 && (prFoundedToSave || prApprovedToSave)) {
            await pool.query(
                `UPDATE member
                 SET pr_founded_on = COALESCE($1, pr_founded_on),
                     pr_approved_on = COALESCE($2, pr_approved_on)
                 WHERE church_name = $3 AND pr_name = $4`,
                [prFoundedToSave, prApprovedToSave, church_name, pr_name]
            );
        }

        console.log('회원가입 성공:', result.rows[0].name);
        res.status(201).json({
            success: true,
            message: '회원가입이 완료되었습니다.',
            user: buildLoginUserResponse(result.rows[0])
        });

    } catch (err) {
        console.error('회원가입 오류:', err);
        
        // 구체적인 에러 메시지 제공
        if (err.code === '23505') {
            if (err.detail && err.detail.includes('name')) {
                res.status(400).json({ error: '이미 사용 중인 성명입니다.' });
            } else {
                res.status(400).json({ error: '중복된 정보가 있습니다.' });
            }
        } else {
            res.status(500).json({ error: '회원가입 중 오류가 발생했습니다.' });
        }
    }
});

// 회원 관련 데이터 조회 API
app.get('/api/members/:id/related-data', async (req, res) => {
    try {
        const memberId = parseInt(req.params.id);
        
        if (isNaN(memberId)) {
            return res.status(400).json({ error: '유효하지 않은 회원 ID입니다.' });
        }

        async function safeCount(sql, params) {
            try {
                const r = await pool.query(sql, params);
                return parseInt(r.rows[0].count, 10) || 0;
            } catch (err) {
                if (err.code === '42P01') return 0;
                throw err;
            }
        }

        const [
            activity_records,
            daily_activities,
            prayer_activities,
            community_activities,
            activity_inputs,
            activity_assignments
        ] = await Promise.all([
            safeCount('SELECT COUNT(*) as count FROM activity_records WHERE member_id = $1', [memberId]),
            safeCount('SELECT COUNT(*) as count FROM daily_activities WHERE member_id = $1', [memberId]),
            safeCount('SELECT COUNT(*) as count FROM prayer_activities WHERE member_id = $1', [memberId]),
            safeCount('SELECT COUNT(*) as count FROM community_activities WHERE member_id = $1', [memberId]),
            safeCount('SELECT COUNT(*) as count FROM activity_inputs WHERE member_id = $1', [memberId]),
            safeCount(
                'SELECT COUNT(*) as count FROM activity_assignments WHERE member_id = $1 OR assigner_id = $1',
                [memberId]
            )
        ]);

        res.json({
            activity_records,
            daily_activities,
            prayer_activities,
            community_activities,
            activity_inputs,
            activity_assignments
        });

    } catch (err) {
        console.error('관련 데이터 조회 오류:', err);
        res.status(500).json({ error: '관련 데이터 조회 중 오류가 발생했습니다.' });
    }
});

// 관리자: 이름+성당으로 삭제 대상 회원 검색
app.post('/api/admin/members/search-for-delete', async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        const churchName = String(req.body?.church_name || '').trim();
        const requesterMemberId = parseInt(req.body?.requester_member_id, 10);

        if (!name || !churchName) {
            return res.status(400).json({ error: '이름과 성당을 모두 입력해주세요.' });
        }
        if (!requesterMemberId || Number.isNaN(requesterMemberId)) {
            return res.status(403).json({ error: '관리자 로그인이 필요합니다.' });
        }

        try {
            await assertAdminRequester(requesterMemberId);
        } catch (error) {
            const mapped = mapSensitiveActionError(error, res);
            if (mapped) return mapped;
            throw error;
        }

        const churchVariants = expandChurchNameVariants(churchName);
        const churchBase = churchName.replace(/성당$/u, '').trim();
        const result = await pool.query(
            `SELECT id, name, baptism_name, church_name, curia_name, pr_name, position, phone_last4, phone_full
             FROM member
             WHERE (
                    church_name = ANY($1::text[])
                 OR REPLACE(COALESCE(church_name, ''), '성당', '') = $2
                 OR church_name ILIKE $3
             )
             ORDER BY church_name, name
             LIMIT 200`,
            [churchVariants, churchBase, `%${churchBase}%`]
        );

        const members = result.rows.filter((row) => matchesNameForDeleteSearch(row.name, name));
        res.json({
            success: true,
            count: members.length,
            members: members.map((m) => ({
                id: m.id,
                name: m.name,
                display_name: extractRealNameFromMemberName(m.name),
                baptism_name: m.baptism_name || '',
                church_name: m.church_name || '',
                curia_name: m.curia_name || '',
                pr_name: m.pr_name || '',
                position: m.position || '',
                phone_last4: m.phone_last4 || '',
                phone_full: m.phone_full || ''
            }))
        });
    } catch (err) {
        console.error('삭제 대상 검색 오류:', err);
        res.status(500).json({ error: '회원 검색 중 오류가 발생했습니다.' });
    }
});

// 회원 삭제 API (외래키 제약 조건 고려)
app.delete('/api/members/:id', async (req, res) => {
    try {
        const memberId = parseInt(req.params.id);
        const requesterMemberId = parseInt(req.body?.requester_member_id, 10);
        const emailVerificationToken = String(req.body?.email_verification_token || '').trim();
        const confirmed = req.body?.confirmed === true;

        if (isNaN(memberId)) {
            return res.status(400).json({ error: '유효하지 않은 회원 ID입니다.' });
        }
        if (!requesterMemberId || Number.isNaN(requesterMemberId)) {
            return res.status(403).json({ error: '관리자 로그인이 필요합니다.' });
        }
        if (!confirmed) {
            return res.status(400).json({ error: '삭제 확인이 필요합니다. 확인 후 다시 삭제해주세요.' });
        }

        try {
            const requester = await assertAdminRequester(requesterMemberId);
            const isNamedAdmin = String(requester.name || '').trim() === ADMIN_NAME;
            if (!isNamedAdmin) {
                if (!emailVerificationToken) {
                    return res.status(403).json({ error: '회원 삭제 전 등록 Gmail 인증이 필요합니다.' });
                }
                await consumeSensitiveActionToken(requesterMemberId, 'delete_member', emailVerificationToken);
            }
        } catch (error) {
            const mapped = mapSensitiveActionError(error, res);
            if (mapped) return mapped;
            throw error;
        }

        if (memberId === requesterMemberId) {
            return res.status(400).json({ error: '로그인한 관리자 본인은 삭제할 수 없습니다.' });
        }

        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // 없는 테이블 DELETE는 트랜잭션을 abort 시키므로 SAVEPOINT로 격리
            async function safeDelete(sql, params, label) {
                const sp = `sp_${String(label).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40)}`;
                try {
                    await client.query(`SAVEPOINT ${sp}`);
                    const r = await client.query(sql, params);
                    await client.query(`RELEASE SAVEPOINT ${sp}`);
                    console.log(`삭제된 ${label}: ${r.rowCount}개`);
                    return r.rowCount || 0;
                } catch (err) {
                    try {
                        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
                    } catch (_) {
                        /* ignore */
                    }
                    if (err.code === '42P01') {
                        console.log(`⏭ ${label} 테이블 없음 — 건너뜀`);
                        return 0;
                    }
                    throw err;
                }
            }

            const deletedCounts = {
                activity_records: await safeDelete(
                    'DELETE FROM activity_records WHERE member_id = $1', [memberId], 'activity_records'
                ),
                daily_activities: await safeDelete(
                    'DELETE FROM daily_activities WHERE member_id = $1', [memberId], 'daily_activities'
                ),
                prayer_activities: await safeDelete(
                    'DELETE FROM prayer_activities WHERE member_id = $1', [memberId], 'prayer_activities'
                ),
                community_activities: await safeDelete(
                    'DELETE FROM community_activities WHERE member_id = $1', [memberId], 'community_activities'
                ),
                activity_inputs: await safeDelete(
                    'DELETE FROM activity_inputs WHERE member_id = $1', [memberId], 'activity_inputs'
                ),
                activity_assignments: await safeDelete(
                    'DELETE FROM activity_assignments WHERE member_id = $1 OR assigner_id = $1',
                    [memberId],
                    'activity_assignments'
                ),
                daily_activities_backup: await safeDelete(
                    'DELETE FROM daily_activities_backup WHERE member_id = $1', [memberId], 'daily_activities_backup'
                ),
                daily_activities_backup_2: await safeDelete(
                    'DELETE FROM daily_activities_backup_2 WHERE member_id = $1', [memberId], 'daily_activities_backup_2'
                ),
                daily_activities_backup_3: await safeDelete(
                    'DELETE FROM daily_activities_backup_3 WHERE member_id = $1', [memberId], 'daily_activities_backup_3'
                ),
                play_billing_purchases: await safeDelete(
                    'DELETE FROM play_billing_purchases WHERE member_id = $1',
                    [memberId],
                    'play_billing_purchases'
                )
            };
            
            const memberResult = await client.query(
                'DELETE FROM member WHERE id = $1 RETURNING id, name, church_name',
                [memberId]
            );

            if (memberResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: '삭제할 회원을 찾을 수 없습니다.' });
            }

            await client.query('COMMIT');

            const deletedActivities = Object.values(deletedCounts).reduce((a, b) => a + b, 0);
            console.log('회원 삭제 성공:', memberResult.rows[0].name, deletedCounts);
            res.json({
                success: true,
                message: '회원이 성공적으로 삭제되었습니다.',
                deletedMember: memberResult.rows[0],
                deletedActivities,
                deletedCounts
            });

        } catch (err) {
            try {
                await client.query('ROLLBACK');
            } catch (_) {
                /* ignore */
            }
            throw err;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error('회원 삭제 오류:', err);
        
        if (err.code === '23503') {
            res.status(400).json({ 
                error: '이 회원과 관련된 데이터가 있어 삭제할 수 없습니다. 먼저 관련 데이터를 삭제해주세요.' 
            });
        } else {
            res.status(500).json({
                error: '회원 삭제 중 오류가 발생했습니다.',
                details: err.message
            });
        }
    }
});

// member 테이블의 컬럼 목록 조회 API
app.get('/api/get-member-columns', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'member'
            ORDER BY ordinal_position
        `);
        
        res.json({
            success: true,
            columns: result.rows
        });
        
    } catch (error) {
        console.error('member 테이블 컬럼 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: 'member 테이블 컬럼 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 즉시 활동 입력 API (개선된 버전)
app.post('/api/activities/input', async (req, res) => {
    let client;
    try {
        const { member_id, category_name, field_name, field_value, activity_date, note } = req.body;

        console.log('🚀 즉시 활동 입력 요청:', { member_id, category_name, field_name, field_value, activity_date });

        // 빠른 입력 검증
        if (!member_id || !category_name || !field_name || !activity_date) {
            return res.status(400).json({ 
                success: false,
                error: '필수 정보가 누락되었습니다.',
                missing_fields: {
                    member_id: !member_id,
                    category_name: !category_name,
                    field_name: !field_name,
                    activity_date: !activity_date
                }
            });
        }

        // 허용된 필드명 목록 (SQL 인젝션 방지)
        const allowedFields = [
            'target', 'count', 'catechism_guide', 'group_join', 'meeting_head',
            'resolution', 'sacrament', 'confirmation', 'baptism', 'first_communion',
            'year_count', 'funeral_mass', 'funeral_attendance', 'conditional_baptism',
            'conditional_communion', 'membership', 'establishment', 'inout_count', 'memorial_mass'
        ];

        if (!allowedFields.includes(field_name)) {
            return res.status(400).json({ 
                success: false,
                error: '유효하지 않은 필드명입니다.',
                allowed_fields: allowedFields
            });
        }

        // 연결 풀에서 클라이언트 획득
        client = await pool.connect();
        console.log('✅ DB 클라이언트 연결 성공');

        // 트랜잭션 시작
        await client.query('BEGIN');

        // 회원 존재 확인 (빠른 검증)
        const memberResult = await client.query(
            'SELECT id, name FROM member WHERE id = $1',
            [member_id]
        );

        if (memberResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ 
                success: false,
                error: '회원을 찾을 수 없습니다.',
                member_id: member_id
            });
        }

        // 카테고리 ID 조회 또는 생성
        let categoryResult = await client.query(
            'SELECT id FROM activity_categories WHERE category_name = $1',
            [category_name]
        );

        let categoryId;
        if (categoryResult.rows.length === 0) {
            // 카테고리 자동 생성
            const insertCategoryResult = await client.query(
                'INSERT INTO activity_categories (category_name, category_group, description) VALUES ($1, $2, $3) RETURNING id',
                [category_name, '기타', `${category_name} 활동`]
            );
            categoryId = insertCategoryResult.rows[0].id;
            console.log('✅ 새 카테고리 생성:', category_name, 'ID:', categoryId);
        } else {
            categoryId = categoryResult.rows[0].id;
        }

        // 기존 기록 확인 및 업데이트/삽입
        const existingRecord = await client.query(
            'SELECT id, note FROM activity_records WHERE member_id = $1 AND category_id = $2 AND activity_date = $3::date',
            [member_id, categoryId, activity_date]
        );

        let result;
        if (existingRecord.rows.length > 0) {
            // 기존 기록 업데이트
            const updateQuery = `
                UPDATE activity_records 
                SET ${field_name} = $1, note = COALESCE(NULLIF(TRIM($2), ''), note), updated_at = CURRENT_TIMESTAMP
                WHERE member_id = $3 AND category_id = $4 AND activity_date = $5::date
                RETURNING *
            `;
            result = await client.query(updateQuery, [
                field_value, 
                note, 
                member_id, 
                categoryId, 
                activity_date
            ]);
            console.log('✅ 활동 기록 업데이트 성공:', result.rows[0].id);
        } else {
            // 새 기록 추가
            const insertQuery = `
                INSERT INTO activity_records 
                (member_id, category_id, ${field_name}, note, activity_date)
                VALUES ($1, $2, $3, $4, $5::date)
                RETURNING *
            `;
            result = await client.query(insertQuery, [
                member_id, 
                categoryId, 
                field_value, 
                note, 
                activity_date
            ]);
            console.log('✅ 새 활동 기록 추가 성공:', result.rows[0].id);
        }

        // 트랜잭션 커밋
        await client.query('COMMIT');

        // 즉시 응답 반환
        res.json({
            success: true,
            message: '활동이 즉시 저장되었습니다!',
            record: result.rows[0],
            timestamp: new Date().toISOString(),
            processing_time: Date.now()
        });

    } catch (err) {
        // 트랜잭션 롤백
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackErr) {
                console.error('❌ 롤백 오류:', rollbackErr);
            }
        }
        
        console.error('❌ 즉시 활동 입력 오류:', err);
        res.status(500).json({ 
            success: false,
            error: '활동 입력 중 오류가 발생했습니다.',
            details: err.message,
            timestamp: new Date().toISOString()
        });
    } finally {
        // 클라이언트 연결 해제
        if (client) {
            try {
                client.release();
                console.log('✅ DB 클라이언트 연결 해제');
            } catch (releaseErr) {
                console.error('❌ 클라이언트 연결 해제 오류:', releaseErr);
            }
        }
    }
});

// 실시간 활동 입력 API (즉시 저장)
app.post('/api/activities/realtime', async (req, res) => {
    let client;
    try {
        const { member_id, category_name, field_name, field_value, activity_date } = req.body;

        console.log('⚡ 실시간 활동 입력:', { member_id, category_name, field_name, field_value });

        // 최소한의 검증
        if (!member_id || !category_name || !field_name || !activity_date) {
            return res.status(400).json({ 
                success: false,
                error: '필수 정보 누락'
            });
        }

        // 연결 획득
        client = await pool.connect();
        
        // 트랜잭션 시작
        await client.query('BEGIN');

        // 카테고리 ID 조회/생성
        let categoryResult = await client.query(
            'SELECT id FROM activity_categories WHERE category_name = $1',
            [category_name]
        );

        let categoryId;
        if (categoryResult.rows.length === 0) {
            const insertResult = await client.query(
                'INSERT INTO activity_categories (category_name, category_group, description) VALUES ($1, $2, $3) RETURNING id',
                [category_name, '기타', `${category_name} 활동`]
            );
            categoryId = insertResult.rows[0].id;
        } else {
            categoryId = categoryResult.rows[0].id;
        }

        // UPSERT (기존 기록이 있으면 업데이트, 없으면 삽입)
        const upsertQuery = `
            INSERT INTO activity_records (member_id, category_id, ${field_name}, activity_date)
            VALUES ($1, $2, $3, $4::date)
            ON CONFLICT (member_id, category_id, activity_date)
            DO UPDATE SET 
                ${field_name} = EXCLUDED.${field_name},
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;

        const result = await client.query(upsertQuery, [
            member_id, categoryId, field_value, activity_date
        ]);

        await client.query('COMMIT');

        // 즉시 응답
        res.json({
            success: true,
            message: '실시간 저장 완료',
            record_id: result.rows[0].id,
            timestamp: Date.now()
        });

    } catch (err) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('❌ 실시간 입력 오류:', err);
        res.status(500).json({ 
            success: false,
            error: '실시간 저장 실패'
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// 날짜 디버깅 API (디버깅용)
app.get('/api/debug/dates', async (req, res) => {
    try {
        const { member_id, category_name } = req.query;
        
        let query = `
            SELECT 
                ar.id,
                ar.activity_date,
                ar.activity_date::text as activity_date_text,
                TO_CHAR(ar.activity_date AT TIME ZONE 'UTC', 'YYYY-MM-DD') as activity_date_formatted,
                EXTRACT(YEAR FROM ar.activity_date) as year,
                EXTRACT(MONTH FROM ar.activity_date) as month,
                EXTRACT(DAY FROM ar.activity_date) as day,
                ac.category_name,
                m.name as member_name
            FROM activity_records ar
            LEFT JOIN activity_categories ac ON ar.category_id = ac.id
            LEFT JOIN member m ON ar.member_id = m.id
            WHERE 1=1
        `;
        
        let params = [];
        let paramIndex = 1;
        
        if (member_id) {
            query += ` AND ar.member_id = $${paramIndex}`;
            params.push(member_id);
            paramIndex++;
        }
        
        if (category_name) {
            query += ` AND ac.category_name = $${paramIndex}`;
            params.push(category_name);
            paramIndex++;
        }
        
        query += ` ORDER BY ar.activity_date DESC LIMIT 10`;
        
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            records: result.rows,
            debug_info: {
                query: query,
                params: params,
                count: result.rows.length
            }
        });
        
    } catch (err) {
        console.error('날짜 디버깅 API 오류:', err);
        res.status(500).json({ error: '날짜 디버깅 중 오류가 발생했습니다.' });
    }
});

// 날짜 수정 API (강제 수정용)
app.post('/api/debug/fix-dates', async (req, res) => {
    try {
        const { member_id } = req.body;
        
        console.log('날짜 수정 요청:', { member_id, type: typeof member_id });
        
        if (!member_id) {
            return res.status(400).json({ error: '회원 ID가 필요합니다.' });
        }
        
        const memberId = parseInt(member_id);
        if (isNaN(memberId)) {
            return res.status(400).json({ error: '유효하지 않은 회원 ID입니다.' });
        }
        
        // 먼저 수정할 기록들을 확인
        const checkResult = await pool.query(`
            SELECT id, activity_date, TO_CHAR(activity_date, 'YYYY-MM-DD') as current_date
            FROM activity_records 
            WHERE member_id = $1
            ORDER BY activity_date DESC
        `, [memberId]);
        
        console.log('수정 전 기록들:', checkResult.rows);
        
        if (checkResult.rows.length === 0) {
            return res.json({
                success: true,
                message: '수정할 기록이 없습니다.',
                records: []
            });
        }
        
        // 해당 회원의 모든 활동 기록의 날짜를 +1일로 수정
        const updateResult = await pool.query(`
            UPDATE activity_records 
            SET activity_date = activity_date + INTERVAL '1 day'
            WHERE member_id = $1
            RETURNING id, activity_date, TO_CHAR(activity_date, 'YYYY-MM-DD') as new_date
        `, [memberId]);
        
        console.log('수정 후 기록들:', updateResult.rows);
        
        res.json({
            success: true,
            message: `${updateResult.rows.length}개의 기록이 수정되었습니다.`,
            before_records: checkResult.rows,
            after_records: updateResult.rows
        });
        
    } catch (err) {
        console.error('날짜 수정 오류 상세:', err);
        res.status(500).json({ 
            error: '날짜 수정 중 오류가 발생했습니다.',
            details: err.message,
            stack: err.stack
        });
    }
});

// 간단한 날짜 수정 API (모든 회원)
app.post('/api/debug/fix-all-dates', async (req, res) => {
    try {
        console.log('전체 날짜 수정 요청');
        
        // 모든 활동 기록의 날짜를 +1일로 수정
        const updateResult = await pool.query(`
            UPDATE activity_records 
            SET activity_date = activity_date + INTERVAL '1 day'
            RETURNING id, member_id, activity_date, TO_CHAR(activity_date, 'YYYY-MM-DD') as new_date
        `);
        
        console.log('수정된 기록들:', updateResult.rows);
        
        res.json({
            success: true,
            message: `${updateResult.rows.length}개의 기록이 수정되었습니다.`,
            records: updateResult.rows
        });
        
    } catch (err) {
        console.error('전체 날짜 수정 오류:', err);
        res.status(500).json({ 
            error: '전체 날짜 수정 중 오류가 발생했습니다.',
            details: err.message
        });
    }
});

// 데이터베이스 테이블 확인 API (디버깅용)
app.get('/api/debug/check-tables', async (req, res) => {
    try {
        const tables = ['member', 'activity_categories', 'activity_records'];
        const results = {};
        
        for (const table of tables) {
            try {
                const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
                results[table] = {
                    exists: true,
                    count: result.rows[0].count
                };
            } catch (err) {
                results[table] = {
                    exists: false,
                    error: err.message
                };
            }
        }
        
        // activity_records 테이블 구조 확인
        try {
            const columnsResult = await pool.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'activity_records'
                ORDER BY ordinal_position
            `);
            results.activity_records_columns = columnsResult.rows;
        } catch (err) {
            results.activity_records_columns = { error: err.message };
        }
        
        res.json({
            success: true,
            tables: results
        });
        
    } catch (error) {
        console.error('데이터베이스 테이블 확인 오류:', error);
        res.status(500).json({
            success: false,
            error: '데이터베이스 테이블 확인 중 오류가 발생했습니다.',
            details: error.message
        });
    }
});

// 활동집계 API
app.get('/api/activities/summary', async (req, res) => {
    try {
        const { start_date, end_date, member_id, church_name, pr_name, curia_name, comitia_name, senatus_name } = req.query;
        const curiaNamesRaw = req.query.curia_names;
        const comitiaNamesRaw = req.query.comitia_names;
        
        if (!start_date || !end_date) {
            return res.status(400).json({ error: '시작일과 종료일은 필수입니다.' });
        }

        let query = `
            SELECT 
                ar.id,
                ar.member_id,
                ar.category_id,
                ar.target,
                ar.count,
                ar.catechism_guide,
                ar.group_join,
                ar.meeting_head,
                ar.resolution,
                ar.sacrament,
                ar.confirmation,
                ar.baptism,
                ar.first_communion,
                ar.year_count,
                ar.funeral_mass,
                ar.funeral_attendance,
                ar.conditional_baptism,
                ar.conditional_communion,
                ar.membership,
                ar.establishment,
                ar.inout_count,
                ar.memorial_mass,
                ar.note,
                ar.activity_date::text as activity_date,
                TO_CHAR(ar.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
                ac.category_name,
                m.name as member_name,
                m.pr_name,
                m.curia_name,
                m.comitia_name
            FROM activity_records ar
            LEFT JOIN activity_categories ac ON ar.category_id = ac.id
            LEFT JOIN member m ON ar.member_id = m.id
            WHERE ar.activity_date::date BETWEEN $1::date AND $2::date
        `;
        
        let params = [start_date, end_date];
        let paramIndex = 3;

        const curiaNames = Array.isArray(curiaNamesRaw)
            ? curiaNamesRaw.map((v) => String(v || '').trim()).filter(Boolean)
            : String(curiaNamesRaw || '')
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean);

        const comitiaNames = Array.isArray(comitiaNamesRaw)
            ? comitiaNamesRaw.map((v) => String(v || '').trim()).filter(Boolean)
            : String(comitiaNamesRaw || '')
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean);

        if (member_id) {
            query += ` AND ar.member_id = $${paramIndex}`;
            params.push(member_id);
            paramIndex++;
        } else if (church_name && pr_name) {
            query += ` AND ar.member_id IN (
                SELECT id FROM member WHERE church_name = $${paramIndex} AND pr_name = $${paramIndex + 1}
            )`;
            params.push(church_name, pr_name);
            paramIndex += 2;
        } else if (curiaNames.length > 0) {
            query += ` AND ar.member_id IN (
                SELECT id FROM member WHERE curia_name = ANY($${paramIndex}::text[])
            )`;
            params.push(curiaNames);
            paramIndex++;
        } else if (church_name && curia_name) {
            query += ` AND ar.member_id IN (
                SELECT id FROM member WHERE church_name = $${paramIndex} AND curia_name = $${paramIndex + 1}
            )`;
            params.push(church_name, curia_name);
            paramIndex += 2;
        } else if (comitiaNames.length > 0) {
            query += ` AND ar.member_id IN (
                SELECT id FROM member WHERE comitia_name = ANY($${paramIndex}::text[])
            )`;
            params.push(comitiaNames);
            paramIndex++;
        } else if (comitia_name) {
            query += ` AND ar.member_id IN (
                SELECT id FROM member WHERE comitia_name = $${paramIndex}
            )`;
            params.push(String(comitia_name).trim());
            paramIndex++;
        } else if (senatus_name) {
            // 세나뚜스 산하 모든 레지아 소속 회원(Pr 산하 단원 포함) 활동
            query += ` AND ar.member_id IN (
                SELECT id FROM member
                WHERE senatus_name = $${paramIndex}
                   OR (
                        regia_name IS NOT NULL
                        AND TRIM(regia_name) <> ''
                        AND regia_name IN (
                            SELECT DISTINCT m2.regia_name
                            FROM member m2
                            WHERE m2.senatus_name = $${paramIndex}
                              AND m2.regia_name IS NOT NULL
                              AND TRIM(m2.regia_name) <> ''
                        )
                   )
            )`;
            params.push(String(senatus_name).trim());
            paramIndex++;
        }

        query += ` ORDER BY ar.activity_date DESC, ar.id DESC`;

        const result = await pool.query(query, params);
        
        console.log(
            `활동집계 조회: ${start_date} ~ ${end_date}, 회원ID: ${member_id || '-'}, Pr: ${pr_name || '-'}, 꾸리아: ${curia_name || curiaNames.join('|') || '-'}, 꼬미시움: ${comitia_name || comitiaNames.join('|') || '-'}, 세나뚜스: ${senatus_name || '-'}, 결과: ${result.rows.length}개`
        );
        
        // 날짜 처리 개선 - 시간대 변환 없이 원본 날짜 유지
        const processedRows = result.rows.map(row => {
            if (row.activity_date) {
                // PostgreSQL에서 반환되는 날짜를 YYYY-MM-DD 형식으로 변환
                const dateStr = String(row.activity_date);
                const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
                if (dateMatch) {
                    row.activity_date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
                }
            }
            return row;
        });
        
        res.json(processedRows);

    } catch (err) {
        console.error('활동집계 조회 오류:', err);
        res.status(500).json({ error: '활동집계 조회 중 오류가 발생했습니다.' });
    }
});

// 활동 필드 매핑 추가 API
app.post('/api/activity-field-mapping', async (req, res) => {
    try {
        const { admin_name, admin_password, category_name, field_name, field_display_name, field_type, is_required } = req.body;

        if (!await verifyAdminAccess(admin_name, admin_password)) {
            return res.status(403).json({
                success: false,
                error: '관리자 인증이 필요합니다.'
            });
        }
        
        console.log('새 카테고리 활동 추가 요청:', { category_name, field_name, field_display_name, field_type, is_required });

        // 필수 필드 검증
        if (!category_name || !field_name || !field_display_name || !field_type) {
            return res.status(400).json({
                success: false,
                error: '모든 필수 필드를 입력해주세요.'
            });
        }

        // 테이블 존재 여부 확인 및 생성
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS activity_field_mapping (
                    id SERIAL PRIMARY KEY,
                    category_name VARCHAR(100) NOT NULL,
                    field_name VARCHAR(50) NOT NULL,
                    field_display_name VARCHAR(50) NOT NULL,
                    field_type VARCHAR(20) DEFAULT 'integer',
                    is_required BOOLEAN DEFAULT false,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(category_name, field_name)
                )
            `);
            console.log('activity_field_mapping 테이블 확인/생성 완료');
        } catch (tableErr) {
            console.error('테이블 생성 오류:', tableErr);
            return res.status(500).json({
                success: false,
                error: '데이터베이스 테이블 생성 중 오류가 발생했습니다.'
            });
        }

        // 중복 검사
        const existingMapping = await pool.query(
            'SELECT id FROM activity_field_mapping WHERE category_name = $1 AND field_name = $2',
            [category_name, field_name]
        );

        if (existingMapping.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: '이미 존재하는 카테고리와 필드 조합입니다.'
            });
        }

        // activity_categories 테이블에 카테고리 추가 (없으면)
        const categoryGroup = category_name.split('-')[0]; // 기도생활, 레지오활동 등
        const categoryDescription = `${category_name} 활동`;
        
        try {
            await pool.query(`
                INSERT INTO activity_categories (category_name, category_group, description)
                VALUES ($1, $2, $3)
                ON CONFLICT (category_name) DO NOTHING
            `, [category_name, categoryGroup, categoryDescription]);
            console.log('activity_categories 테이블에 카테고리 추가 완료:', category_name);
        } catch (categoryErr) {
            console.log('activity_categories 테이블에 카테고리가 이미 존재하거나 추가 실패:', categoryErr.message);
        }

        // activity_field_mapping 테이블에 데이터 추가
        const result = await pool.query(`
            INSERT INTO activity_field_mapping 
            (category_name, field_name, field_display_name, field_type, is_required)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, category_name, field_name, field_display_name, field_type, is_required, created_at
        `, [category_name, field_name, field_display_name, field_type, is_required]);

        console.log('새 카테고리 활동 추가 성공:', result.rows[0]);

        res.json({
            success: true,
            message: '새 카테고리 활동이 성공적으로 추가되었습니다.',
            mapping: result.rows[0]
        });

    } catch (err) {
        console.error('새 카테고리 활동 추가 오류:', err);
        res.status(500).json({ 
            success: false,
            error: '새 카테고리 활동 추가 중 오류가 발생했습니다.' 
        });
    }
});

// 지정활동 수정 저장 API (관리자 전용)
app.post('/api/new-category', async (req, res) => {
    try {
        const {
            admin_name, admin_password,
            category, sub_item, count, target, catechism_guide, group_join, meeting_head,
            resolution, sacrament, confirmation, baptism, first_communion, year_count,
            funeral_mass, funeral_attendance, conditional_baptism, conditional_communion,
            membership, establishment, memo, activity_date
        } = req.body;

        if (!await verifyAdminAccess(admin_name, admin_password)) {
            return res.status(403).json({
                success: false,
                error: '관리자 인증이 필요합니다.'
            });
        }

        if (!category || !sub_item) {
            return res.status(400).json({
                success: false,
                error: '카테고리와 세목은 필수 입력 항목입니다.'
            });
        }

        const categoryName = `${category}-${sub_item}`;
        const adminMember = await pool.query(
            'SELECT id FROM member WHERE name = $1 AND passno = $2',
            [ADMIN_NAME, ADMIN_PASSWORD]
        );

        if (adminMember.rows.length === 0) {
            return res.status(500).json({
                success: false,
                error: '관리자 회원 정보를 찾을 수 없습니다.'
            });
        }

        let categoryId;
        const categoryResult = await pool.query(
            'SELECT id FROM activity_categories WHERE category_name = $1',
            [categoryName]
        );

        if (categoryResult.rows.length > 0) {
            categoryId = categoryResult.rows[0].id;
        } else {
            const insertedCategory = await pool.query(
                `INSERT INTO activity_categories (category_name, category_group, description)
                 VALUES ($1, $2, $3)
                 RETURNING id`,
                [categoryName, category, `${categoryName} 활동`]
            );
            categoryId = insertedCategory.rows[0].id;
        }

        const processedDate = activity_date || new Date().toISOString().split('T')[0];
        const result = await pool.query(
            `INSERT INTO activity_records
             (category_id, member_id, target, count, catechism_guide, group_join, meeting_head,
              resolution, sacrament, confirmation, baptism, first_communion,
              year_count, funeral_mass, funeral_attendance, conditional_baptism,
              conditional_communion, membership, establishment, note, activity_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::date)
             RETURNING id`,
            [
                categoryId, adminMember.rows[0].id, target || null, count || 0,
                catechism_guide || 0, group_join || 0, meeting_head || 0,
                resolution || 0, sacrament || 0, confirmation || 0, baptism || 0,
                first_communion || 0, year_count || 0, funeral_mass || 0,
                funeral_attendance || 0, conditional_baptism || 0, conditional_communion || 0,
                membership || 0, establishment || 0, memo || null, processedDate
            ]
        );

        res.json({
            success: true,
            message: '지정활동이 성공적으로 저장되었습니다.',
            record_id: result.rows[0].id
        });
    } catch (err) {
        console.error('지정활동 저장 오류:', err);
        res.status(500).json({
            success: false,
            error: '지정활동 저장 중 오류가 발생했습니다.'
        });
    }
});

// 활동 필드 매핑 조회 API
app.get('/api/activity-field-mapping', async (req, res) => {
    try {
        // 테이블 존재 여부 확인
        const tableExists = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'activity_field_mapping'
            )
        `);

        if (!tableExists.rows[0].exists) {
            return res.json({
                success: true,
                mappings: [],
                message: '테이블이 존재하지 않습니다. 새 카테고리를 추가해주세요.'
            });
        }

        const result = await pool.query(`
            SELECT * FROM activity_field_mapping 
            ORDER BY category_name, field_name
        `);
        
        console.log(`활동 필드 매핑 조회: ${result.rows.length}개`);
        
        res.json({
            success: true,
            mappings: result.rows
        });

    } catch (err) {
        console.error('활동 필드 매핑 조회 오류:', err);
        res.status(500).json({ 
            success: false,
            error: '활동 필드 매핑 조회 중 오류가 발생했습니다.' 
        });
    }
});

// 메인 페이지 서빙
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 로컬 전용: 연결 풀을 정상 종료한 뒤 프로세스 종료 (서버끄기.bat)
app.post('/api/admin/shutdown', async (req, res) => {
    if (!isLocalRequest(req)) {
        return res.status(403).json({ error: '로컬에서만 종료할 수 있습니다.' });
    }
    res.json({ success: true, message: '서버를 종료합니다.' });
    setImmediate(async () => {
        try {
            await pool.end();
            console.log('✅ 데이터베이스 연결 풀이 정리되었습니다.');
        } catch (err) {
            console.error('❌ 연결 풀 정리 중 오류:', err);
        }
        process.exit(0);
    });
});

let httpServer = null;
let shuttingDown = false;

async function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`🔄 ${signal}: 서버 종료 중... 연결 풀을 정리합니다.`);
    try {
        if (httpServer) {
            await new Promise((resolve) => httpServer.close(() => resolve()));
        }
        await pool.end();
        console.log('✅ 데이터베이스 연결 풀이 정리되었습니다.');
        process.exit(0);
    } catch (err) {
        console.error('❌ 연결 풀 정리 중 오류:', err);
        process.exit(1);
    }
}

// 서버 시작
async function ensureMemberExtraColumns(appPool) {
    const alterSql = [
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS comitia_name VARCHAR(200)`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS regia_name VARCHAR(200)`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS senatus_name VARCHAR(50)`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS gender VARCHAR(10)`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS pr_type VARCHAR(20)`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS officer_appointed_on DATE`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS pr_meeting_weekday VARCHAR(10)`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS pr_meeting_hour SMALLINT`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS pr_meeting_minute SMALLINT`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS pr_meeting_place VARCHAR(100)`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS pr_founded_on DATE`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS pr_approved_on DATE`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS curia_officer_elected_on DATE`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS pr_returned_on DATE`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS curia_approved_on DATE`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS curia_meeting_on DATE`,
        `ALTER TABLE member ADD COLUMN IF NOT EXISTS curia_meeting_place VARCHAR(100)`
    ];

    async function runAlters(targetPool) {
        for (const sql of alterSql) {
            await targetPool.query(sql);
        }
    }

    try {
        await runAlters(appPool);
        return;
    } catch (err) {
        const msg = String(err && err.message || '');
        const needsOwner = /소유주|owner|must be owner/i.test(msg);
        if (!needsOwner) throw err;
    }

    const adminUser = process.env.DB_ADMIN_USER || 'postgres';
    const adminPassword = process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || '5854';
    const databaseUrl = resolveDatabaseUrl();
    const adminPool = databaseUrl
        ? new Pool({
            connectionString: databaseUrl,
            ssl: dbPoolConfig.ssl || false,
            max: 1,
            application_name: 'regio-schema-admin'
        })
        : new Pool({
            user: adminUser,
            host: process.env.DB_HOST || 'localhost',
            database: process.env.DB_NAME || 'regio',
            password: adminPassword,
            port: parseInt(process.env.DB_PORT || '5432', 10),
            max: 1,
            application_name: 'regio-schema-admin'
        });
    try {
        await runAlters(adminPool);
        console.log(`✅ member 추가 컬럼을 ${adminUser} 권한으로 준비했습니다.`);
    } finally {
        await adminPool.end();
    }
}

// 빈 Render DB 등에 로컬 모의자료 적재 (관리자 인증 필요)
// - member 가 비어 있으면 허용
// - 이미 회원이 있으면 ALLOW_SAMPLE_SEED=1 일 때만 허용
app.post('/api/admin/bootstrap-sample', async (req, res) => {
    const client = await pool.connect();
    try {
        const adminName = String(req.body.admin_name || '').trim();
        const adminPassword = String(req.body.admin_password || '').trim();
        // 빈 DB 부트스트랩: member 행이 없어도 내장 관리자 계정으로 허용
        const adminOk = (adminName === ADMIN_NAME && adminPassword === ADMIN_PASSWORD)
            || await verifyAdminAccess(adminName, adminPassword);
        if (!adminOk) {
            return res.status(403).json({ success: false, error: '관리자 인증이 필요합니다.' });
        }

        const countResult = await client.query('SELECT COUNT(*)::int AS n FROM member');
        const memberCount = countResult.rows[0].n;
        const allowSeed = String(process.env.ALLOW_SAMPLE_SEED || '').trim() === '1';
        const continueBootstrap = req.body.continue_bootstrap === true;
        if (memberCount > 0 && !allowSeed && !continueBootstrap) {
            return res.status(409).json({
                success: false,
                error: `이미 회원 ${memberCount}명이 있습니다. 덮어쓰려면 continue_bootstrap=true 또는 ALLOW_SAMPLE_SEED=1 이 필요합니다.`,
                memberCount
            });
        }

        const categories = Array.isArray(req.body.categories) ? req.body.categories : [];
        const members = Array.isArray(req.body.members) ? req.body.members : [];
        const activityRecords = Array.isArray(req.body.activity_records) ? req.body.activity_records : [];
        const assignments = Array.isArray(req.body.activity_assignments) ? req.body.activity_assignments : [];
        const stage = String(req.body.stage || 'data').trim();
        const reset = req.body.reset === true;

        if (reset || stage === 'reset') {
            await client.query('BEGIN');
            await client.query('TRUNCATE TABLE activity_assignments, activity_records, play_purchases, member, activity_categories RESTART IDENTITY CASCADE');
            await client.query('COMMIT');
            return res.json({ success: true, stage: 'reset', message: '모의 적재용 테이블을 비웠습니다.' });
        }

        await client.query('BEGIN');

        if (categories.length) {
            for (const row of categories) {
                await client.query(
                    `INSERT INTO activity_categories (id, category_name, category_group, description, created_at)
                     VALUES ($1, $2, $3, $4, COALESCE($5::timestamp, CURRENT_TIMESTAMP))
                     ON CONFLICT (id) DO UPDATE SET
                       category_name = EXCLUDED.category_name,
                       category_group = EXCLUDED.category_group,
                       description = EXCLUDED.description`,
                    [
                        row.id,
                        row.category_name,
                        row.category_group || '기타',
                        row.description || null,
                        row.created_at || null
                    ]
                );
            }
            await client.query(
                `SELECT setval(pg_get_serial_sequence('activity_categories', 'id'),
                        COALESCE((SELECT MAX(id) FROM activity_categories), 1), true)`
            );
        }

        const memberCols = [
            'id', 'name', 'baptism_name', 'church_name', 'curia_name', 'curia_officer', 'pr_name', 'position',
            'phone_last4', 'resident_id_front6', 'phone_full', 'resident_id_full', 'passno',
            'email', 'email_verified', 'google_id', 'comitia_name', 'regia_name', 'senatus_name',
            'gender', 'pr_type', 'officer_appointed_on', 'pr_meeting_weekday', 'pr_meeting_hour',
            'pr_meeting_minute', 'pr_meeting_place', 'pr_founded_on', 'pr_approved_on',
            'curia_officer_elected_on', 'pr_returned_on', 'curia_approved_on', 'curia_meeting_on',
            'curia_meeting_place', 'activity_count', 'created_at', 'updated_at'
        ];

        if (members.length) {
            for (const row of members) {
                const values = memberCols.map((c) => (row[c] === undefined ? null : row[c]));
                const placeholders = memberCols.map((_, i) => `$${i + 1}`).join(', ');
                const updates = memberCols
                    .filter((c) => c !== 'id')
                    .map((c) => `${c} = EXCLUDED.${c}`)
                    .join(', ');
                await client.query(
                    `INSERT INTO member (${memberCols.join(', ')})
                     VALUES (${placeholders})
                     ON CONFLICT (id) DO UPDATE SET ${updates}`,
                    values
                );
            }
            await client.query(
                `SELECT setval(pg_get_serial_sequence('member', 'id'),
                        COALESCE((SELECT MAX(id) FROM member), 1), true)`
            );
        }

        if (activityRecords.length) {
            for (const row of activityRecords) {
                await client.query(
                    `INSERT INTO activity_records (
                        id, member_id, category_id, target, count,
                        catechism_guide, group_join, meeting_head, resolution, sacrament,
                        confirmation, baptism, first_communion, year_count, funeral_mass,
                        memorial_mass, funeral_attendance, conditional_baptism, conditional_communion,
                        membership, establishment, inout_count, note, activity_date, created_at, updated_at
                     ) VALUES (
                        $1,$2,$3,$4,$5,
                        $6,$7,$8,$9,$10,
                        $11,$12,$13,$14,$15,
                        $16,$17,$18,$19,
                        $20,$21,$22,$23,$24::date,$25,$26
                     )
                     ON CONFLICT (id) DO UPDATE SET
                        member_id = EXCLUDED.member_id,
                        category_id = EXCLUDED.category_id,
                        target = EXCLUDED.target,
                        count = EXCLUDED.count,
                        note = EXCLUDED.note,
                        activity_date = EXCLUDED.activity_date`,
                    [
                        row.id, row.member_id, row.category_id, row.target || null, row.count || 0,
                        row.catechism_guide || 0, row.group_join || 0, row.meeting_head || 0,
                        row.resolution || 0, row.sacrament || 0, row.confirmation || 0,
                        row.baptism || 0, row.first_communion || 0, row.year_count || 0,
                        row.funeral_mass || 0, row.memorial_mass || 0, row.funeral_attendance || 0,
                        row.conditional_baptism || 0, row.conditional_communion || 0,
                        row.membership || 0, row.establishment || 0, row.inout_count || 0,
                        row.note || null, row.activity_date || null,
                        row.created_at || null, row.updated_at || null
                    ]
                );
            }
            await client.query(
                `SELECT setval(pg_get_serial_sequence('activity_records', 'id'),
                        COALESCE((SELECT MAX(id) FROM activity_records), 1), true)`
            );
        }

        if (assignments.length) {
            for (const row of assignments) {
                await client.query(
                    `INSERT INTO activity_assignments (
                        id, member_id, assigner_id, "활동배당", "활동대상자",
                        church_name, pr_name, created_at, updated_at
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                     ON CONFLICT (id) DO UPDATE SET
                        member_id = EXCLUDED.member_id,
                        assigner_id = EXCLUDED.assigner_id,
                        "활동배당" = EXCLUDED."활동배당",
                        "활동대상자" = EXCLUDED."활동대상자"`,
                    [
                        row.id, row.member_id, row.assigner_id,
                        row['활동배당'] || row.activity_assignment || '',
                        row['활동대상자'] || row.activity_target || null,
                        row.church_name || null, row.pr_name || null,
                        row.created_at || null, row.updated_at || null
                    ]
                );
            }
            await client.query(
                `SELECT setval(pg_get_serial_sequence('activity_assignments', 'id'),
                        COALESCE((SELECT MAX(id) FROM activity_assignments), 1), true)`
            );
        }

        await client.query('COMMIT');
        const after = await pool.query('SELECT COUNT(*)::int AS n FROM member');
        res.json({
            success: true,
            stage: 'data',
            inserted: {
                categories: categories.length,
                members: members.length,
                activity_records: activityRecords.length,
                activity_assignments: assignments.length
            },
            memberCount: after.rows[0].n
        });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        console.error('bootstrap-sample 오류:', err);
        res.status(500).json({ success: false, error: err.message || '모의자료 적재 실패' });
    } finally {
        client.release();
    }
});

httpServer = app.listen(PORT, async () => {
    console.log(`🚀 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
    console.log('📁 메인 페이지: http://localhost:3000/');
    console.log('📁 활동종목 편집: http://localhost:3000/activity-category-editor.html');
    console.log('📁 새 카테고리 활동 추가: http://localhost:3000/modify.html');
    
    // 데이터베이스 연결 테스트 실행 (연결 풀은 종료하지 않고 그대로 사용)
    await testDatabaseConnection();
    try {
        await ensureCoreSchema(pool);
        console.log('✅ 핵심 스키마(member 등) 준비 완료');
    } catch (schemaBootError) {
        console.error('❌ 핵심 스키마 준비 실패:', schemaBootError.message);
        console.error('   Render DB가 비어 있으면 테이블 생성 권한이 있는 DB 사용자인지 확인하세요.');
    }
    try {
        await ensureMemberExtraColumns(pool);
    } catch (columnError) {
        console.error('❌ member 추가 컬럼 준비 실패:', columnError.message);
    }
    try {
        await ensureEmailAuthSchema(pool);
        console.log('✅ Gmail/Google 인증 스키마 준비 완료');
        if (!isEmailConfigured()) {
            console.log('ℹ️ GMAIL_USER 미설정: 인증코드는 서버 콘솔에 출력됩니다.');
        }
        if (!isGoogleLoginConfigured()) {
            console.log('ℹ️ GOOGLE_CLIENT_ID 미설정: Google 로그인 비활성');
        }
    } catch (schemaError) {
        console.error('❌ 인증 스키마 준비 실패:', schemaError.message);
    }
    try {
        startActivityRetentionScheduler(pool);
        console.log(`ℹ️ 개인활동 보관기간: ${retentionMonths()}개월 (기록일 기준 자동삭제)`);
    } catch (purgeBootError) {
        console.error('❌ 활동자료 자동삭제 스케줄러 시작 실패:', purgeBootError.message);
    }
});

// 에러 핸들링
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));
