const fs = require('fs');
const path = require('path');

const parseLoginStyleIdFn = `function parseLoginStyleId(loginId) {
            const trimmed = String(loginId || '').trim();
            const withoutLeadingCode = trimmed.replace(/^[1-6](?=[TG][1-6])/i, '');
            const match = withoutLeadingCode.match(/^([TG])([1-6])(.+?)(\\d{4})$/i);
            if (!match) return null;
            const code = parseInt(match[2], 10);
            const letter = match[1].toUpperCase();
            const labels = { 1: '단장', 2: '부단장', 3: '서기', 4: '회계', 5: '행동단원', 6: '협조단원' };
            return {
                positionCode: code,
                name: \`\${letter}\${match[2]}\${match[3]}\`,
                phone_last4: match[4],
                position: labels[code] || null
            };
        }`;

const parseLoginStyleIdForFindFn = `function parseLoginStyleIdForFind(loginId) {
            const full = parseLoginStyleId(loginId);
            if (full) {
                return { ...full, hasPhoneSuffix: true };
            }
            const trimmed = String(loginId || '').trim();
            const withoutLeadingCode = trimmed.replace(/^[1-6](?=[TG][1-6])/i, '');
            const m = withoutLeadingCode.match(/^([TG])([1-6])(.+)$/i);
            if (!m || !m[3]) {
                const plain = trimmed;
                if (plain && !/^[TG][1-6]/i.test(plain)) {
                    return {
                        name: plain,
                        positionCode: null,
                        phone_last4: null,
                        position: null,
                        hasPhoneSuffix: false,
                        isLegacyName: true
                    };
                }
                return null;
            }
            const code = parseInt(m[2], 10);
            const letter = m[1].toUpperCase();
            const labels = { 1: '단장', 2: '부단장', 3: '서기', 4: '회계', 5: '행동단원', 6: '협조단원' };
            return {
                positionCode: code,
                name: \`\${letter}\${m[2]}\${m[3]}\`,
                phone_last4: null,
                position: labels[code] || null,
                hasPhoneSuffix: false
            };
        }`;

const profileParseLoginStyleIdFn = `function parseLoginStyleId(loginId) {
        const trimmed = String(loginId || '').trim();
        const withoutLeadingCode = trimmed.replace(/^[1-6](?=[TG][1-6])/i, '');
        const match = withoutLeadingCode.match(/^([TG])([1-6])(.+?)(\\d{4})$/i);
        if (!match) return null;
        const code = parseInt(match[2], 10);
        const letter = match[1].toUpperCase();
        return {
            positionCode: code,
            name: \`\${letter}\${match[2]}\${match[3]}\`,
            phone_last4: match[4],
            position: POSITION_LABELS[code] || null
        };
    }`;

const memberToRegFieldsFn = `function memberToRegFields(user) {
        const name = String(user.name || '');
        const phone4 = String(user.phone_last4 || '').replace(/\\D/g, '').slice(-4);
        const prefixMatch = name.match(/^([TG])([1-6])(.+)$/i);
        if (prefixMatch) {
            const code = prefixMatch[2];
            const pos = POSITION_ITEMS.find((p) => p.code === code);
            const idBody = phone4 ? \`\${prefixMatch[3]}\${phone4}\` : prefixMatch[3];
            return {
                isLegacy: false,
                positionCode: code,
                label: pos ? pos.label : '',
                tprefix: pos ? pos.tprefix : \`\${prefixMatch[1].toUpperCase()}\${code}\`,
                idBody
            };
        }
        return {
            isLegacy: true,
            idBody: name
        };
    }`;

const htmlFiles = [
    'index.html',
    'piregio/index.html',
    'regio/index.html',
    'piregio/regio/index.html'
];

for (const rel of htmlFiles) {
    const filePath = path.join(__dirname, rel);
    if (!fs.existsSync(filePath)) continue;
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/function parseLoginStyleId\(loginId\) \{[\s\S]*?\n        \}/, parseLoginStyleIdFn);
    content = content.replace(/function parseLoginStyleIdForFind\(loginId\) \{[\s\S]*?\n        \}/, parseLoginStyleIdForFindFn);
    content = content.replace(/\(T는 자동 적용\)/g, '(G는 자동 적용)');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('fixed parse functions in', rel);
}

for (const rel of ['profile-modal.js', 'piregio/profile-modal.js']) {
    const filePath = path.join(__dirname, rel);
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/function parseLoginStyleId\(loginId\) \{[\s\S]*?\n    \}/, profileParseLoginStyleIdFn);
    content = content.replace(/function memberToRegFields\(user\) \{[\s\S]*?\n    \}/, memberToRegFieldsFn);
    content = content.replace(/tprefix: 'T/g, "tprefix: 'G");
    content = content.replace(/\(T는 자동 적용\)/g, '(G는 자동 적용)');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('fixed', rel);
}

// activity-assignment canAssignActivity
for (const rel of ['activity-assignment.html', 'piregio/activity-assignment.html']) {
    const filePath = path.join(__dirname, rel);
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(
        /function canAssignActivity\(name\) \{[\s\S]*?\n        \}/,
        `function canAssignActivity(name) {
            return /^[TG][1234]/i.test(name || '');
        }`
    );
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('fixed', rel);
}

// sync admin-menu piregio from root
fs.copyFileSync(path.join(__dirname, 'admin-menu.js'), path.join(__dirname, 'piregio/admin-menu.js'));
console.log('synced piregio/admin-menu.js');
