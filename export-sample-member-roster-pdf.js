/**
 * 모의 회원(id 3~103) 성명·성당·Pr·꾸리아 PDF 명부
 *
 * node export-sample-member-roster-pdf.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { Pool } = require('pg');

const ID_MIN = 3;
const ID_MAX = 103;

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
    const withCode = trimmed.match(/^[TG](?:10|[1-9])(.*)$/i);
    if (withCode) return withCode[1] || '';
    return trimmed;
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
        `SELECT id, name, church_name, pr_name, curia_name
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
        name: extractRealName(row.name) || String(row.name || '').trim() || '-',
        church: String(row.church_name || '').trim() || '-',
        pr: String(row.pr_name || '').trim() || '-',
        curia: String(row.curia_name || '').trim() || '-'
    }));

    const timestamp = new Date().toISOString().slice(0, 10);
    const outDir = path.join(__dirname, 'output');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(
        outDir,
        `Regio_모의명부_성명성당Pr꾸리아_${ID_MIN}-${ID_MAX}_${timestamp}.pdf`
    );

    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 32 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);
    doc.registerFont('ko', fontPath);
    doc.font('ko');

    const pageWidth = doc.page.width;
    const margin = 32;
    const usable = pageWidth - margin * 2;
    const cols = [
        { key: 'id', title: '번호', w: 42 },
        { key: 'name', title: '성명', w: 90 },
        { key: 'church', title: '성당이름', w: 130 },
        { key: 'pr', title: 'Pr이름', w: 120 },
        { key: 'curia', title: '꾸리아명칭', w: usable - 42 - 90 - 130 - 120 }
    ];

    function drawHeader() {
        doc.fontSize(15).fillColor('#222')
            .text(`Regio 모의 회원 명부 (${ID_MIN}~${ID_MAX})`, margin, margin, { width: usable });
        doc.fontSize(10).fillColor('#555')
            .text(`성명 · 성당이름 · Pr이름 · 꾸리아명칭 · 총 ${members.length}명 · ${timestamp}`, margin, margin + 20, { width: usable });
        return margin + 40;
    }

    function drawTableHeader(y) {
        let x = margin;
        doc.rect(margin, y, usable, 20).fill('#4A90E2');
        doc.fillColor('#fff').fontSize(10);
        for (const col of cols) {
            doc.text(col.title, x + 3, y + 5, { width: col.w - 6, align: 'left' });
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
        const values = [m.id, m.name, m.church, m.pr, m.curia];
        values.forEach((val, idx) => {
            const col = cols[idx];
            doc.text(String(val || '-'), x + 3, y + 4, { width: col.w - 6, align: 'left', lineBreak: false });
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
