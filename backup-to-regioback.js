/**
 * Regio 프로젝트 → regioback 폴더 백업
 * - 소스 코드 전체 복사
 * - PostgreSQL DB 덤프 (pg_dump)
 * - 기본: D:\...\regio\regioback + E:\regioback (추가 미러)
 *
 * node backup-to-regioback.js
 * node backup-to-regioback.js --db-only
 *
 * REGIOBACK_EXTRA=E:\regioback   (기본값, 쉼표로 여러 경로)
 * REGIOBACK_EXTRA=off            (E: 미러 끄기)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

try {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (_) {
    /* optional */
}

const ROOT = path.resolve(__dirname);
const BACKUP_ROOT = path.join(ROOT, 'regioback');
const DB_BACKUP_DIR = path.join(BACKUP_ROOT, 'db');
const DB_KEEP_COUNT = parseInt(process.env.DB_BACKUP_KEEP || '15', 10);
const DEFAULT_EXTRA_BACKUP = 'E:\\regioback';

function isPathReachable(targetPath) {
    try {
        const resolved = path.resolve(targetPath);
        const driveRoot = path.parse(resolved).root;
        fs.accessSync(driveRoot);
        return true;
    } catch {
        return false;
    }
}

/** 로컬 regioback 외 추가 백업 루트 (기본 E:\regioback) */
function getExtraBackupRoots() {
    const raw = process.env.REGIOBACK_EXTRA;
    let list;
    if (raw === undefined || raw === null) {
        list = [DEFAULT_EXTRA_BACKUP];
    } else {
        const s = String(raw).trim();
        if (!s || /^(0|off|none|false)$/i.test(s)) {
            list = [];
        } else {
            list = s.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
        }
    }

    const primary = path.resolve(BACKUP_ROOT);
    const out = [];
    for (const item of list) {
        const resolved = path.resolve(item);
        if (resolved === primary) continue;
        if (!isPathReachable(resolved)) {
            console.warn(`[regioback] 추가 백업 경로 사용 불가(드라이브 없음): ${resolved}`);
            continue;
        }
        out.push(resolved);
    }
    return out;
}

function getAllBackupRoots() {
    return [BACKUP_ROOT, ...getExtraBackupRoots()];
}

const EXCLUDE_DIRS = new Set([
    'node_modules',
    '.git',
    'regioback',
    'coverage',
    '.vscode',
    '.idea',
    'logs'
]);

const EXCLUDE_FILES = new Set([
    '.DS_Store',
    'Thumbs.db',
    '.regioback-debounce'
]);

function shouldExclude(relPath) {
    const parts = relPath.split(/[/\\]/);
    if (parts.some((part) => EXCLUDE_DIRS.has(part))) {
        return true;
    }
    const base = parts[parts.length - 1];
    if (EXCLUDE_FILES.has(base)) {
        return true;
    }
    if (base.endsWith('.log') || base.endsWith('.tmp') || base.endsWith('.temp')) {
        return true;
    }
    return false;
}

function toRel(fromRoot, absolutePath) {
    return path.relative(fromRoot, absolutePath).split(path.sep).join('/');
}

function copyFile(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

function walkAndBackup(srcDir, destDir, rel = '') {
    if (!fs.existsSync(srcDir)) {
        return 0;
    }

    let count = 0;
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });

    for (const entry of entries) {
        const relPath = rel ? `${rel}/${entry.name}` : entry.name;
        if (shouldExclude(relPath)) {
            continue;
        }

        const src = path.join(srcDir, entry.name);
        const dest = path.join(destDir, entry.name);

        if (entry.isDirectory()) {
            count += walkAndBackup(src, dest, relPath);
        } else if (entry.isFile()) {
            copyFile(src, dest);
            count += 1;
        }
    }

    return count;
}

function writeMeta(extra = {}, backupRoot = BACKUP_ROOT) {
    fs.mkdirSync(backupRoot, { recursive: true });
    const meta = {
        lastBackup: new Date().toISOString(),
        source: ROOT,
        destination: backupRoot,
        mirrors: getAllBackupRoots(),
        ...extra
    };
    fs.writeFileSync(
        path.join(backupRoot, '.backup-meta.json'),
        `${JSON.stringify(meta, null, 2)}\n`,
        'utf8'
    );
}

function writeMetaAll(extra = {}) {
    for (const root of getAllBackupRoots()) {
        writeMeta(extra, root);
    }
}

function copyFileToRoots(src, relativePath) {
    const normalized = String(relativePath || '').replace(/\\/g, '/');
    let ok = false;
    for (const root of getAllBackupRoots()) {
        try {
            const dest = path.join(root, normalized);
            copyFile(src, dest);
            ok = true;
        } catch (e) {
            console.warn(`[regioback] 복사 실패 (${root}): ${e.message}`);
        }
    }
    return ok;
}

