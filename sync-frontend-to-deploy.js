/**
 * LOCALHOST(regio)의 프론트엔드 수정 → piregio / HOSTregio / RENDERregio 동기화
 * server.js, package.json, .env*, render.yaml, DEPLOYMENT.md, capacitor.config.json 은 제외
 *
 * 실행: node sync-frontend-to-deploy.js
 */
const fs = require('fs');
const path = require('path');

const SOURCE = __dirname;
const PUBLIC_ROOT = path.dirname(SOURCE);

const TARGETS = [
    path.join(SOURCE, 'piregio'),
    path.join(PUBLIC_ROOT, 'HOSTregio'),
    path.join(PUBLIC_ROOT, 'RENDERregio')
];

const ROOT_SHARED_FILES = [
    'index.html',
    'app-mode.js',
    'deploy-mode.js',
    'webview-android.js',
    'admin-menu.js',
    'member-form-fields.js',
    'pr-business-report-form.js',
    'curia-comprehensive-report-form.js',
    'profile-modal.js',
    'curia-officer-register.js',
    'curia-hub.js',
    'pdf-share.js',
    'sensitive-action-auth.js',
    'auth-ui.js',
    'privacy-consent.js',
    'sample-member-roster.js',
    'sample-annual-activity.js',
    'test-export-view.js',
    'user-help.js',
    'date-wheel-picker.js',
    'activity-field-labels.js',
    'category-select-picker.js',
    'daegu-senatus-categories.js',
    'gwangju-senatus-categories.js',
    'billing-bridge.js',
    'mobile.css',
    'activity-assignment.html',
    'activity-input-test.html',
    'activity-report.html',
    'withdraw.html',
    'delete-member.html',
    'modify.html',
    'newcategory.html',
    'activity-category-editor.html',
    'privacy-consent.html',
    'mobile/package.json',
    'mobile/README.md',
    'mobile/www/index.html',
    'docs/google-play-inapp-setup.md',
    'docs/android-webview-prelaunch-checklist.md',
    'create_play_billing_table.sql'
];

const PIREGIO_SHARED_FILES = [
    'index.html',
    'app-mode.js',
    'deploy-mode.js',
    'webview-android.js',
    'admin-menu.js',
    'api-config.js',
    'member-form-fields.js',
    'pr-business-report-form.js',
    'curia-comprehensive-report-form.js',
    'profile-modal.js',
    'curia-officer-register.js',
    'curia-hub.js',
    'pdf-share.js',
    'sensitive-action-auth.js',
    'auth-ui.js',
    'privacy-consent.js',
    'sample-member-roster.js',
    'sample-annual-activity.js',
    'test-export-view.js',
    'user-help.js',
    'date-wheel-picker.js',
    'category-select-picker.js',
    'daegu-senatus-categories.js',
    'gwangju-senatus-categories.js',
    'billing-bridge.js',
    'mobile.css',
    'activity-assignment.html',
    'activity-input-test.html',
    'activity-report.html',
    'withdraw.html',
    'delete-member.html',
    'modify.html',
    'newcategory.html',
    'activity-category-editor.html',
    'privacy-consent.html'
];


/** Deploy 대상 HTML: deploy-mode → app-mode → webview-android → admin-menu 순서 보장 */
function ensureDeployModeScripts(html) {
    let s = String(html || '');
    if (!s.includes('src="admin-menu.js"')) return s;
    s = s.replace(/\s*<script src="webview-android\.js"><\/script>\n?/g, '');
    s = s.replace(/\s*<script src="app-mode\.js"><\/script>\n?/g, '');
    s = s.replace(/\s*<script src="deploy-mode\.js"><\/script>\n?/g, '');
    return s.replace(
        /(<script src="admin-menu\.js"><\/script>)/,
        '<script src="deploy-mode.js"></script>\n    <script src="app-mode.js"></script>\n    <script src="webview-android.js"></script>\n    $1'
    );
}

