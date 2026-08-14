/**
 * regio(LOCALHOST) → HOSTregio / RENDERregio 배포 폴더 동기화
 * 실행: node sync-deploy-folders.js
 */
const fs = require('fs');
const path = require('path');

const SOURCE = __dirname;
const PUBLIC_ROOT = path.dirname(SOURCE);
const HOST_TARGET = path.join(PUBLIC_ROOT, 'HOSTregio');
const RENDER_TARGET = path.join(PUBLIC_ROOT, 'RENDERregio');

const SKIP_DIRS = new Set([
    'node_modules',
    '.git',
    'regioback',
    '.cursor',
    'HOSTregio',
    'RENDERregio'
]);

const SKIP_FILES = new Set([
    '.env',
    'sync-deploy-folders.js'
]);

function shouldSkip(relPath, isDir) {
    const parts = relPath.split(/[/\\]/).filter(Boolean);
    if (parts.some((part) => SKIP_DIRS.has(part))) return true;
    if (!isDir && SKIP_FILES.has(parts[parts.length - 1])) return true;
    return false;
}

function copyTree(src, dest) {
    if (shouldSkip(path.relative(SOURCE, src), fs.statSync(src).isDirectory())) {
        return;
    }

    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            copyTree(path.join(src, entry), path.join(dest, entry));
        }
        return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