/** primary regioback 의 상대 경로 파일을 추가 미러에만 복사 */
function mirrorRelFromPrimary(relativePath) {
    const normalized = String(relativePath || '').replace(/\\/g, '/');
    const src = path.join(BACKUP_ROOT, normalized);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return;
    for (const root of getExtraBackupRoots()) {
        try {
            copyFile(src, path.join(root, normalized));
        } catch (e) {
            console.warn(`[regioback] E: 미러 실패 (${root}/${normalized}): ${e.message}`);
        }
    }
}

function findPgDump() {
    if (process.env.PG_DUMP_PATH && fs.existsSync(process.env.PG_DUMP_PATH)) {
        return process.env.PG_DUMP_PATH;
    }
    const versions = ['17', '16', '15', '14', '13', '12'];
    for (const v of versions) {
        const p = path.join('C:\\Program Files\\PostgreSQL', v, 'bin', 'pg_dump.exe');
        if (fs.existsSync(p)) return p;
    }
    // PATH 상의 pg_dump
    const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['pg_dump'], {
        encoding: 'utf8'
    });
    if (which.status === 0) {
        const first = String(which.stdout || '')
            .split(/\r?\n/)
            .map((s) => s.trim())
            .find(Boolean);
        if (first && fs.existsSync(first)) return first;
    }
    return null;
}

function stampForFile() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function pruneOldDumps(dir, keep) {
    if (!fs.existsSync(dir)) return;
    const files = fs
        .readdirSync(dir)
        .filter((name) => /^regio-\d{4}-\d{2}-\d{2}T.+\.dump$/i.test(name))
        .map((name) => {
            const full = path.join(dir, name);
            return { name, full, mtime: fs.statSync(full).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);

    for (const old of files.slice(Math.max(1, keep))) {
        try {
            fs.unlinkSync(old.full);
        } catch (_) {
            /* ignore */
        }
    }
}

/**
 * PostgreSQL DB → regioback/db/regio-*.dump (+ regio-latest.dump)
 * primary에 덤프 후 추가 미러(E:)에 동일 파일 복사
 */
function backupDatabase(options = {}) {
    const { quiet = false } = options;
    const pgDump = findPgDump();
    if (!pgDump) {
        if (!quiet) {
            console.warn('[regioback] pg_dump를 찾지 못해 DB 백업을 건너뜁니다.');
        }
        return { ok: false, reason: 'no-pg_dump' };
    }

    const host = process.env.DB_HOST || 'localhost';
    const port = String(process.env.DB_PORT || '5432');
    const dbName = process.env.DB_NAME || 'regio';
    const user = process.env.DB_ADMIN_USER || process.env.DB_USER || 'postgres';
    const password =
        process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || '';

    fs.mkdirSync(DB_BACKUP_DIR, { recursive: true });
    const stamp = stampForFile();
    const dumpRel = `db/regio-${stamp}.dump`;
    const latestRel = 'db/regio-latest.dump';
    const dumpFile = path.join(DB_BACKUP_DIR, `regio-${stamp}.dump`);
    const latestFile = path.join(DB_BACKUP_DIR, 'regio-latest.dump');

    const args = [
        '-h', host,
        '-p', port,
        '-U', user,
        '-d', dbName,
        '-F', 'c',
        '-b',
        '-v',
        '--no-owner',
        '--no-acl',
        '-f', dumpFile
    ];

    if (!quiet) {
        console.log(`[regioback] DB 백업 중… (${dbName} → ${dumpRel})`);
    }

    const result = spawnSync(pgDump, args, {
        env: { ...process.env, PGPASSWORD: password },
        encoding: 'utf8',
        windowsHide: true
    });

    if (result.status !== 0) {
        const err = (result.stderr || result.stdout || '').trim().slice(0, 500);
        if (!quiet) {
            console.error('[regioback] DB 백업 실패:', err || `exit ${result.status}`);
        }
        try {
            if (fs.existsSync(dumpFile)) fs.unlinkSync(dumpFile);
        } catch (_) {
            /* ignore */
        }
        return { ok: false, reason: 'pg_dump_failed', error: err };
    }

    try {
        fs.copyFileSync(dumpFile, latestFile);
    } catch (e) {
        if (!quiet) console.warn('[regioback] latest 복사 실패:', e.message);
    }

    pruneOldDumps(DB_BACKUP_DIR, DB_KEEP_COUNT);
    mirrorRelFromPrimary(dumpRel);
    mirrorRelFromPrimary(latestRel);
    for (const root of getExtraBackupRoots()) {
        pruneOldDumps(path.join(root, 'db'), DB_KEEP_COUNT);
    }

    const size = fs.existsSync(dumpFile) ? fs.statSync(dumpFile).size : 0;
    const extras = getExtraBackupRoots();
    if (!quiet) {
        console.log(`[regioback] DB 백업 완료 (${Math.round(size / 1024)} KB) → ${dumpFile}`);
        for (const root of extras) {
            console.log(`[regioback] DB 미러 → ${path.join(root, dumpRel)}`);
        }
    }

    return {
        ok: true,
        file: dumpFile,
        latest: latestFile,
        bytes: size,
        database: dbName,
        mirrors: extras
    };
}

function backupAll(options = {}) {
    const { quiet = false } = options;
    const roots = getAllBackupRoots();

    if (!quiet) {
        console.log(`[regioback] 소스 백업 시작 → ${roots.join(' | ')}`);
    }

    let fileCount = 0;
    for (const root of roots) {
        fs.mkdirSync(root, { recursive: true });
        const n = walkAndBackup(ROOT, root);
        if (root === BACKUP_ROOT) fileCount = n;
        if (!quiet && root !== BACKUP_ROOT) {
            console.log(`[regioback] 소스 미러 완료 (${n}개) → ${root}`);
        }
    }

    if (!quiet) {
        console.log(`[regioback] 소스 백업 완료 (${fileCount}개 파일, 대상 ${roots.length}곳)`);
    }

    return fileCount;
}

/** 소스 + DB 함께 백업 (작업 종료·수동 백업용) */
function backupEverything(options = {}) {
    const { quiet = false } = options;
    const fileCount = backupAll(options);
    const db = backupDatabase(options);
    const meta = {
        mode: 'full+db',
        fileCount,
        db: db.ok
            ? {
                ok: true,
                file: path.relative(BACKUP_ROOT, db.file).split(path.sep).join('/'),
                latest: path.relative(BACKUP_ROOT, db.latest).split(path.sep).join('/'),
                bytes: db.bytes,
                database: db.database
            }
            : db
    };
    writeMetaAll(meta);
    if (!quiet) {
        console.log(`[regioback] 전체 백업 종료 (소스 ${fileCount}개, DB ${db.ok ? 'OK' : 'SKIP/FAIL'})`);
        console.log(`[regioback] 저장 위치: ${getAllBackupRoots().join(' | ')}`);
    }
    return { fileCount, db, roots: getAllBackupRoots() };
}

function backupFile(relativePath, options = {}) {
    const { quiet = false } = options;
    const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\.\/+/, '');

    if (!normalized || shouldExclude(normalized)) {
        return false;
    }

    const src = path.join(ROOT, normalized);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
        return false;
    }

    const ok = copyFileToRoots(src, normalized);
    if (!ok) return false;
    writeMetaAll({ mode: 'single', lastFile: normalized });

    if (!quiet) {
        console.log(`[regioback] 파일 백업: ${normalized} → ${getAllBackupRoots().join(' | ')}`);
    }

    return true;
}

