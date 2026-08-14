const fs = require('fs');
const path = require('path');

const files = [
    'index.html',
    'piregio/index.html',
    'regio/index.html',
    'piregio/regio/index.html',
    'activity-assignment.html',
    'piregio/activity-assignment.html',
    'profile-modal.js',
    'piregio/profile-modal.js',
    'admin-menu.js',
    'piregio/admin-menu.js'
];

const replacements = [
    [/data-tprefix="T([1-6])"/g, 'data-tprefix="G$1"'],
    [/<span class="pos-code">T([1-6])<\/span>/g, '<span class="pos-code">G$1</span>'],
    [/단장 <strong>T1<\/strong> · 부단장 <strong>T2<\/strong> · 서기 <strong>T3<\/strong> · 회계 <strong>T4<\/strong> · 행동단원 <strong>T5<\/strong> · 협조단원 <strong>T6<\/strong>/g,
        '단장 <strong>G1</strong> · 부단장 <strong>G2</strong> · 서기 <strong>G3</strong> · 회계 <strong>G4</strong> · 행동단원 <strong>G5</strong> · 협조단원 <strong>G6</strong>'],
    [/단장 T1 선택/g, '단장 G1 선택'],
    [/→ 로그인 ID <strong>T1/g, '→ 로그인 ID <strong>G1'],
    [/T1~T4/g, 'G1~G4'],
    [/T1~T7/g, 'G1~G7'],
    [/T2이동식/g, 'G2이동식'],
    [/T1최유나1234/g, 'G1최유나1234'],
    [/T1~G4/g, 'G1~G4'],
    [/\^\[1-6\]\(\?=T\[1-6\]\)/g, '^[1-6](?=[TG][1-6])'],
    [/\^T\[1-6\]/g, '^[TG][1-6]'],
    [/match\(\^T\(\[1-6\]\)/g, 'match(/^([TG])([1-6])'],
    [/name: `T\$\{tMatch\[1\]\}/g, 'name: `${tMatch[1].toUpperCase()}${tMatch[2]}`'],
    [/name: `T\$\{m\[1\]\}/g, 'name: `${m[1].toUpperCase()}${m[2]}`'],
    [/parseInt\(tMatch\[1\]/g, 'parseInt(tMatch[2]'],
    [/parseInt\(m\[1\]/g, 'parseInt(m[2]'],
    [/tMatch\[2\]\}/g, 'tMatch[3]}`'],
    [/tMatch\[3\]/g, 'tMatch[4]'],
    [/m\[2\]\}/g, 'm[3]}`'],
    [/T\$\{code\}/g, 'G${code}'],
    [/T\$\{regSelectedPositionTPrefix\}/g, '${regSelectedPositionTPrefix}'],
    [/T1·T2·T3/g, 'G1·G2·G3'],
    [/T1~T3/g, 'G1~G3'],
    [/T1~T4\(단장/g, 'G1~G4(단장'],
    [/T1~T4 회원/g, 'G1~G4 회원'],
    [/: `\^T\[1234\]/g, ': `/^[TG][1234]/'],
    [/\^T\[1234\]/g, '^[TG][1234]']
];

const root = path.join(__dirname);
for (const rel of files) {
    const filePath = path.join(root, rel);
    if (!fs.existsSync(filePath)) {
        console.log('skip missing', rel);
        continue;
    }
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    for (const [pattern, replacement] of replacements) {
        const next = content.replace(pattern, replacement);
        if (next !== content) {
            changed = true;
            content = next;
        }
    }
    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('updated', rel);
    }
}