function writeFile(targetRoot, relPath, content) {
    const filePath = path.join(targetRoot, relPath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
}

function patchServerJs(content, profile) {
    let next = content;

    if (!next.includes('const LISTEN_HOST')) {
        next = next.replace(
            'const PORT = process.env.PORT || 3000;',
            `const PORT = process.env.PORT || 3000;
const LISTEN_HOST = process.env.LISTEN_HOST || '0.0.0.0';
const RUNTIME_PROFILE = process.env.REGIO_RUNTIME || '${profile}';
const PUBLIC_BASE_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '';`
        );
    } else {
        next = next.replace(
            /const RUNTIME_PROFILE = process\.env\.REGIO_RUNTIME \|\| '[^']+';/,
            `const RUNTIME_PROFILE = process.env.REGIO_RUNTIME || '${profile}';`
        );
    }

    if (profile === 'render') {
        if (!next.includes("app.get('/health'")) {
            next = next.replace(
                '// 메인 페이지 서빙',
                `// Render 헬스체크
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ ok: true, profile: RUNTIME_PROFILE });
    } catch (error) {
        res.status(503).json({ ok: false, profile: RUNTIME_PROFILE, error: error.message });
    }
});

// 메인 페이지 서빙`
            );
        }

        next = next.replace(
            /const isProduction = process\.env\.NODE_ENV === 'production';/,
            "const isProduction = process.env.NODE_ENV === 'production' || RUNTIME_PROFILE === 'render';"
        );
    }

    next = next.replace(
        /app\.listen\(PORT, async \(\) => \{[\s\S]*?console\.log\(`🚀 서버가 http:\/\/localhost:\$\{PORT\} 에서 실행 중입니다\.`\);[\s\S]*?console\.log\('📁 새 카테고리 활동 추가: http:\/\/localhost:3000\/modify\.html'\);/,
        `app.listen(PORT, LISTEN_HOST, async () => {
    const localHint = PUBLIC_BASE_URL || \`http://\${LISTEN_HOST === '0.0.0.0' ? 'localhost' : LISTEN_HOST}:\${PORT}\`;
    console.log(\`🚀 [\${RUNTIME_PROFILE.toUpperCase()}] 서버 실행: \${localHint} (listen \${LISTEN_HOST}:\${PORT})\`);
    console.log('📁 메인 페이지: /');
    console.log('📁 활동종목 편집: /activity-category-editor.html');
    console.log('📁 새 카테고리 활동 추가: /modify.html');`
    );

    return next;
}

function patchPackageJson(content, profile) {
    const pkg = JSON.parse(content);
    pkg.scripts = pkg.scripts || {};
    pkg.scripts.start = 'node server.js';
    if (profile === 'render') {
        pkg.engines = { node: '>=18.0.0' };
        pkg.description = 'Regio - Render 배포용';
    } else {
        pkg.description = 'Regio - HOST 배포용';
    }
    return `${JSON.stringify(pkg, null, 2)}\n`;
}

const HOST_ENV_EXAMPLE = `# HOST 배포용 (.env 로 복사 후 값 입력)
REGIO_RUNTIME=host
NODE_ENV=production
PORT=3000
LISTEN_HOST=0.0.0.0
PUBLIC_URL=https://your-host-domain.example.com

# PostgreSQL (외부 DB 또는 Render Postgres 외부 접속 URL)
DB_HOST=your_db_host
DB_USER=regio_user
DB_PASSWORD=your_db_password
DB_NAME=regio
DB_PORT=5432
# DATABASE_URL=postgresql://regio_user:password@your_db_host:5432/regio

# Gmail / Google (선택)
GMAIL_USER=your@gmail.com
GMAIL_APP_PASSWORD=your_app_password
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
`;

const RENDER_ENV_EXAMPLE = `# Render Web Service Environment Variables
REGIO_RUNTIME=render
NODE_ENV=production
# PORT, DATABASE_URL, RENDER_EXTERNAL_URL 은 Render가 자동 주입

DATABASE_URL=postgresql://user:password@host/dbname
GMAIL_USER=your@gmail.com
GMAIL_APP_PASSWORD=your_app_password
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
`;

const RENDER_YAML = `services:
  - type: web
    name: regio-app
    runtime: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: REGIO_RUNTIME
        value: render
      - key: DATABASE_URL
        sync: false
      - key: GMAIL_USER
        sync: false
      - key: GMAIL_APP_PASSWORD
        sync: false
      - key: GOOGLE_CLIENT_ID
        sync: false

databases:
  - name: regio-db
    databaseName: regio
    user: regio_user
    plan: free
`;

const HOST_README = `# HOSTregio (HOST 배포)

\`d:\\\\public\\\\regio\` 는 **LOCALHOST 개발**용입니다.
이 폴더(\`HOSTregio\`)는 **자체 서버/VPS 등 HOST 환경** 배포용 사본입니다.

## 설정
1. \`npm install\`
2. \`.env.example\` → \`.env\` 복사 후 DB/Gmail/Google 값 입력
3. \`npm start\`

## 주요 환경변수
- \`REGIO_RUNTIME=host\`
- \`NODE_ENV=production\`
- \`LISTEN_HOST=0.0.0.0\`
- \`PUBLIC_URL\`: 실제 접속 URL

## 동기화
로컬 regio 수정 후:
\`\`\`bash
cd d:\\\\public\\\\regio
node sync-deploy-folders.js
\`\`\`
`;

const RENDER_README = `# RENDERregio (Render.com 배포)

\`d:\\\\public\\\\regio\` 는 **LOCALHOST 개발**용입니다.
이 폴더(\`RENDERregio\`)는 **Render.com** 배포용 사본입니다.

## Render 배포
1. Render Dashboard → New → Blueprint (\`render.yaml\`) 또는 Web Service
2. Root Directory: \`RENDERregio\` (또는 이 폴더를 Git repo root로 사용)
3. Build: \`npm install\` / Start: \`npm start\`
4. Environment: \`.env.example\` 참고 (DATABASE_URL 필수)

## 헬스체크
- \`GET /health\` → DB 연결 확인

## 동기화
\`\`\`bash
cd d:\\\\public\\\\regio
node sync-deploy-folders.js
\`\`\`
`;

const LOCALHOST_README_SNIPPET = `\n## 배포 폴더\n\n- **LOCALHOST (개발)**: \`d:\\\\public\\\\regio\` (현재 폴더)\n- **HOST 배포**: \`d:\\\\public\\\\HOSTregio\`\n- **Render 배포**: \`d:\\\\public\\\\RENDERregio\`\n\n동기화: \`node sync-deploy-folders.js\`\n`;

function applyProfilePatches(targetRoot, profile) {
    const serverPath = path.join(targetRoot, 'server.js');
    const pkgPath = path.join(targetRoot, 'package.json');

    if (fs.existsSync(serverPath)) {
        const serverSrc = fs.readFileSync(serverPath, 'utf8');
        fs.writeFileSync(serverPath, patchServerJs(serverSrc, profile), 'utf8');
    }

    if (fs.existsSync(pkgPath)) {
        const pkgSrc = fs.readFileSync(pkgPath, 'utf8');
        fs.writeFileSync(pkgPath, patchPackageJson(pkgSrc, profile), 'utf8');
    }

    if (profile === 'host') {
        writeFile(targetRoot, '.env.example', HOST_ENV_EXAMPLE);
        writeFile(targetRoot, 'DEPLOYMENT.md', HOST_README);
    } else {
        writeFile(targetRoot, '.env.example', RENDER_ENV_EXAMPLE);
        writeFile(targetRoot, 'render.yaml', RENDER_YAML);
        writeFile(targetRoot, 'DEPLOYMENT.md', RENDER_README);
    }
}

function syncTarget(targetRoot, profile) {
    if (fs.existsSync(targetRoot)) {
        fs.rmSync(targetRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(targetRoot, { recursive: true });
    copyTree(SOURCE, targetRoot);
    applyProfilePatches(targetRoot, profile);
    console.log(`✅ ${profile.toUpperCase()} → ${targetRoot}`);
}

console.log('Regio 배포 폴더 동기화 시작...');
console.log(`SOURCE: ${SOURCE}`);
syncTarget(HOST_TARGET, 'host');
syncTarget(RENDER_TARGET, 'render');

const localReadme = path.join(SOURCE, 'README.md');
if (fs.existsSync(localReadme)) {
    let readme = fs.readFileSync(localReadme, 'utf8');
    if (!readme.includes('## 배포 폴더')) {
        fs.writeFileSync(localReadme, readme.trimEnd() + LOCALHOST_README_SNIPPET, 'utf8');
        console.log('✅ README.md 배포 폴더 안내 추가');
    }
}

console.log('완료.');
