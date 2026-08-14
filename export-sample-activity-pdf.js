/**
 * 모의 회원(id 3~103) 성명·비번·활동내역 PDF 생성
 *
 * node export-sample-activity-pdf.js
 * node export-sample-activity-pdf.js 2025
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { Pool } = require('pg');

const ID_MIN = 3;
const ID_MAX = 103;
const YEAR = parseInt(process.argv[2], 10) || 2025;
const FONT_CANDIDATES = [
    'C:\\Windows\\Fonts\\malgun.ttf',
    'C:\\Windows\\Fonts\\malgunbd.ttf',
    'C:\\Windows\\Fonts\\NanumGothic.ttf'
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

function categoryLabel(categoryName) {
    const cat = String(categoryName || '').trim();
    if (!cat) return '';
    const parts = cat.split('-');
    return (parts.length > 1 ? parts.slice(1).join('-') : cat).trim();
}

function buildActivitySummary(records) {
    const counts = new Map();
    for (const row of records || []) {
        const label = categoryLabel(row.category_name);
        if (!label) continue;
        const n = Number(row.count);
        const add = Number.isFinite(n) && n > 0 ? n : 1;
        counts.set(label, (counts.get(label) || 0) + add);
    }
    if (!counts.size) return '-';
    return [...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
        .map(([label, n]) => (n > 1 ? `${label}(${n})` : label))
        .join(', ');
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
        console.error('한글 글꼴을 찾을 수 없습니다.');
        process.exitCode = 1;
        return;
    }

    const startDate = `${YEAR}-01-01`;
    const endDate = `${YEAR}-12-31`;

    const membersResult = await pool.query(
        `SELECT id, name, passno, phone_last4, resident_id_front6
         FROM member
         WHERE id BETWEEN $1 AND $2
         ORDER BY id`,
        [ID_MIN, ID_MAX]
    );

    let activityRows = [];
    try {
        const act = await pool.query(
            `SELECT ar.member_id,
                    ac.category_name,
                    ar.activity_date::text AS activity_date,
                    COALESCE(ar.count, 1) AS count
             FROM activity_records ar
             LEFT JOIN activity_categories ac ON ar.category_id = ac.id
             WHERE ar.member_id BETWEEN $1 AND $2
               AND ar.activity_date::date BETWEEN $3::date AND $4::date
             ORDER BY ar.member_id, ar.activity_date, ac.category_name`,
            [ID_MIN, ID_MAX, startDate, endDate]
        );
        activityRows = act.rows;
    } catch (err) {
        if (err.code === '42703') {
            const act = await pool.query(
                `SELECT ar.member_id,
                        ac.category_name,
                        ar.activity_date::text AS activity_date,
                        1 AS count
                 FROM activity_records ar
                 LEFT JOIN activity_categories ac ON ar.category_id = ac.id
                 WHERE ar.member_id BETWEEN $1 AND $2
                   AND ar.activity_date::date BETWEEN $3::date AND $4::date
                 ORDER BY ar.member_id, ar.activity_date, ac.category_name`,
                [ID_MIN, ID_MAX, startDate, endDate]
            );
            activityRows = act.rows;
        } else {
            throw err;
        }
    }

    await pool.end();

    const byMember = new Map();
    for (const row of activityRows) {
        if (!byMember.has(row.member_id)) byMember.set(row.member_id, []);
        byMember.get(row.member_id).push(row);
    }

    const members = membersResult.rows.map((row) => {
        const passno = String(row.passno || '').trim()
            || `${row.phone_last4 || ''}${row.resident_id_front6 || ''}`
            || '-';
        return {
            id: row.id,
            name: extractRealName(row.name) || row.name,
            password: passno,
            activity: buildActivitySummary(byMember.get(row.id) || [])
        };
    });

    if (!members.length) {
        console.error(`회원 ${ID_MIN}~${ID_MAX} 없음`);
        process.exitCode = 1;
        return;
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const outDir = path.join(__dirname, 'output');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `Regio_모의회원_성명비번활동_${ID_MIN}-${ID_MAX}_${YEAR}_${timestamp}.pdf`);

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);
    doc.registerFont('ko', fontPath);
    doc.font('ko');

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = 28;
    const usableW = pageW - margin * 2;
    const cols = [
        { key: 'id', title: '번호', w: 36 },
        { key: 'name', title: '성명', w: 70 },
        { key: 'password', title: '비번', w: 78 },
        { key: 'activity', title: '활동내역', w: usableW - 36 - 70 - 78 }
    ];

    function drawTitle() {
        doc.fontSize(14).fillColor('#222')
            .text(`Regio 모의 회원 성명·비번·활동내역 (${ID_MIN}~${ID_MAX})`, margin, margin, { width: usableW });
        doc.fontSize(9).fillColor('#555')
            .text(`${YEAR}년 (${startDate} ~ ${endDate}) · 총 ${members.length}명 · ${timestamp}`, margin, margin + 18, { width: usableW });
        return margin + 36;
    }

    function drawTableHeader(y) {
        doc.rect(margin, y, usableW, 18).fill('#4A90E2');
        doc.fillColor('#fff').fontSize(9);
        let x = margin;
        for (const col of cols) {
            doc.text(col.title, x + 3, y + 5, { width: col.w - 6, align: col.key === 'id' || col.key === 'password' ? 'center' : 'left' });
            x += col.w;
        }
        return y + 18;
    }

    function measureRowHeight(text, width) {
        doc.font('ko').fontSize(8);
        const h = doc.heightOfString(String(text || '-'), { width: width - 6 });
        return Math.max(16, Math.min(72, Math.ceil(h) + 8));
    }

    let y = drawTitle();
    y = drawTableHeader(y);

    for (let i = 0; i < members.length; i++) {
        const m = members[i];
        const rowH = measureRowHeight(m.activity, cols[3].w);

        if (y + rowH > pageH - margin) {
            doc.addPage();
            doc.font('ko');
            y = drawTitle();
            y = drawTableHeader(y);
        }

        if (i % 2 === 0) {
            doc.rect(margin, y, usableW, rowH).fill('#f5f8fc');
        }
        doc.strokeColor('#ddd').lineWidth(0.4)
            .rect(margin, y, usableW, rowH).stroke();

        doc.fillColor('#222').fontSize(8);
        let x = margin;
        const values = [String(m.id), m.name, m.password, m.activity];
        values.forEach((val, idx) => {
            const col = cols[idx];
            const align = idx === 0 || idx === 2 ? 'center' : 'left';
            doc.text(String(val || '-'), x + 3, y + 4, {
                width: col.w - 6,
                align,
                height: rowH - 6,
                ellipsis: true
            });
            x += col.w;
        });
        y += rowH;
    }

    doc.end();
    await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
    });

    const withAct = members.filter((m) => m.activity !== '-').length;
    console.log(`PDF 생성 완료: ${outPath}`);
    console.log(`회원 ${members.length}명 · 활동 있는 회원 ${withAct}명 · 기간 ${YEAR}년`);
})().catch((err) => {
    console.error('오류:', err.message);
    process.exitCode = 1;
});
