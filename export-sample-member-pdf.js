/**
 * 모의 회원(id 3~103) ID·직급·소속성당·Pr명칭·비번 PDF 생성
 *
 * node export-sample-member-pdf.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { Pool } = require('pg');

const ID_MIN = 3;
const ID_MAX = 103;
const POSITION_LABELS = {
    1: '단장',
    2: '부단장',
    3: '서기',
    4: '회계',
    5: '행동단원',
    6: '협조단원',
    7: '쁘레또리운',
    8: '아듀또리움'
};

const FONT_CANDIDATES = [
    'C:\\Windows\\Fonts\\malgun.ttf',
    'C:\\Windows\\Fonts\\malgunbd.ttf',
    'C:\\Windows\\Fonts\\NanumGothic.ttf',
    '/usr/share/fonts/truetype/nanum/NanumGothic.ttf'
];

function resolveFont() {
    for (const p of FONT_CANDIDATES) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

function extractRealName(memberName) {
    const trimmed = String(memberName || '').trim();
    const compound = trimmed.match(/^[TG]([1-6])([78])(.*)$/i);
    if (compound) return compound[3] || '';
    const simple = trimmed.match(/^[TG]([1-8])(.*)$/i);
    if (simple) return simple[2] || '';
    return trimmed;
}

function matchPositionPrefix(memberName) {
    const trimmed = String(memberName || '').trim();
    const compound = trimmed.match(/^[TG]([1-6])([78])/i);
    if (compound) {
        return {
            letter: compound[0][0].toUpperCase(),
            code: parseInt(compound[2], 10)
        };
    }
    const simple = trimmed.match(/^[TG]([1-8])/i);
    if (simple) {
        return {
            letter: simple[0][0].toUpperCase(),
            code: parseInt(simple[1], 10)
        };
    }
    return null;
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
    return null;
}

function formatRank(name, position) {
    const prefix = matchPositionPrefix(name);
    const fromPos = getPositionCodeFromText(position);
    const code = (prefix && prefix.code) || fromPos;
    if (!code) return String(position || '').trim() || '-';
    const letter = (prefix && prefix.letter) || 'G';
    const label = POSITION_LABELS[code] || String(position || '').trim() || '';
    return label ? `${letter}${code} ${label}` : `${letter}${code}`;
}

function buildLoginId(name, phoneLast4) {
    const phone4 = String(phoneLast4 || '').replace(/\D/g, '').slice(-4).padStart(4, '0');
    return `${extractRealName(name)}${phone4}`;
}

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: +(process.env.DB_PORT || 5432)
});

(async () => {
    const fontPath = resolveFont();
    if (!fontPath) {
        console.error('한글 글꼴을 찾을 수 없습니다. (맑은 고딕 등)');
        process.exitCode = 1;
        return;
    }

    const { rows } = await pool.query(
        `SELECT id, name, position, church_name, pr_name, phone_last4, passno
         FROM member
         WHERE id BETWEEN $1 AND $2
         ORDER BY id`,
        [ID_MIN, ID_MAX]
    );
    await pool.end();

    if (!rows.length) {
        console.error(`회원 ${ID_MIN}~${ID_MAX} 없음`);
        process.exitCode = 1;
        return;
    }

    const members = rows.map((row) => ({
        id: row.id,
        loginId: buildLoginId(row.name, row.phone_last4),
        rank: formatRank(row.name, row.position),
        church: String(row.church_name || '').trim() || '-',
        pr: String(row.pr_name || '').trim() || '-',
        password: String(row.passno || '').trim() || '-'
    }));

    const timestamp = new Date().toISOString().slice(0, 10);
    const outDir = path.join(__dirname, 'output');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `Regio_모의회원_ID직급성당Pr비번_${ID_MIN}-${ID_MAX}_${timestamp}.pdf`);

    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 32 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);
    doc.registerFont('ko', fontPath);
    doc.font('ko');

    const pageWidth = doc.page.width;
    const margin = 32;
    const usable = pageWidth - margin * 2;
    const cols = [
        { key: 'loginId', title: 'ID', w: 100 },
        { key: 'rank', title: '직급', w: 88 },
        { key: 'church', title: '소속성당', w: 120 },
        { key: 'pr', title: 'Pr명칭', w: 110 },
        { key: 'password', title: '비번', w: usable - 100 - 88 - 120 - 110 }
    ];

    function drawHeader() {
        doc.fontSize(15).fillColor('#222')
            .text(`Regio 모의 회원 명단 (${ID_MIN}~${ID_MAX})`, margin, margin, { width: usable });
        doc.fontSize(10).fillColor('#555')
            .text(`ID · 직급 · 소속성당 · Pr명칭 · 비번 · 총 ${members.length}명 · ${timestamp}`, margin, margin + 20, { width: usable });
        return margin + 40;
    }

    function drawTableHeader(y) {
        let x = margin;
        doc.rect(margin, y, usable, 20).fill('#4A90E2');
        doc.fillColor('#fff').fontSize(10);
        for (const col of cols) {
            const align = col.key === 'password' ? 'center' : 'left';
            doc.text(col.title, x + 3, y + 5, { width: col.w - 6, align });
            x += col.w;
        }
        return y + 20;
    }

    let y = drawHeader();
    y = drawTableHeader(y);
    const rowH = 16;
    doc.fillColor('#222').fontSize(8.5);

    for (let i = 0; i < members.length; i++) {
        if (y + rowH > doc.page.height - margin) {
            doc.addPage();
            doc.font('ko');
            y = drawHeader();
            y = drawTableHeader(y);
            doc.fillColor('#222').fontSize(8.5);
        }

        const m = members[i];
        if (i % 2 === 0) {
            doc.rect(margin, y, usable, rowH).fill('#f5f8fc');
            doc.fillColor('#222');
        }

        let x = margin;
        const values = [m.loginId, m.rank, m.church, m.pr, m.password];
        values.forEach((val, idx) => {
            const col = cols[idx];
            const align = idx === 4 ? 'center' : 'left';
            doc.text(String(val || '-'), x + 3, y + 4, { width: col.w - 6, align, lineBreak: false });
            x += col.w;
        });

        doc.strokeColor('#ddd').lineWidth(0.4)
            .moveTo(margin, y + rowH).lineTo(margin + usable, y + rowH).stroke();
        y += rowH;
    }

    doc.end();
    await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
    });

    console.log(`PDF 생성 완료: ${outPath}`);
    console.log(`회원 수: ${members.length}`);
})().catch((err) => {
    console.error('오류:', err.message);
    process.exitCode = 1;
});