function resolveEditedFilePath(input) {
    if (!input || typeof input !== 'object') {
        return null;
    }

    const candidates = [
        input.file_path,
        input.filePath,
        input.path,
        input.file,
        input.editedFile,
        input.workspaceRelativePath
    ];

    for (const candidate of candidates) {
        if (!candidate || typeof candidate !== 'string') {
            continue;
        }

        const normalized = candidate.replace(/\\/g, '/');
        if (normalized.includes('regioback/')) {
            continue;
        }

        if (path.isAbsolute(candidate)) {
            const rel = toRel(ROOT, candidate);
            if (rel && !rel.startsWith('..')) {
                return rel;
            }
        } else {
            return normalized.replace(/^\.\/+/, '');
        }
    }

    return null;
}

module.exports = {
    ROOT,
    BACKUP_ROOT,
    DB_BACKUP_DIR,
    DEFAULT_EXTRA_BACKUP,
    getExtraBackupRoots,
    getAllBackupRoots,
    backupAll,
    backupDatabase,
    backupEverything,
    backupFile,
    resolveEditedFilePath,
    shouldExclude,
    findPgDump
};

if (require.main === module) {
    const dbOnly = process.argv.includes('--db-only');
    if (dbOnly) {
        const db = backupDatabase();
        writeMetaAll({ mode: 'db-only', db });
        process.exit(db.ok ? 0 : 1);
    } else {
        const result = backupEverything();
        process.exit(result.db && result.db.ok === false && result.db.reason === 'pg_dump_failed' ? 1 : 0);
    }
}
