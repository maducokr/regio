/**
 * 활동종목·세목 PDF 출력
 * 사용: node export-activity-categories-pdf.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    })
    : new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'regio',
        password: process.env.DB_PASSWORD || '5854',
        port: parseInt(process.env.DB_PORT || '5432', 10)
    });

function findKoreanFont() {
    const candidates = [
        'C:\\Windows\\Fonts\\malgun.ttf',
        'C:\\Windows\\Fonts\\malgunbd.ttf',
        'C:\\Windows\\Fonts\\NanumGothic.ttf',
        'C:\\Windows\\Fonts\\gulim.ttc',
        '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
        '/System/Library/Fonts/AppleSDGothicNeo.ttc'
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
}

function splitItem(categoryName, group) {
    const full = String(categoryName || '').trim();
    const g = String(group || '').trim();
    if (g && full.startsWith(`${g}-`)) {
        return full.slice(g.length + 1).trim() || full;
    }
    const idx = full.indexOf('-');
    if (idx > 0) return full.slice(idx + 1).trim();
    return full;
}

async function main() {
    const fontPath = findKoreanFont();
    if (!fontPath) {
        console.error('한글 폰트를 찾지 못했습니다. Windows 맑은 고딕(malgun.ttf)이 필요합니다.');
        process.exitCode = 1;
        return;
    }

    const result = await pool.query(`
        SELECT category_group, category_name, description
        FROM activity_categories
        ORDER BY
            CASE category_group
                WHEN '기도생활' THEN 1
                WHEN '가정성화활동' THEN 2
                WHEN '지구와함께' THEN 3
                WHEN '복음선교' THEN 4
                WHEN '입교 권면' THEN 5
                WHEN '예비신자 돌봄' THEN 6
                WHEN '예비자 돌봄' THEN 6
                WHEN '교우돌봄' THEN 7
                WHEN '어려운자돌봄' THEN 8
                WHEN '레지오활동' THEN 9
                WHEN '본당교회협조' THEN 10
                WHEN '특별활동' THEN 11
                WHEN '자연보호' THEN 12
                WHEN '기타활동' THEN 13
                WHEN '자연보호및 기타활동' THEN 13
                WHEN '기타' THEN 13
                ELSE 99
            END,
            id
    `);

    const byGroup = new Map();
    for (const row of result.rows) {
        const group = String(row.category_group || '(미분류)').trim() || '(미분류)';
        if (!byGroup.has(group)) byGroup.set(group, []);
        byGroup.get(group).push({
            sub: splitItem(row.category_name, group),
            full: row.category_name,
            desc: row.description || ''
        });
    }

    const outDir = path.join(__dirname, 'exports');
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const outPath = path.join(outDir, `활동종목_세목_${stamp}.pdf`);

    const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        info: {
            Title: '레지오 활동종목·세목 목록',
            Author: 'regio'
        }
    });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);
    doc.font(fontPath);

    doc.fontSize(16).text('레지오 활동종목 · 세목 목록', { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor('#555')
        .text(`출력일시: ${new Date().toLocaleString('ko-KR')}  ·  총 ${result.rows.length}개 세목`, { align: 'center' });
    doc.fillColor('#000');
    doc.moveDown(1);

    let groupNo = 0;
    for (const [group, items] of byGroup) {
        groupNo += 1;
        if (doc.y > 740) doc.addPage();

        doc.fontSize(12).fillColor('#1e3a5f')
            .text(`${groupNo}. ${group}`, { continued: false });
        doc.fillColor('#000');
        doc.moveDown(0.25);

        doc.fontSize(10);
        items.forEach((item, i) => {
            if (doc.y > 770) doc.addPage();
            const line = `   ${i + 1}) ${item.sub}`;
            doc.text(line, { width: 515 });
        });
        doc.moveDown(0.6);
    }

    doc.end();
    await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
    });

    console.log(`✅ PDF 생성: ${outPath}`);
    console.log(`종목 그룹 ${byGroup.size}개 · 세목 ${result.rows.length}개`);
    await pool.end();

    // Windows에서 바로 열기
    if (process.platform === 'win32') {
        const { exec } = require('child_process');
        exec(`start "" "${outPath}"`);
    }
}

main().catch(async (err) => {
    console.error('❌', err.message);
    try { await pool.end(); } catch (_) { /* ignore */ }
    process.exitCode = 1;
});