const SKIP_IN_TARGET = new Set([
    'server.js',
    'package.json',
    '.env',
    '.env.example',
    'render.yaml',
    'DEPLOYMENT.md',
    'mobile/capacitor.config.json'
]);

function copyFile(src, dest) {
    const rel = path.relative(SOURCE, dest).replace(/\\/g, '/');
    for (const skip of SKIP_IN_TARGET) {
        if (rel.endsWith(skip) || rel === skip) return false;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return true;
}

function writeDeployModeJs(dir) {
    fs.mkdirSync(dir, { recursive: true });
    const src = path.join(SOURCE, 'deploy-mode.js');
    fs.copyFileSync(src, path.join(dir, 'deploy-mode.js'));
}

function patchHtmlForDeploy(dir) {
    if (!fs.existsSync(dir)) return 0;
    let n = 0;
    for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.html')) continue;
        const p = path.join(dir, name);
        const before = fs.readFileSync(p, 'utf8');
        const after = ensureDeployModeScripts(before);
        if (after !== before) {
            fs.writeFileSync(p, after, 'utf8');
            n += 1;
        }
    }
    return n;
}

function applyDeployModePackage(targetRoot) {
    writeDeployModeJs(targetRoot);
    let n = 1;
    n += patchHtmlForDeploy(targetRoot);
    const piregioDir = path.join(targetRoot, 'piregio');
    if (fs.existsSync(piregioDir)) {
        writeDeployModeJs(piregioDir);
        n += 1;
        n += patchHtmlForDeploy(piregioDir);
    }
    return n;
}

function syncRootFiles(targetRoot) {
    let count = 0;
    for (const rel of ROOT_SHARED_FILES) {
        if (rel === 'deploy-mode.js') continue; // applyDeployModePackage 가 기록
        const src = path.join(SOURCE, rel);
        if (!fs.existsSync(src)) continue;
        const dest = path.join(targetRoot, rel);
        if (copyFile(src, dest)) count += 1;
    }
    return count;
}

function syncPiregioSubtree(targetRoot) {
    const piregioSrc = path.join(SOURCE, 'piregio');
    let count = 0;
    for (const rel of PIREGIO_SHARED_FILES) {
        if (rel === 'deploy-mode.js') continue;
        const src = path.join(piregioSrc, rel);
        if (!fs.existsSync(src)) {
            const fallback = path.join(SOURCE, rel);
            if (!fs.existsSync(fallback)) continue;
            const dest = path.join(targetRoot, 'piregio', rel);
            if (copyFile(fallback, dest)) count += 1;
            continue;
        }
        const dest = path.join(targetRoot, 'piregio', rel);
        if (copyFile(src, dest)) count += 1;
    }
    return count;
}

function syncIndexHtml(targetRoot) {
    const src = path.join(SOURCE, 'index.html');
    const dest = path.join(targetRoot, 'index.html');
    if (fs.existsSync(src) && copyFile(src, dest)) {
        return 1;
    }
    return 0;
}

console.log('프론트엔드 동기화 시작 (server 설정 파일 제외)...');

for (const target of TARGETS) {
    if (!fs.existsSync(target)) {
        console.log(`⏭  ${target} 없음 — sync-deploy-folders.js 먼저 실행하세요.`);
        continue;
    }
    const label = path.basename(target);
    const isPiregioOnly = label === 'piregio';
    let total = 0;

    if (isPiregioOnly) {
        total += syncRootFiles(target);
    } else {
        total += syncRootFiles(target);
        total += syncPiregioSubtree(target);
        total += syncIndexHtml(target);
    }
    total += applyDeployModePackage(target);

    console.log(`✅ ${label}: ${total}개 파일 동기화(+deploy 모드 주입)`);
}

console.log('완료.');
console.log('');
console.log('참고: server.js / package.json / .env / render.yaml 은 각 배포 환경 설정을 유지합니다.');
console.log('전체 배포 폴더 재생성: node sync-deploy-folders.js');
