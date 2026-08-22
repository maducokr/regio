const fs = require('fs');
const path = require('path');

let cachedLabelsSource = null;

function getActivityFieldLabelsSource() {
    if (!cachedLabelsSource) {
        cachedLabelsSource = fs.readFileSync(
            path.join(__dirname, '..', 'activity-field-labels.js'),
            'utf8'
        ).trim();
    }
    return cachedLabelsSource;
}

const PATCHED_GET_FIELD_DISPLAY_NAME = `function getFieldDisplayName(categoryName, fieldName) {
            if (window.RegioActivityFieldLabels && typeof fieldMapping !== 'undefined') {
                return RegioActivityFieldLabels.getFieldDisplayName(categoryName, fieldName, fieldMapping);
            }
            if (typeof fieldMapping !== 'undefined' && fieldMapping[categoryName]) {
                const normalize = window.RegioActivityFieldLabels
                    ? (key) => RegioActivityFieldLabels.normalizeFieldName(key)
                    : (key) => key;
                const englishField = normalize(fieldName);
                const found = fieldMapping[categoryName].find((m) => {
                    const key = String(m.field_name || '').trim();
                    return normalize(key) === englishField || key === fieldName;
                });
                if (found && found.field_display_name && /[가-힣]/.test(found.field_display_name)) {
                    return found.field_display_name;
                }
            }
            const categoryLabels = {
                '교우돌봄-교우 상가 방문 및 돌봄': {
                    year_count: '연도',
                    funeral_mass: '장례미사(고별식)',
                    funeral_attendance: '기타 상가 활동',
                    count: '횟수(회,단,시간,명)'
                },
                '교우돌봄-교우 환자 방문 및 돌봄': {
                    year_count: '연도',
                    funeral_mass: '장례미사(고별식)',
                    funeral_attendance: '기타 상가 활동',
                    count: '횟수(회,단,시간,명)'
                }
            };
            if (categoryLabels[categoryName] && categoryLabels[categoryName][fieldName]) {
                return categoryLabels[categoryName][fieldName];
            }
            const defaultLabels = {
                count: '횟수(회,단,시간,명)',
                catechism_guide: '교리반인도',
                group_join: '단체가입',
                meeting_head: '회두',
                resolution: '해소',
                sacrament: '성사',
                confirmation: '견진',
                baptism: '세례',
                first_communion: '첫영성체',
                year_count: '연도',
                funeral_mass: '장례미사',
                memorial_mass: '추모미사',
                funeral_attendance: '장지참석',
                inout_count: '입출관',
                conditional_baptism: '대세',
                conditional_communion: '보례',
                membership: '입단',
                establishment: '설립',
                target: '대상'
            };
            return defaultLabels[fieldName] || fieldName;
        }`;

const OLD_GET_FIELD_PATTERNS = [
    /function getFieldDisplayName\(categoryName, fieldName\) \{\s*if \(fieldMapping\[categoryName\]\) \{[\s\S]*?return fieldName;\s*\}/,
    /function getFieldDisplayName\(categoryName, fieldName\) \{\s*if \(window\.RegioActivityFieldLabels\) \{[\s\S]*?return INLINE_ACTIVITY_FIELD_LABELS\[fieldName\] \|\| fieldName;\s*\}/
];

function injectFieldLabelsModule(html) {
    if (html.includes('activity-field-labels.js')) {
        return html;
    }
    const tag = '<script src="activity-field-labels.js?v=20260823a"></script>';
    return html.replace(
        /<script src="date-wheel-picker\.js"><\/script>/,
        `${tag}\n    <script src="date-wheel-picker.js"></script>`
    );
}

function patchGetFieldDisplayName(html) {
    if (html.includes('categoryLabels[categoryName]')) {
        return html;
    }
    for (const pattern of OLD_GET_FIELD_PATTERNS) {
        if (pattern.test(html)) {
            return html.replace(pattern, PATCHED_GET_FIELD_DISPLAY_NAME);
        }
    }
    return html;
}

/** injectLoadReportHook가 exportSummaryToHangul() 템플릿 안에 잘못 넣은 hook 제거 */
function repairHookInjectedInExportTemplate(html) {
    const hookScriptPattern = /\s*<script>\s*\(function \(\) \{\s*if \(window\.__regioFieldMappingHook\)[\s\S]*?window\.__regioFieldMappingHook = true;[\s\S]*?\}\)\(\);\s*<\/script>\s*(?=<\/body>\s*<\/html>`;)/;
    return html.replace(hookScriptPattern, '\n');
}

function injectLoadReportHook(html) {
    html = repairHookInjectedInExportTemplate(html);
    if (html.includes('__regioFieldMappingHook')) {
        return html;
    }
    const hook = `<script>
    (function () {
        if (window.__regioFieldMappingHook) return;
        window.__regioFieldMappingHook = true;
        const wrap = () => {
            if (typeof loadReport !== 'function') return;
            const original = loadReport;
            loadReport = async function () {
                if (window.RegioActivityFieldLabels && typeof fieldMapping !== 'undefined') {
                    try {
                        await RegioActivityFieldLabels.loadFieldMappingByCategory(fieldMapping);
                    } catch (e) {
                        console.warn('필드 매핑 로드 실패:', e);
                    }
                }
                return original.apply(this, arguments);
            };
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', wrap);
        } else {
            wrap();
        }
    })();
    <\/script>`;
    const lastBody = html.lastIndexOf('</body>');
    if (lastBody < 0) {
        return html;
    }
    return html.slice(0, lastBody) + hook + '\n' + html.slice(lastBody);
}

function patchActivityReportHtml(html) {
    let next = html;
    next = injectFieldLabelsModule(next);
    next = patchGetFieldDisplayName(next);
    next = injectLoadReportHook(next);
    return next;
}

/** 서버 기동 시 정적 HTML/JS 파일 패치 (express.static 대응) */
function applyStartupActivityReportPatch(rootDir) {
    const base = rootDir || path.join(__dirname, '..');
    try {
        const reportPath = path.join(base, 'activity-report.html');
        if (fs.existsSync(reportPath)) {
            const raw = fs.readFileSync(reportPath, 'utf8');
            const patched = patchActivityReportHtml(raw);
            if (patched !== raw) {
                fs.writeFileSync(reportPath, patched, 'utf8');
                console.log('✅ activity-report.html 한글 필드명 패치 적용');
            }
        }
        const labelsPath = path.join(base, 'activity-field-labels.js');
        const labelsSource = getActivityFieldLabelsSource();
        if (!fs.existsSync(labelsPath) || fs.readFileSync(labelsPath, 'utf8').trim() !== labelsSource) {
            fs.writeFileSync(labelsPath, labelsSource, 'utf8');
            console.log('✅ activity-field-labels.js 동기화');
        }
    } catch (err) {
        console.warn('activity-report 시작 패치 실패:', err.message);
    }
}

module.exports = {
    patchActivityReportHtml,
    getActivityFieldLabelsSource,
    applyStartupActivityReportPatch
};
