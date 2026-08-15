/**
 * 꾸리아 종합보고서 양식
 * activity-report.html?scope=curia 조회 시 활동요약 바로 위에 표시
 */
(function (global) {
    'use strict';

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function cell(value) {
        if (value === null || value === undefined || value === '') return '';
        return escapeHtml(value);
    }

    function blank(value, cls) {
        const c = cls ? ` blank ${cls}` : ' blank';
        return `<span class="${c.trim()}">${cell(value)}</span>`;
    }

    function n(value) {
        if (value === null || value === undefined || value === '') return '';
        const num = Number(value);
        if (Number.isNaN(num)) return cell(value);
        return String(num);
    }

    function parseYmd(dateStr) {
        const m = String(dateStr || '').match(/(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return null;
        return {
            y: m[1],
            m: String(Number(m[2])),
            d: String(Number(m[3])),
            year: parseInt(m[1], 10),
            month: parseInt(m[2], 10),
            day: parseInt(m[3], 10)
        };
    }

    function officerByRole(officers, role) {
        const list = Array.isArray(officers) ? officers : [];
        return list.find((o) => String(o.role || '') === role) || {};
    }

    function ensureStyles() {
        if (document.getElementById('curia-comprehensive-report-styles')) return;
        const style = document.createElement('style');
        style.id = 'curia-comprehensive-report-styles';
        style.textContent = `
            .curia-comp-form {
                border: 1px solid #333;
                padding: 18px 16px 22px;
                background: #fff;
                color: #111;
                font-size: 12px;
                line-height: 1.45;
            }
            .curia-comp-form .form-title {
                text-align: center;
                font-size: 12px;
                font-weight: 700;
                margin: 0 0 16px;
                text-decoration: underline;
                text-underline-offset: 4px;
            }
            .curia-comp-form .info-list {
                margin: 0 0 14px;
                padding-left: 1.2em;
            }
            .curia-comp-form .info-list li {
                margin: 0 0 6px;
            }
            .curia-comp-form .blank {
                display: inline-block;
                min-width: 2.2em;
                border-bottom: 1px solid #333;
                text-align: center;
                padding: 0 4px;
                min-height: 1.1em;
            }
            .curia-comp-form .blank.w3 { min-width: 2.4em; }
            .curia-comp-form .blank.w4 { min-width: 3.5em; }
            .curia-comp-form .blank.w6 { min-width: 5em; }
            .curia-comp-form .blank.w10 { min-width: 8em; }
            .curia-comp-form .blank.w20 { min-width: 14em; }
            .curia-comp-form .sec-title {
                font-weight: 700;
                margin: 14px 0 6px;
            }
            .curia-comp-form .sub-title {
                font-weight: 700;
                margin: 10px 0 6px;
            }
            .curia-comp-form .ops-block {
                margin: 0 0 10px;
            }
            .curia-comp-form .ops-list {
                margin: 0 0 8px;
                padding-left: 1.2em;
            }
            .curia-comp-form .ops-list li {
                margin: 0 0 4px;
            }
            .curia-comp-form td.left {
                text-align: left;
                padding-left: 8px;
            }
            .curia-comp-form table.form-table.edu-table th,
            .curia-comp-form table.form-table.edu-table td {
                font-size: 11px;
                padding: 4px 3px;
            }
            .curia-comp-form table.form-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 11px;
            }
            .curia-comp-form table.form-table th,
            .curia-comp-form table.form-table td {
                border: 1px solid #333;
                padding: 5px 4px;
                text-align: center;
                vertical-align: middle;
            }
            .curia-comp-form table.form-table th {
                background: #f3f4f6;
                font-weight: 600;
            }
            .curia-comp-form table.form-table td.left {
                text-align: left;
            }
            .curia-comp-form .line-box {
                border: 1px solid #333;
                min-height: 56px;
                padding: 8px 10px;
                white-space: pre-wrap;
                word-break: break-word;
            }
            .curia-comp-form .note {
                margin-top: 10px;
                font-size: 11px;
                color: #666;
            }
            .curia-comp-form table.act-matters-table th,
            .curia-comp-form table.act-matters-table td {
                font-size: 10.5px;
                padding: 3px 4px;
            }
            .curia-comp-form table.act-matters-table .col-cat { width: 12%; text-align: center; vertical-align: top; }
            .curia-comp-form table.act-matters-table .col-sub { width: 22%; text-align: center; }
            .curia-comp-form table.act-matters-table .col-cnt { width: 10%; text-align: center; }
            .curia-comp-form table.act-matters-table .col-note { width: 28%; text-align: center; font-size: 10px; white-space: pre-wrap; word-break: break-word; }
            .curia-comp-form table.act-matters-table .col-rmk { width: 28%; text-align: center; font-size: 10px; }
            .curia-comp-form table.act-matters-table .rmk-line { margin: 1px 0; text-align: center; }
            .curia-comp-form .act-matters-group + .act-matters-group { margin-top: 0; }
            .curia-comp-form .act-matters-group + .act-matters-group table.act-matters-table thead { display: none; }
            .curia-comp-form .act-matters-group + .act-matters-group table.act-matters-table { border-top: none; }
            .curia-comp-form table.prayer-life-table th,
            .curia-comp-form table.prayer-life-table td {
                font-size: 11px;
                padding: 6px 8px;
                text-align: center;
                vertical-align: middle;
            }
            .curia-comp-form table.prayer-life-table .prayer-cat {
                width: 12%;
                font-weight: 700;
                writing-mode: horizontal-tb;
            }
            .curia-comp-form table.prayer-life-table .prayer-cell {
                width: 29.3%;
                white-space: nowrap;
            }
            .curia-comp-form table.prayer-life-table .prayer-cell.span2 {
                width: 58.6%;
            }
            .curia-comp-form table.eval-table th,
            .curia-comp-form table.eval-table td {
                font-size: 10px;
                padding: 3px 2px;
                text-align: center;
            }
            .curia-comp-form table.eval-table .eval-cat,
            .curia-comp-form table.eval-table .eval-item {
                text-align: center;
            }
            .curia-comp-form table.eval-table .eval-hint {
                color: #666;
                font-size: 9px;
            }
            .curia-comp-form .special-hint {
                color: #2563eb;
                font-size: 11px;
                margin-bottom: 6px;
                line-height: 1.5;
            }
            .curia-comp-form table.roster-table th,
            .curia-comp-form table.roster-table td {
                font-size: 10.5px;
                padding: 4px 3px;
                text-align: center;
            }
            .curia-comp-form table.roster-table .pr-name {
                text-align: center;
                font-weight: 600;
            }
            @media (max-width: 700px) {
                .curia-comp-form { font-size: 11px; padding: 12px 10px; }
                .curia-comp-form .form-title { font-size: 12px; }
                .curia-comp-form table.form-table { font-size: 10px; }
            }
        `;
        document.head.appendChild(style);
    }

    /** 10. 활동 사항 — 앞쪽(1~4종목) */
    const ACTIVITY_MATTERS_PART1 = [
        {
            title: '1. 복음선교',
            rows: [
                { label: '1. 외인권면', categories: ['복음선교-외인 입교권면'], remarks: [{ label: '교리반인도', field: 'catechism_guide', unit: '명' }] },
                { label: '2. 교리중단자권면', categories: ['복음선교-교리 중단자 권면'], remarks: [{ label: '교리반인도', field: 'catechism_guide', unit: '명' }] },
                { label: '3. 방문선교', categories: ['복음선교-방문선교'], remarks: [{ label: '교리반인도', field: 'catechism_guide', unit: '명' }] },
                { label: '4. 가두선교', categories: ['복음선교-가두선교'], remarks: [{ label: '자기소개서', field: 'catechism_guide', unit: '건' }] },
                { label: '5. 직접인도한예비신자(교리반인도)', categories: ['예비자 돌봄-교리반 인도', '복음선교-교리반 인도', '복음선교-교리반인도예비자'], remarks: [{ label: '세례자', field: 'baptism', unit: '명' }] },
                { label: '6. 타인이인도한예비신자', categories: ['예비자 돌봄-타인이인도한예비신자', '복음선교-예비신자관리돌봄'], remarks: [{ label: '세례자', field: 'baptism', unit: '명' }] },
                { label: '7. 통신교리자', categories: ['예비자 돌봄-통신교리자', '복음선교-통신교리자 돌봄'], remarks: [{ label: '세례자', field: 'baptism', unit: '명' }] },
                { label: '8. 교리반협조', categories: ['복음선교-교리반협조'], remarks: [] }
            ]
        },
        {
            title: '2. 교우돌봄',
            rows: [
                { label: '1. 신영세자방문', categories: ['교우돌봄-신영세자돌봄(방문)'], remarks: [{ label: '단체가입', field: 'group_join', unit: '명' }] },
                { label: '2. 교우가정방문', categories: ['교우돌봄-교우 가정방문'], remarks: [{ label: '단체가입', field: 'group_join', unit: '명' }] },
                { label: '3. 냉담교우방문', categories: ['교우돌봄-냉담 교우 방문', '교우돌봄-냉담교우회두 권면'], remarks: [{ label: '회두', field: 'meeting_head', unit: '명' }] },
                { label: '4. 혼인장애자방문', categories: ['교우돌봄-혼인 장애자 돌봄'], remarks: [{ label: '해소', field: 'resolution', unit: '명' }] },
                { label: '5. 판공성사권면', categories: ['교우돌봄-판공성사 권면'], remarks: [{ label: '성사', field: 'sacrament', unit: '명' }] },
                { label: '6. 전입교우방문', categories: ['교우돌봄-전입교우돌봄(방문)'], remarks: [{ label: '단체가입', field: 'group_join', unit: '명' }] },
                { label: '7. 견진성사권면', categories: ['교우돌봄-견진성사권면'], remarks: [{ label: '견진', field: 'confirmation', unit: '명' }] },
                { label: '8. 유아세례권면', categories: ['교우돌봄-유아 세례 권면'], remarks: [{ label: '유아세례', field: 'baptism', unit: '명' }] },
                { label: '9. 다문화가족돌봄', categories: ['어려운자돌봄-다문화가족돌봄'], remarks: [] },
                { label: '10. 군인, 선원돌봄', categories: ['교우돌봄-군인선원돌봄'], remarks: [] },
                { label: '11. 청소년돌봄', categories: ['교우돌봄-청소년 돌봄'], remarks: [] }
            ]
        },
        {
            title: '3. 어려움을 겪는자 돌봄',
            rows: [
                {
                    label: '1. 교우상가방문및돌봄',
                    categories: ['어려운자돌봄-교우 상가 방문 및 돌봄'],
                    remarks: [
                        { label: '연도', field: 'year_count', unit: '회' },
                        { label: '미사참례', fields: ['funeral_mass', 'memorial_mass'], unit: '회' },
                        { label: '장지수행', field: 'funeral_attendance', unit: '회' }
                    ]
                },
                {
                    label: '2. 교우환자방문및돌봄',
                    categories: ['어려운자돌봄-교우 환자 방문 및 돌봄'],
                    remarks: [
                        { label: '병자성사', field: 'sacrament', unit: '명' },
                        { label: '병자영성체', field: 'first_communion', unit: '명' }
                    ]
                },
                {
                    label: '3. 외인환자방문및돌봄',
                    categories: ['어려운자돌봄-외인환자 방문 및 돌봄'],
                    remarks: [
                        { label: '대세자', field: 'conditional_baptism', unit: '명' },
                        { label: '보례자', field: 'conditional_communion', unit: '명' }
                    ]
                },
                { label: '4. 재난및어려움을겪는자돌봄', categories: ['어려운자돌봄-재해 및 사고 피해자', '특별활동-재해피해자돌봄', '특별활동-사고피해자돌봄'], remarks: [] },
                { label: '5. 병원방문', categories: ['어려운자돌봄-병원봉사', '특별활동-병원방문'], remarks: [] },
                { label: '6. 복지시설방문', categories: ['어려운자돌봄-복지시설방문', '특별활동-복지시설노력봉사'], remarks: [] },
                { label: '7. 외인상가방문및돌봄', categories: ['어려운자돌봄-외인 상가방문 및 돌봄'], remarks: [] },
                { label: '8. 대세자방문', categories: ['어려운자돌봄-대세자돌봄'], remarks: [{ label: '교리반인도', field: 'catechism_guide', unit: '명' }] }
            ]
        },
        {
            title: '4. 레지오 확장',
            rows: [
                { label: '1. 소년쁘레시디움지도', categories: ['레지오활동-소년 레지오 지도'], remarks: [] },
                { label: '2. 행동단원모집', categories: ['레지오활동-행동단원 모집'], remarks: [{ label: '입단', field: 'membership', unit: '명' }] },
                { label: '3. 협조단원모집', categories: ['레지오활동-협조단원 모집. 돌봄', '레지오활동-협조단원 모집및  돌봄'], remarks: [{ label: '입단', field: 'membership', unit: '명' }] },
                { label: '4. 쁘레시디움설립권면', categories: ['레지오활동-Pr설립권면'], remarks: [{ label: '설립', field: 'establishment', unit: 'Pr.' }] },
                { label: '5. 결석단원방문', categories: ['레지오활동-결석단원돌봄'], remarks: [] },
                { label: '6. 교본공부', categories: ['레지오활동-교본공부'], remarks: [] },
                { label: '7. 업무협조', categories: ['레지오활동-평의회업무협조'], remarks: [] }
            ]
        }
    ];

    /** 10. 활동 사항 — 뒷쪽(5~6종목) */
    const ACTIVITY_MATTERS_PART2 = [
        {
            title: '5. 본당협조',
            rows: [
                { label: '1. 호구방문', categories: ['본당교회협조-호구방문'], remarks: [] },
                { label: '2. 행사준비 및 협조', categories: ['본당교회협조-행사 준비 및 협조'], remarks: [] },
                { label: '3. 주일학교 돌봄', categories: ['본당교회협조-주일학교 돌봄'], remarks: [] },
                {
                    label: '4. 소공동체 활동',
                    categories: [
                        '본당교회협조-소공동체모임참석',
                        '본당교회협조-반모임 참석권유',
                        '본당교회협조-반모임참석',
                        '본당교회협조-구역반장교육및모임참석',
                        '본당교회협조-직장공동체활동',
                        '본당교회협조-구역반장교육참석'
                    ],
                    remarks: []
                },
                { label: '5. 사무협조', categories: ['본당교회협조-사무협조'], remarks: [] },
                { label: '6. 회원모집(출석독려)', categories: ['본당교회협조-회원모집'], remarks: [] },
                { label: '7. 본당에서의 사도직활동', categories: ['본당교회협조-본당사도직활동'], remarks: [] },
                { label: '8. 전례협조', categories: ['본당교회협조-전례협조'], remarks: [] },
                { label: '9. 보미사', categories: ['본당교회협조-보미사', '본당교회협조-미사안내봉사'], remarks: [] },
                { label: '10. 제구돌보기', categories: ['본당교회협조-제구돌보기'], remarks: [] },
                {
                    label: '11. 피정참가권장',
                    categories: ['본당교회협조-피정참가권장'],
                    remarks: [
                        { label: '교육참가', field: 'establishment', unit: '명' },
                        { label: '피정참가', field: 'membership', unit: '명' }
                    ]
                }
            ]
        },
        {
            title: '6. 기타',
            rows: [
                { label: '1. 청소미화', categories: ['기타활동-청소 미화', '본당교회협조-청소및미화'], remarks: [] },
                { label: '2. 출판물보급', categories: ['기타활동-출판물 보급'], remarks: [] },
                { label: '3. 자연보호', categories: ['자연보호-자연보호활동', '자연보호-생태 환경보호 활동', '자연보호-환경정화'], remarks: [] },
                { label: '4. 선교회협조', categories: ['기타활동-선교회협조', '기타활동-기타사목활동'], remarks: [] },
                { label: '5. 특별활동', categories: ['기타활동-특별활동'], remarks: [] },
                { label: '6. 차량봉사 및 교통정리', categories: ['기타활동-차량봉사및교통정리'], remarks: [] },
                { label: '7. 기타', categories: ['기타활동-기타', '기타활동-기타교구행사참석', '본당교회협조-기타본당협조'], remarks: [] }
            ]
        }
    ];

    function sumRecordField(record, fieldOrFields) {
        const fields = Array.isArray(fieldOrFields) ? fieldOrFields : [fieldOrFields];
        return fields.reduce((sum, f) => sum + (Number(record[f]) || 0), 0);
    }

    /**
     * 활동종목(접두)은 세목 분류용일 뿐, 활동횟수 집계와 무관하다.
     * 집계 키는 세목(category_name의 첫 '-' 이후)만 사용한다.
     */
    function getCategorySemok(categoryName) {
        const name = String(categoryName || '').trim();
        // 기도생활-기타 ↔ 기타활동-기타 세목 키 충돌 방지
        if (name === '기도생활-기타') return '기타1';
        const idx = name.indexOf('-');
        return idx >= 0 ? name.slice(idx + 1).trim() : name;
    }

    function normalizeSemokKey(semok) {
        return String(semok || '').replace(/\s+/g, '').toLowerCase();
    }

    /** categories 목록에서 세목 집합 추출 (종목 접두는 무시) */
    function semokKeysFromCategories(categories) {
        return new Set(
            (categories || []).map((c) => normalizeSemokKey(getCategorySemok(c))).filter(Boolean)
        );
    }

    function recordMatchesSemoks(record, allowedSemoks) {
        if (!allowedSemoks || !allowedSemoks.size) return false;
        const semokKey = normalizeSemokKey(getCategorySemok(record?.category_name));
        return allowedSemoks.has(semokKey);
    }

    function extractContentNote(note) {
        const text = String(note || '').trim();
        if (!text) return '';
        if (/^\d+\.\s*/.test(text) || /제목:|주관:|일자:/.test(text)) return '';
        const memo = text.match(/\[메모\]\s*([\s\S]*?)(?=\n\s*\[(?:주요활동내역|질의|건의|질의및건의)\]|\s*$)/i);
        if (memo) return (memo[1] || '').trim();
        if (/\[(?:주요활동내역|질의|건의|질의및건의)\]/i.test(text)) return '';
        return text;
    }

    /** 활동횟수: 세목만으로 합산 (활동종목 접두 무시) */
    function aggregateActivityMattersRow(records, rowDef) {
        const allowedSemoks = semokKeysFromCategories(rowDef.categories);
        let count = 0;
        const remarkTotals = (rowDef.remarks || []).map(() => 0);
        const contents = [];
        (records || []).forEach((rec) => {
            if (!recordMatchesSemoks(rec, allowedSemoks)) return;
            count += Number(rec.count) || 0;
            (rowDef.remarks || []).forEach((rmk, idx) => {
                remarkTotals[idx] += sumRecordField(rec, rmk.fields || rmk.field);
            });
            const note = extractContentNote(rec.note);
            if (note) contents.push(note);
        });
        return {
            count,
            remarks: (rowDef.remarks || []).map((rmk, idx) => ({
                label: rmk.label,
                unit: rmk.unit || '',
                value: remarkTotals[idx]
            })),
            content: [...new Set(contents)].slice(0, 3).join('\n')
        };
    }

    function formatRmkBlank(value, unit) {
        const shown = value > 0 ? String(value) : '';
        return `${blank(shown, 'w4')} ${escapeHtml(unit || '')}`;
    }

    function buildActivityMattersTableHtml(groups, aggregated) {
        // 종목마다 별도 테이블로 렌더링해 rowspan이 다음 종목으로 넘어가지 않게 한다.
        // (한 테이블에서 rowspan이 어긋나면 교우돌봄 1~3이 복음선교 아래에 중복 표시됨)
        const tables = (groups || []).map((group, gIdx) => {
            const rows = Array.isArray(group.rows) ? group.rows : [];
            if (!rows.length) return '';
            const body = rows.map((rowDef, rIdx) => {
                const key = `${gIdx}:${rIdx}`;
                const agg = aggregated[key] || { count: 0, remarks: [], content: '' };
                const rmkHtml = (agg.remarks || []).length
                    ? agg.remarks.map((rmk) =>
                        `<div class="rmk-line">${escapeHtml(rmk.label)} ${formatRmkBlank(rmk.value, rmk.unit)}</div>`
                    ).join('')
                    : '';
                const catCell = rIdx === 0
                    ? `<td class="col-cat" rowspan="${rows.length}">${escapeHtml(group.title)}</td>`
                    : '';
                return `
                    <tr>
                        ${catCell}
                        <td class="col-sub">${escapeHtml(rowDef.label)}</td>
                        <td class="col-cnt">${agg.count > 0 ? n(agg.count) : ''}</td>
                        <td class="col-note">${cell(agg.content)}</td>
                        <td class="col-rmk">${rmkHtml}</td>
                    </tr>
                `;
            }).join('');
            return `
            <div class="org-table-wrap act-matters-group">
                <table class="form-table act-matters-table">
                    <thead>
                        <tr>
                            <th class="col-cat">종목</th>
                            <th class="col-sub">세목</th>
                            <th class="col-cnt">활동횟수</th>
                            <th class="col-note">내용</th>
                            <th class="col-rmk">비고</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${body}
                    </tbody>
                </table>
            </div>`;
        }).filter(Boolean);
        return tables.join('');
    }

    function aggregateAllActivityMatters(records) {
        const result = {};
        ACTIVITY_MATTERS_PART1.forEach((group, gIdx) => {
            group.rows.forEach((rowDef, rIdx) => {
                result[`p1:${gIdx}:${rIdx}`] = aggregateActivityMattersRow(records, rowDef);
            });
        });
        ACTIVITY_MATTERS_PART2.forEach((group, gIdx) => {
            group.rows.forEach((rowDef, rIdx) => {
                result[`p2:${gIdx}:${rIdx}`] = aggregateActivityMattersRow(records, rowDef);
            });
        });
        return result;
    }

    function buildActivityMattersHtml(records) {
        const agg = aggregateAllActivityMatters(records || []);
        const part1Agg = {};
        const part2Agg = {};
        Object.keys(agg).forEach((k) => {
            if (k.startsWith('p1:')) part1Agg[k.slice(3)] = agg[k];
            else if (k.startsWith('p2:')) part2Agg[k.slice(3)] = agg[k];
        });
        return `
            <div class="sec-title">10. 활동 사항
                <span style="font-weight:400;font-size:11px;">(조회 기간 · 산하 Pr 활동 집계)</span>
            </div>
            ${buildActivityMattersTableHtml(ACTIVITY_MATTERS_PART1, part1Agg)}
            <div style="height:10px;"></div>
            ${buildActivityMattersTableHtml(ACTIVITY_MATTERS_PART2, part2Agg)}
        `;
    }

    /** 기도생활 집계 항목 (활동요약 바로 위) */
    const PRAYER_LIFE_ITEMS = [
        { key: 'rosary', label: '묵주기도', unit: '단', categories: ['기도생활-묵주기도'] },
        { key: 'weekday_mass', label: '평일미사', unit: '회', categories: ['기도생활-평일미사'] },
        { key: 'stations', label: '십자가의 길', unit: '회', categories: ['기도생활-십자가의길'] },
        { key: 'bible_read', label: '성경봉독', unit: '시간', categories: ['기도생활-성경읽기'] },
        { key: 'bible_write', label: '성경쓰기', unit: '시간', categories: ['기도생활-성경쓰기'] },
        { key: 'little_office', label: '소성무일도', unit: '회', categories: ['기도생활-소성무일도'] },
        { key: 'adoration', label: '성체조배', unit: '회', categories: ['기도생활-성체조배'] },
        { key: 'other', label: '기 타', unit: '', categories: ['기도생활-기타'] }
    ];

    function sumCategoryCount(records, categories) {
        const allowedSemoks = semokKeysFromCategories(categories);
        let total = 0;
        (records || []).forEach((rec) => {
            if (!recordMatchesSemoks(rec, allowedSemoks)) return;
            total += Number(rec.count) || 0;
        });
        return total;
    }

    function prayerCellHtml(item, value) {
        const shown = value > 0 ? String(value) : '';
        const unit = item.unit ? ` ${escapeHtml(item.unit)}` : '';
        return `${escapeHtml(item.label)} : ${blank(shown, 'w4')}${unit}`;
    }

    function buildPrayerLifeHtml(records) {
        const totals = {};
        PRAYER_LIFE_ITEMS.forEach((item) => {
            totals[item.key] = sumCategoryCount(records, item.categories);
        });
        const byKey = (key) => PRAYER_LIFE_ITEMS.find((x) => x.key === key);

        return `
            <div class="sec-title">기도생활
                <span style="font-weight:400;font-size:11px;">(조회 기간 · 산하 Pr 활동 집계)</span>
            </div>
            <div class="org-table-wrap">
                <table class="form-table prayer-life-table">
                    <tbody>
                        <tr>
                            <td class="prayer-cat" rowspan="3">기도생활</td>
                            <td class="prayer-cell">${prayerCellHtml(byKey('rosary'), totals.rosary)}</td>
                            <td class="prayer-cell">${prayerCellHtml(byKey('weekday_mass'), totals.weekday_mass)}</td>
                            <td class="prayer-cell">${prayerCellHtml(byKey('stations'), totals.stations)}</td>
                        </tr>
                        <tr>
                            <td class="prayer-cell">${prayerCellHtml(byKey('bible_read'), totals.bible_read)}</td>
                            <td class="prayer-cell">${prayerCellHtml(byKey('bible_write'), totals.bible_write)}</td>
                            <td class="prayer-cell">${prayerCellHtml(byKey('little_office'), totals.little_office)}</td>
                        </tr>
                        <tr>
                            <td class="prayer-cell">${prayerCellHtml(byKey('adoration'), totals.adoration)}</td>
                            <td class="prayer-cell span2" colspan="2">${prayerCellHtml(byKey('other'), totals.other)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    /** 11. 평가 — 활동결과 지표 */
    const EVAL_GROUPS = [
        {
            title: '1. 복음선교',
            items: [
                {
                    label: '교리반인도',
                    unit: '명',
                    categories: [
                        '복음선교-외인 입교권면', '복음선교-개종권면', '복음선교-교리 중단자 권면',
                        '복음선교-방문선교', '복음선교-가두선교'
                    ],
                    resultField: 'catechism_guide'
                },
                {
                    label: '세례자',
                    unit: '명',
                    categories: [
                        '예비자 돌봄-교리반 인도', '예비자 돌봄-타인이인도한예비신자', '예비자 돌봄-통신교리자',
                        '복음선교-교리반 인도', '복음선교-교리반인도예비자', '복음선교-예비신자관리돌봄', '복음선교-통신교리자 돌봄'
                    ],
                    resultField: 'baptism'
                }
            ]
        },
        {
            title: '2. 교우돌봄',
            items: [
                {
                    label: '냉담교우회두',
                    unit: '명',
                    categories: ['교우돌봄-냉담 교우 방문', '교우돌봄-냉담교우회두 권면'],
                    resultField: 'meeting_head'
                },
                {
                    label: '혼인장애자해소',
                    unit: '명',
                    categories: ['교우돌봄-혼인 장애자 돌봄'],
                    resultField: 'resolution'
                },
                {
                    label: '유아세례',
                    unit: '명',
                    categories: ['교우돌봄-유아 세례 권면'],
                    resultField: 'baptism'
                }
            ]
        },
        {
            title: '3. 어려움을 겪는자돌봄',
            items: [
                {
                    label: '병자성사',
                    unit: '명',
                    categories: ['어려운자돌봄-교우 환자 방문 및 돌봄'],
                    resultField: 'sacrament'
                },
                {
                    label: '병자영성체',
                    unit: '명',
                    categories: ['어려운자돌봄-교우 환자 방문 및 돌봄'],
                    resultField: 'first_communion'
                },
                {
                    label: '대세자',
                    unit: '명',
                    categories: ['어려운자돌봄-외인환자 방문 및 돌봄', '어려운자돌봄-대세자돌봄'],
                    resultField: 'conditional_baptism'
                }
            ]
        },
        {
            title: '4. 레지오확장',
            items: [
                {
                    label: '행동단원',
                    unit: '명',
                    categories: ['레지오활동-행동단원 모집'],
                    resultField: 'membership'
                },
                {
                    label: '협조단원',
                    unit: '명',
                    categories: ['레지오활동-협조단원 모집. 돌봄', '레지오활동-협조단원 모집및  돌봄'],
                    resultField: 'membership'
                },
                {
                    label: '쁘레시디움설립',
                    unit: '개',
                    categories: ['레지오활동-Pr설립권면'],
                    resultField: 'establishment'
                }
            ]
        },
        {
            title: '5. 본당협조',
            items: [
                {
                    label: '피정참가',
                    unit: '명',
                    categories: ['본당교회협조-피정참가권장'],
                    resultField: 'membership'
                },
                {
                    label: '교육참가',
                    unit: '명',
                    categories: ['본당교회협조-피정참가권장'],
                    resultField: 'establishment'
                }
            ]
        },
        {
            title: '6. 기타',
            items: [
                {
                    label: '',
                    unit: '',
                    categories: [],
                    resultField: 'count'
                }
            ]
        }
    ];

    function sumEvalMetric(records, item) {
        const allowedSemoks = semokKeysFromCategories(item.categories);
        let count = 0;
        let result = 0;
        (records || []).forEach((rec) => {
            if (!recordMatchesSemoks(rec, allowedSemoks)) return;
            count += Number(rec.count) || 0;
            result += Number(rec[item.resultField]) || 0;
        });
        return { count, result };
    }

    function buildEvalPeriodStats(records) {
        const rows = [];
        let totalCount = 0;
        let totalResult = 0;
        EVAL_GROUPS.forEach((group) => {
            group.items.forEach((item, idx) => {
                const m = sumEvalMetric(records, item);
                totalCount += m.count;
                totalResult += m.result;
                rows.push({
                    groupTitle: group.title,
                    groupSize: group.items.length,
                    isFirst: idx === 0,
                    label: item.label,
                    unit: item.unit,
                    count: m.count,
                    result: m.result
                });
            });
        });
        rows.forEach((row) => {
            row.ratio = totalResult > 0 && row.result > 0
                ? Math.round((row.result / totalResult) * 1000) / 10
                : 0;
        });
        return { rows, totalCount, totalResult };
    }

    function evalNum(value) {
        return value > 0 ? n(value) : '';
    }

    function buildEvaluationHtml(currentRecords, previousRecords, futurePlans) {
        const cur = buildEvalPeriodStats(currentRecords || []);
        const prev = buildEvalPeriodStats(previousRecords || []);
        const body = cur.rows.map((row, idx) => {
            const p = prev.rows[idx] || { count: 0, result: 0, ratio: 0 };
            const catCell = row.isFirst
                ? `<td class="eval-cat" rowspan="${row.groupSize}">${escapeHtml(row.groupTitle)}</td>`
                : '';
            const itemLabel = row.label
                ? `${escapeHtml(row.label)}${row.unit ? ` <span class="eval-hint">(${escapeHtml(row.unit)})</span>` : ''}`
                : '';
            return `
                <tr>
                    ${catCell}
                    <td class="eval-item">${itemLabel}</td>
                    <td>${evalNum(p.count)}</td>
                    <td>${evalNum(p.result)}</td>
                    <td>${p.ratio > 0 ? `${p.ratio}%` : ''}</td>
                    <td>${evalNum(row.count)}</td>
                    <td>${evalNum(row.result)}</td>
                    <td>${row.ratio > 0 ? `${row.ratio}%` : ''}</td>
                </tr>
            `;
        }).join('');

        const prevRatioTotal = prev.totalResult > 0 ? '100%' : '';
        const curRatioTotal = cur.totalResult > 0 ? '100%' : '';

        return `
            <div class="sec-title">11. 평가 및 향후 계획</div>
            <div class="sub-title" style="font-weight:600;">1) 활동 평가
                <span style="font-weight:400;font-size:11px;">(전차=직전 동일 기간 · 금차=조회 기간)</span>
            </div>
            <div class="org-table-wrap">
                <table class="form-table eval-table">
                    <thead>
                        <tr>
                            <th rowspan="2">구분</th>
                            <th rowspan="2">항목</th>
                            <th colspan="3">전차 보고</th>
                            <th colspan="3">금차 보고</th>
                        </tr>
                        <tr>
                            <th>횟수</th><th>활동결과</th><th>비율%</th>
                            <th>횟수</th><th>활동결과</th><th>비율%</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${body}
                        <tr>
                            <td colspan="2"><strong>계</strong></td>
                            <td>${evalNum(prev.totalCount)}</td>
                            <td>${evalNum(prev.totalResult)}</td>
                            <td>${prevRatioTotal}</td>
                            <td>${evalNum(cur.totalCount)}</td>
                            <td>${evalNum(cur.totalResult)}</td>
                            <td>${curRatioTotal}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="sub-title" style="font-weight:600;">2) 향후 계획</div>
            <div class="line-box" style="min-height:72px;">${cell(futurePlans || '')}</div>
        `;
    }

    function buildSpecialNotesHtml(specialNotes) {
        const hint = '산하 Pr의 모범이 될 만한 활동 사례를 육하원칙에 따라 방법·주기(주간/월간)·성과·어려움·문제점·해결방안 중심으로 기록합니다.';
        const text = String(specialNotes || '').trim();
        return `
            <div class="sec-title">12. 특기 사항</div>
            <div class="special-hint">${escapeHtml(hint)}</div>
            <div class="line-box" style="min-height:80px;">${cell(text)}</div>
        `;
    }

    function buildRosterHtml(roster) {
        const officers = Array.isArray(roster?.officers) ? roster.officers : [];
        const roles = ['영적지도자', '단장', '부단장', '서기', '회계'];
        const byRole = (role) => officers.find((o) => o.role === role) || {};
        const officerRows = roles.map((role) => {
            const o = byRole(role);
            return `
                <tr>
                    <td>${escapeHtml(role === '단장' ? '단 장' : role === '부단장' ? '부 단 장' : role === '서기' ? '서 기' : role === '회계' ? '회 계' : role)}</td>
                    <td>${cell(o.name)}</td>
                    <td>${cell(o.baptism_name)}</td>
                    <td>${cell(o.phone_home)}</td>
                    <td>${cell(o.phone_mobile)}</td>
                    <td>${cell(o.elected_on)}</td>
                </tr>
            `;
        }).join('');

        const praesidia = Array.isArray(roster?.praesidia) ? roster.praesidia : [];
        const minPr = Math.max(praesidia.length, 7);
        let prRows = '';
        for (let i = 0; i < minPr; i += 1) {
            const pr = praesidia[i] || { pr_name: '', officers: {} };
            const off = pr.officers || {};
            const g = (role) => off[role] || {};
            prRows += `
                <tr>
                    <td rowspan="3">${i + 1}</td>
                    <td class="pr-name" rowspan="3">${cell(pr.pr_name)}</td>
                    <td>${cell(g('단장').name)}</td>
                    <td>${cell(g('부단장').name)}</td>
                    <td>${cell(g('서기').name)}</td>
                    <td>${cell(g('회계').name)}</td>
                </tr>
                <tr>
                    <td>${cell(g('단장').baptism_name)}</td>
                    <td>${cell(g('부단장').baptism_name)}</td>
                    <td>${cell(g('서기').baptism_name)}</td>
                    <td>${cell(g('회계').baptism_name)}</td>
                </tr>
                <tr>
                    <td>${cell(g('단장').appointed_on)}</td>
                    <td>${cell(g('부단장').appointed_on)}</td>
                    <td>${cell(g('서기').appointed_on)}</td>
                    <td>${cell(g('회계').appointed_on)}</td>
                </tr>
            `;
        }

        return `
            <div class="sec-title">가) 간부 현황</div>
            <div class="org-table-wrap">
                <table class="form-table roster-table">
                    <thead>
                        <tr>
                            <th rowspan="2">직책</th>
                            <th rowspan="2">성명</th>
                            <th rowspan="2">세례명</th>
                            <th colspan="2">전화</th>
                            <th rowspan="2">선출일자</th>
                        </tr>
                        <tr>
                            <th>자택</th>
                            <th>휴대폰</th>
                        </tr>
                    </thead>
                    <tbody>${officerRows}</tbody>
                </table>
            </div>

            <div class="sec-title">나) 소속 쁘레시디움</div>
            <div class="org-table-wrap">
                <table class="form-table roster-table">
                    <thead>
                        <tr>
                            <th style="width:6%">순</th>
                            <th style="width:18%">호도</th>
                            <th>단장 / 임명일자</th>
                            <th>부단장 / 임명일자</th>
                            <th>서기 / 임명일자</th>
                            <th>회계 / 임명일자</th>
                        </tr>
                    </thead>
                    <tbody>${prRows}</tbody>
                </table>
            </div>
            <p class="note" style="margin-top:4px;">※ 소속 Pr 표: 각 호도마다 성명 → 세례명 → 임명일자 순으로 3행 표시</p>
        `;
    }

    function previousPeriodRange(startDate, endDate) {
        const s = parseYmd(startDate);
        const e = parseYmd(endDate);
        if (!s || !e) return null;
        const startMs = Date.UTC(s.year, s.month - 1, s.day);
        const endMs = Date.UTC(e.year, e.month - 1, e.day);
        const days = Math.round((endMs - startMs) / 86400000) + 1;
        if (days < 1) return null;
        const prevEnd = new Date(startMs);
        prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setUTCDate(prevStart.getUTCDate() - days + 1);
        const fmt = (d) => {
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const day = String(d.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };
        return { start: fmt(prevStart), end: fmt(prevEnd) };
    }

    function mfy(row, key) {
        const r = row || {};
        return n(r[key]);
    }

    function orgTriple(row, mKey, fKey, tKey) {
        return `
            <td>${mfy(row, mKey)}</td>
            <td>${mfy(row, fKey)}</td>
            <td>${mfy(row, tKey)}</td>
        `;
    }

    function emptyRows(colCount, rowCount) {
        const cols = Array.from({ length: colCount }, () => '<td></td>').join('');
        return Array.from({ length: rowCount }, () => `<tr>${cols}</tr>`).join('');
    }

    function padRows(htmlRows, colCount, minRows) {
        const need = Math.max(0, minRows - htmlRows.length);
        return htmlRows.join('') + (need ? emptyRows(colCount, need) : '');
    }

    function buildMovementTablesHtml(movement) {
        const mv = movement || {};
        const curiaRows = (Array.isArray(mv.curia_officers) ? mv.curia_officers : []).map((row) => `
            <tr>
                <td>${cell(row.role)}</td>
                <td>${cell(row.name)}</td>
                <td>${cell(row.baptism_name)}</td>
                <td>${cell(row.elected_on)}</td>
                <td>${cell(row.remark)}</td>
            </tr>
        `);
        const prRows = (Array.isArray(mv.pr_officers) ? mv.pr_officers : []).map((row) => `
            <tr>
                <td>${cell(row.pr_name)}</td>
                <td>${cell(row.role)}</td>
                <td>${cell(row.name)}</td>
                <td>${cell(row.baptism_name)}</td>
                <td>${cell(row.appointed_on)}</td>
                <td>${cell(row.remark)}</td>
            </tr>
        `);
        const newRows = (Array.isArray(mv.new_presidia) ? mv.new_presidia : []).map((row) => `
            <tr>
                <td>${cell(row.affiliation)}</td>
                <td>${cell(row.pr_name)}</td>
                <td>${cell(row.founded_on)}</td>
                <td>${cell(row.remark)}</td>
            </tr>
        `);
        const returnedRows = (Array.isArray(mv.returned_presidia) ? mv.returned_presidia : []).map((row) => `
            <tr>
                <td>${cell(row.affiliation)}</td>
                <td>${cell(row.pr_name)}</td>
                <td>${cell(row.returned_on)}</td>
                <td>${cell(row.remark)}</td>
            </tr>
        `);

        return `
            <div class="sub-title">다) 간부 이동</div>
            <div class="sub-title" style="font-weight:600;">(1) 꾸리아
                <span style="font-weight:400;font-size:11px;">
                    (기준일 ${cell(mv.range_end || '')} 로부터 1년 이내 선출)
                </span>
            </div>
            <div class="org-table-wrap">
                <table class="form-table">
                    <thead>
                        <tr>
                            <th>직책</th>
                            <th>성명</th>
                            <th>세례명</th>
                            <th>선출일자</th>
                            <th>비고</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${padRows(curiaRows, 5, 2)}
                    </tbody>
                </table>
            </div>

            <div class="sub-title" style="font-weight:600;">(2) 쁘레시디움
                <span style="font-weight:400;font-size:11px;">(동일 기간 내 Pr별 임명)</span>
            </div>
            <div class="org-table-wrap">
                <table class="form-table">
                    <thead>
                        <tr>
                            <th>명칭(호도)</th>
                            <th>직책</th>
                            <th>성명</th>
                            <th>세례명</th>
                            <th>임명일자</th>
                            <th>비고</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${padRows(prRows, 6, 2)}
                    </tbody>
                </table>
            </div>

            <div class="sub-title">라) 신설 쁘레시디움
                <span style="font-weight:400;font-size:11px;">(동일 기간 내 설립)</span>
            </div>
            <div class="org-table-wrap">
                <table class="form-table">
                    <thead>
                        <tr>
                            <th>소속</th>
                            <th>호도</th>
                            <th>설립일자</th>
                            <th>비고</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${padRows(newRows, 4, 2)}
                    </tbody>
                </table>
            </div>

            <div class="sub-title">마) 호도 반납 쁘레시디움
                <span style="font-weight:400;font-size:11px;">(동일 기간 내 반납)</span>
            </div>
            <div class="org-table-wrap">
                <table class="form-table">
                    <thead>
                        <tr>
                            <th>소속</th>
                            <th>호도</th>
                            <th>반납일자</th>
                            <th>비고</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${padRows(returnedRows, 4, 2)}
                    </tbody>
                </table>
            </div>
        `;
    }

    function buildOrgCompositionRows(org) {
        const founded = org.founded || {};
        const previous = org.previous || {};
        const current = org.current || {};
        const change = org.change || {};

        function cellsFor(src, mode) {
            if (mode === 'prAdult') return `<td></td><td></td><td>${n(src.pr_adult)}</td>`;
            if (mode === 'prJunior') return `<td></td><td></td><td>${n(src.pr_junior)}</td>`;
            if (mode === 'prTotal') {
                const t = (Number(src.pr_adult) || 0) + (Number(src.pr_junior) || 0);
                return `<td></td><td></td><td>${t || ''}</td>`;
            }
            if (mode === 'activeAdult') return orgTriple(src, 'active_adult_m', 'active_adult_f', 'active_adult_t');
            if (mode === 'activeJunior') return orgTriple(src, 'active_junior_m', 'active_junior_f', 'active_junior_t');
            if (mode === 'activeTotal') {
                const m = (Number(src.active_adult_m) || 0) + (Number(src.active_junior_m) || 0);
                const f = (Number(src.active_adult_f) || 0) + (Number(src.active_junior_f) || 0);
                const t = (Number(src.active_adult_t) || 0) + (Number(src.active_junior_t) || 0);
                return `<td>${m || ''}</td><td>${f || ''}</td><td>${t || ''}</td>`;
            }
            if (mode === 'praetorian') return `<td></td><td></td><td>${n(src.praetorian)}</td>`;
            if (mode === 'aux') return orgTriple(src, 'aux_m', 'aux_f', 'aux_t');
            if (mode === 'adjutorian') return `<td></td><td></td><td>${n(src.adjutorian)}</td>`;
            return '<td></td><td></td><td></td>';
        }

        function block(mode) {
            return `${cellsFor(founded, mode)}${cellsFor(previous, mode)}${cellsFor(current, mode)}${cellsFor(change, mode)}`;
        }

        return `
            <tr><td rowspan="3">쁘레시디움</td><td>성인</td>${block('prAdult')}</tr>
            <tr><td>소년</td>${block('prJunior')}</tr>
            <tr><td>계</td>${block('prTotal')}</tr>
            <tr><td rowspan="3">행동단원</td><td>성인</td>${block('activeAdult')}</tr>
            <tr><td>소년</td>${block('activeJunior')}</tr>
            <tr><td>계</td>${block('activeTotal')}</tr>
            <tr><td colspan="2">쁘레또리움단원</td>${block('praetorian')}</tr>
            <tr><td colspan="2">협조단원</td>${block('aux')}</tr>
            <tr><td colspan="2">아듀또리움단원</td>${block('adjutorian')}</tr>
        `;
    }

    function buildFormHtml(model) {
        const m = model || {};
        const start = parseYmd(m.start_date);
        const end = parseYmd(m.end_date);
        const meeting = m.meeting || {};
        const officers = m.officers || [];
        const roles = ['영적지도자', '단장', '부단장', '서기', '회계'];
        const officerMap = {
            영적지도자: { name: m.spiritual_director || '', baptism_name: '', elected_on: '', attendance: '' },
            단장: officerByRole(officers, '단장'),
            부단장: officerByRole(officers, '부단장'),
            서기: officerByRole(officers, '서기'),
            회계: officerByRole(officers, '회계')
        };

        const nameRow = roles.map((role) => `<td>${cell(officerMap[role].name)}</td>`).join('');
        const baptismRow = roles.map((role) => `<td>${cell(officerMap[role].baptism_name)}</td>`).join('');
        const electedRow = roles.map((role) => `<td>${cell(officerMap[role].elected_on)}</td>`).join('');
        const attendRow = roles.map((role) => {
            if (role === '영적지도자') return '<td></td>';
            return `<td>${cell(officerMap[role].attendance || '00.0%')}</td>`;
        }).join('');

        const org = m.organization || {};
        const inquiryText = String(m.inquiries || '').trim();

        return `
            <div class="curia-comp-form" id="curiaComprehensiveFormPrint">
                <div class="form-title">꾸리아 제 ${blank(m.report_seq, 'w4')} 차 종합보고서</div>
                <ol class="info-list">
                    <li>승인(설립)일자: ${blank(m.approved_y || m.founded_y, 'w4')} 년 ${blank(m.approved_m || m.founded_m, 'w3')} 월 ${blank(m.approved_d || m.founded_d, 'w3')} 일</li>
                    <li>보고기간:
                        ${blank(start?.y, 'w4')} 년 ${blank(start?.m, 'w3')} 월 (${blank(m.meeting_from, 'w3')}차)
                        ~
                        ${blank(end?.y, 'w4')} 년 ${blank(end?.m, 'w3')} 월 (${blank(m.meeting_to, 'w3')}차)
                    </li>
                    <li>회합일시:
                        ${blank(meeting.year, 'w4')} 년 ${blank(meeting.month, 'w3')} 월 ${blank(meeting.day, 'w3')} 일
                        (${blank(meeting.weekday, 'w3')})요일
                        ${blank(meeting.hour, 'w3')} 시 ${blank(meeting.minute, 'w3')} 분
                    </li>
                    <li>회합장소: ${blank(meeting.place, 'w20')}</li>
                    <li>조직현황</li>
                </ol>

                <div class="sub-title">가) 간부 구성</div>
                <div class="org-table-wrap">
                    <table class="form-table">
                        <thead>
                            <tr>
                                <th style="width:16%"></th>
                                <th>영적지도자</th>
                                <th>단장</th>
                                <th>부단장</th>
                                <th>서기</th>
                                <th>회계</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td>성명</td>${nameRow}</tr>
                            <tr><td>세례명</td>${baptismRow}</tr>
                            <tr><td>선출일자</td>${electedRow}</tr>
                            <tr><td>상급평의회출석률</td>${attendRow}</tr>
                        </tbody>
                    </table>
                </div>

                <div class="sub-title">나) 조직 구성 현황</div>
                <div class="org-table-wrap">
                    <table class="form-table">
                        <thead>
                            <tr>
                                <th rowspan="2" colspan="2">구분</th>
                                <th colspan="3">설립 시</th>
                                <th colspan="3">전차보고서</th>
                                <th colspan="3">현 재</th>
                                <th colspan="3">증 감</th>
                            </tr>
                            <tr>
                                <th>남</th><th>여</th><th>계</th>
                                <th>남</th><th>여</th><th>계</th>
                                <th>남</th><th>여</th><th>계</th>
                                <th>남</th><th>여</th><th>계</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${buildOrgCompositionRows(org)}
                        </tbody>
                    </table>
                </div>

                ${buildMovementTablesHtml(m.movement)}

                ${buildOpsAndEventsHtml(m.ops, m.events)}
                ${buildEducationTablesHtml(m.events)}

                <div class="sec-title">기타(질의 및 건의)</div>
                <div class="line-box">${cell(inquiryText)}</div>

                ${buildActivityMattersHtml(m.activityRecords)}

                ${buildPrayerLifeHtml(m.activityRecords)}

                ${buildEvaluationHtml(m.evalCurrent, m.evalPrevious, m.futurePlans)}

                ${buildSpecialNotesHtml(m.specialNotes)}

                ${buildRosterHtml(m.roster)}

                <p class="note">※ 꾸리아명·간부(K1~K4)·조직현황·간부이동/신설/호도반납·행사·교육/피정·질의/건의·10. 활동 사항·기도생활·11. 평가(전차/금차)·간부·소속 Pr 명부는 DB에서 자동 기입됩니다.</p>
                <p class="note">※ 활동종목은 세목 분류용이며, 활동횟수 집계는 세목 기준입니다(종목 접두와 무관).</p>
            </div>
        `;
    }

    function eventRowHtml(row) {
        const r = row || {};
        const title = r.pr_name
            ? `${r.title || ''} (${r.pr_name})`
            : (r.title || '');
        return `
            <tr>
                <td class="left">${cell(title)}</td>
                <td>${cell(r.datetime)}</td>
                <td>${cell(r.place)}</td>
                <td>${cell(r.attendance)}</td>
            </tr>
        `;
    }

    function buildOpsAndEventsHtml(ops, events) {
        const o = ops || {};
        const ev = events || {};
        const legionRows = (Array.isArray(ev.legion_events) ? ev.legion_events : []).map((row) => {
            // 고정 5종은 기본 행사명만, 동일 행사 복수(Pr별)일 때 호도 병기
            const sameTitleCount = (ev.legion_events || []).filter((x) => x.title === row.title).length;
            const showPr = sameTitleCount > 1 && row.pr_name && (row.datetime || row.place || row.attendance);
            return eventRowHtml({
                title: row.title,
                datetime: row.datetime,
                place: row.place,
                attendance: row.attendance,
                pr_name: showPr ? row.pr_name : ''
            });
        });
        const otherMapped = (Array.isArray(ev.other_events) ? ev.other_events : []).map((row) =>
            eventRowHtml({
                title: row.pr_name ? `${row.title || ''} (${row.pr_name})` : (row.title || ''),
                datetime: row.datetime,
                place: row.place,
                attendance: row.attendance
            })
        );

        return `
            <div class="sec-title">6. 운영 및 관리현황</div>
            <div class="ops-block">
                <div class="sub-title" style="font-weight:600;">가) 출석률</div>
                <ol class="ops-list">
                    <li>(1) 간부: ${blank(o.attendance_officer, 'w6')} %</li>
                    <li>(2) 평의원: ${blank(o.attendance_councilor, 'w6')} %</li>
                    <li>(3) 전체: ${blank(o.attendance_total, 'w6')} %</li>
                </ol>
                <div class="sub-title" style="font-weight:600;">나) 통신교환</div>
                <ol class="ops-list">
                    <li>(1) 수신: ${blank(o.mail_in, 'w6')} 건</li>
                    <li>(2) 발신: ${blank(o.mail_out, 'w6')} 건</li>
                </ol>
                <div class="sub-title" style="font-weight:600;">다) 방문</div>
                <ol class="ops-list">
                    <li>(1) 쁘레시디움: ${blank(o.visit_pr, 'w10')}</li>
                </ol>
            </div>

            <div class="sec-title">8. 행사</div>
            <div class="sub-title" style="font-weight:600;">가) 레지오 마리에 행사
                <span style="font-weight:400;font-size:11px;">(산하 Pr 실시 행사 집계)</span>
            </div>
            <div class="org-table-wrap">
                <table class="form-table">
                    <thead>
                        <tr>
                            <th>행사명</th>
                            <th>일시</th>
                            <th>장소</th>
                            <th>참가인원</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${legionRows.join('') || emptyRows(4, 5)}
                    </tbody>
                </table>
            </div>

            <div class="sub-title" style="font-weight:600;">나) 기타 행사
                <span style="font-weight:400;font-size:11px;">(조회 기간 내)</span>
            </div>
            <div class="org-table-wrap">
                <table class="form-table">
                    <thead>
                        <tr>
                            <th>행사명</th>
                            <th>일시</th>
                            <th>장소</th>
                            <th>참가인원</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${padRows(otherMapped, 4, 4)}
                    </tbody>
                </table>
            </div>
        `;
    }

    function buildEduRowsHtml(rows, minRows) {
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) return emptyRows(7, minRows);

        // 동일 교육명칭 연속 구간 → 첫 칸 rowspan
        const html = [];
        let i = 0;
        while (i < list.length) {
            const title = String(list[i].title || '');
            let span = 1;
            while (i + span < list.length && String(list[i + span].title || '') === title) {
                span += 1;
            }
            for (let k = 0; k < span; k += 1) {
                const r = list[i + k];
                const showPr = span > 1 && r.pr_name && (r.datetime || r.place || r.attendance);
                const org = r.organizer || (showPr ? r.pr_name : '') || '';
                const nameCell = k === 0
                    ? `<td class="left" rowspan="${span}">${cell(title)}</td>`
                    : '';
                html.push(`
                    <tr>
                        ${nameCell}
                        <td>${cell(r.datetime)}</td>
                        <td>${cell(r.place)}</td>
                        <td>${cell(org)}</td>
                        <td>${cell(r.target)}</td>
                        <td>${cell(r.attendance)}</td>
                        <td class="left">${cell(r.lecturer)}</td>
                    </tr>
                `);
            }
            i += span;
        }
        const need = Math.max(0, minRows - list.length);
        return html.join('') + (need ? emptyRows(7, need) : '');
    }

    function buildEducationTablesHtml(events) {
        const ev = events || {};
        return `
            <div class="sec-title">9. 교육 실시 사항
                <span style="font-weight:400;font-size:11px;">(조회 기간 내 산하 Pr 실시)</span>
            </div>
            <div class="org-table-wrap">
                <table class="form-table edu-table">
                    <thead>
                        <tr>
                            <th>교육명칭</th>
                            <th>일시</th>
                            <th>장소</th>
                            <th>주관</th>
                            <th>대상</th>
                            <th>참가인원</th>
                            <th>강사·제목</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${buildEduRowsHtml(ev.education_events, 4)}
                    </tbody>
                </table>
            </div>

            <div class="sec-title">연수(피정) 실시 사항
                <span style="font-weight:400;font-size:11px;">(조회 기간 내 산하 Pr 실시)</span>
            </div>
            <div class="org-table-wrap">
                <table class="form-table edu-table">
                    <thead>
                        <tr>
                            <th>교육명칭</th>
                            <th>일시</th>
                            <th>장소</th>
                            <th>주관</th>
                            <th>대상</th>
                            <th>참가인원</th>
                            <th>강사·제목</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${buildEduRowsHtml(ev.retreat_events, 4)}
                    </tbody>
                </table>
            </div>
        `;
    }

    function collectInquiriesFromRecords(records) {
        const lines = [];
        (records || []).forEach((record) => {
            const note = record.note != null ? String(record.note).trim() : '';
            if (!note || !/\[(?:질의|건의|질의및건의)\]/i.test(note)) return;
            const take = (tag) => {
                const re = new RegExp(
                    `\\[${tag}\\]\\s*([\\s\\S]*?)(?=\\n\\s*\\[(?:메모|주요활동내역|질의|건의|질의및건의)\\]|\\s*$)`,
                    'i'
                );
                const m = note.match(re);
                return (m?.[1] || '').trim();
            };
            const inquiry = take('질의');
            const suggest = take('건의');
            const legacy = take('질의및건의');
            const parts = [];
            if (inquiry) parts.push(`질의: ${inquiry}`);
            if (suggest) parts.push(`건의: ${suggest}`);
            if (!parts.length && legacy) parts.push(legacy);
            if (!parts.length) return;
            const date = String(record.activity_date || '').slice(0, 10);
            const rawName = String(record.member_name || '').trim();
            const who = rawName.replace(/^[TG](?:[1-6])?[1-8]/i, '') || rawName;
            const pr = String(record.pr_name || '').trim();
            const meta = [date, who, pr ? `Pr:${pr}` : ''].filter(Boolean).join(' · ');
            lines.push(meta ? `${meta}\n${parts.join('\n')}` : parts.join('\n'));
        });
        return lines.join('\n\n');
    }

    async function fetchCouncilMonthly(curiaName, year, month) {
        const qs = new URLSearchParams({
            type: 'curia',
            name: curiaName,
            year: String(year),
            month: String(month)
        });
        const res = await fetch(`/api/council-monthly-report?${qs.toString()}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `꾸리아 월례 자료 조회 실패 (${res.status})`);
        }
        return res.json();
    }

    async function fetchMovement(curiaName, endDate) {
        const qs = new URLSearchParams({
            curia_name: curiaName,
            end_date: endDate
        });
        const res = await fetch(`/api/curia-comprehensive-movement?${qs.toString()}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `간부이동 자료 조회 실패 (${res.status})`);
        }
        return res.json();
    }

    async function fetchEvents(curiaName, startDate, endDate) {
        const qs = new URLSearchParams({
            curia_name: curiaName,
            start_date: startDate,
            end_date: endDate
        });
        const res = await fetch(`/api/curia-comprehensive-events?${qs.toString()}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `행사 집계 조회 실패 (${res.status})`);
        }
        return res.json();
    }

    async function fetchRoster(curiaName) {
        const qs = new URLSearchParams({ curia_name: curiaName });
        const res = await fetch(`/api/curia-comprehensive-roster?${qs.toString()}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `간부·Pr 명부 조회 실패 (${res.status})`);
        }
        return res.json();
    }

    async function fetchCuriaActivities(curiaName, churchName, startDate, endDate) {
        const qs = new URLSearchParams({
            start_date: startDate,
            end_date: endDate
        });
        // curia_names 는 church_name 없이도 꾸리아 필터가 적용됨
        if (churchName) {
            qs.set('church_name', churchName);
            qs.set('curia_name', curiaName);
        } else {
            qs.set('curia_names', curiaName);
        }
        const res = await fetch(`/api/activities/summary?${qs.toString()}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `전차 활동 조회 실패 (${res.status})`);
        }
        const data = await res.json();
        return Array.isArray(data) ? data : (Array.isArray(data?.records) ? data.records : []);
    }

    /**
     * @param {object} opts
     * @param {string} opts.curiaName
     * @param {string} opts.startDate
     * @param {string} opts.endDate
     * @param {HTMLElement} opts.container
     * @param {Array} [opts.activityRecords]
     * @param {string} [opts.churchName]
     */
    async function render(opts) {
        ensureStyles();
        const container = opts.container;
        if (!container) return;

        const curiaName = String(opts.curiaName || '').trim();
        const startDate = String(opts.startDate || '').trim();
        const endDate = String(opts.endDate || '').trim();
        const churchName = String(opts.churchName || '').trim();
        if (!curiaName || !startDate || !endDate) {
            container.innerHTML = '<div class="no-data">꾸리아·기간을 선택한 뒤 조회하세요.</div>';
            return;
        }

        container.innerHTML = '<div class="no-data">꾸리아 종합보고서 양식을 불러오는 중…</div>';

        const end = parseYmd(endDate);
        let monthly = null;
        let movement = null;
        let events = null;
        let roster = { officers: [], praesidia: [] };
        let previousRecords = [];
        try {
            monthly = await fetchCouncilMonthly(
                curiaName,
                end?.year || new Date().getFullYear(),
                end?.month || (new Date().getMonth() + 1)
            );
        } catch (error) {
            console.warn('꾸리아 종합보고 월례 API 실패:', error);
        }
        try {
            movement = await fetchMovement(curiaName, endDate);
        } catch (error) {
            console.warn('꾸리아 종합보고 간부이동 API 실패:', error);
            movement = {
                range_start: '',
                range_end: endDate,
                curia_officers: [],
                pr_officers: [],
                new_presidia: [],
                returned_presidia: []
            };
        }
        try {
            events = await fetchEvents(curiaName, startDate, endDate);
        } catch (error) {
            console.warn('꾸리아 종합보고 행사 API 실패:', error);
            events = {
                legion_events: [],
                other_events: [],
                education_events: [],
                retreat_events: []
            };
        }
        try {
            roster = await fetchRoster(curiaName);
        } catch (error) {
            console.warn('꾸리아 종합보고 명부 API 실패:', error);
            roster = { officers: [], praesidia: [] };
        }
        try {
            const prevRange = previousPeriodRange(startDate, endDate);
            if (prevRange) {
                previousRecords = await fetchCuriaActivities(
                    curiaName,
                    churchName,
                    prevRange.start,
                    prevRange.end
                );
            }
        } catch (error) {
            console.warn('꾸리아 종합보고 전차 활동 조회 실패:', error);
            previousRecords = [];
        }

        const orgCurrent = (monthly && monthly.organization && monthly.organization.current) || {};
        const orgPrevious = (monthly && monthly.organization && monthly.organization.previous) || {};
        const inquiriesFromApi = String((monthly && monthly.inquiries) || '').trim();
        const inquiriesFromRecords = collectInquiriesFromRecords(opts.activityRecords || []);
        const specialNotes = String((monthly && monthly.major_activities) || '').trim();

        const model = {
            curia_name: curiaName,
            start_date: startDate,
            end_date: endDate,
            report_seq: '',
            meeting_from: '',
            meeting_to: '',
            founded_y: '',
            founded_m: '',
            founded_d: '',
            approved_y: monthly?.approved_y || '',
            approved_m: monthly?.approved_m || '',
            approved_d: monthly?.approved_d || '',
            meeting: monthly?.meeting || {},
            spiritual_director: monthly?.spiritual_director || '',
            officers: monthly?.officers || [],
            organization: {
                founded: {},
                previous: orgPrevious,
                current: orgCurrent,
                change: monthly?.organization?.increase || {}
            },
            movement,
            ops: {},
            events,
            inquiries: inquiriesFromRecords || inquiriesFromApi,
            activityRecords: Array.isArray(opts.activityRecords) ? opts.activityRecords : [],
            evalCurrent: Array.isArray(opts.activityRecords) ? opts.activityRecords : [],
            evalPrevious: previousRecords,
            futurePlans: '',
            specialNotes,
            roster
        };

        container.innerHTML = buildFormHtml(model);
    }

    function hide(container) {
        if (container) container.innerHTML = '';
    }

    function safeFilePart(value) {
        return String(value || '')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, '_')
            .slice(0, 40) || 'report';
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`스크립트 로드 실패: ${src}`));
            document.head.appendChild(script);
        });
    }

    async function ensurePdfLibraries() {
        if (!global.html2canvas) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        }
        if (!global.jspdf) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        }
        if (!global.html2canvas || !global.jspdf) {
            throw new Error('PDF 라이브러리를 불러오지 못했습니다.');
        }
    }

    function buildExportFileBase(meta) {
        const stamp = new Date().toISOString().slice(0, 10);
        const curiaName = meta?.curiaName || '';
        const startDate = meta?.startDate || '';
        const endDate = meta?.endDate || '';
        const range = startDate && endDate ? `${startDate}_${endDate}` : stamp;
        return `Regio_꾸리아종합보고_${safeFilePart(curiaName)}_${safeFilePart(range)}`;
    }

    function downloadBlob(content, mime, filename) {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    async function exportToPdf(formEl, meta) {
        if (!formEl) throw new Error('출력할 꾸리아 종합보고서가 없습니다.');
        await ensurePdfLibraries();
        ensureStyles();

        const canvas = await global.html2canvas(formEl, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false
        });

        const { jsPDF } = global.jspdf;
        const pdf = new jsPDF('portrait', 'mm', 'a4');
        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 8;
        const usableWidth = pageWidth - margin * 2;
        const usableHeight = pageHeight - margin * 2;
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = usableWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = margin;

        pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
        heightLeft -= usableHeight;

        while (heightLeft > 0) {
            position = margin - (imgHeight - heightLeft);
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
            heightLeft -= usableHeight;
        }

        pdf.save(`${buildExportFileBase(meta)}.pdf`);
    }

    async function exportToExcel(formEl, meta) {
        if (!formEl) throw new Error('출력할 꾸리아 종합보고서가 없습니다.');
        if (!global.XLSX) {
            await loadScript('https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js');
        }
        if (!global.XLSX) throw new Error('Excel 라이브러리를 불러오지 못했습니다.');

        const rows = [];
        rows.push(['꾸리아 종합보고서']);
        rows.push(['꾸리아', meta?.curiaName || '']);
        rows.push(['조회기간', `${meta?.startDate || ''} ~ ${meta?.endDate || ''}`]);
        rows.push([]);

        formEl.querySelectorAll('table').forEach((table, idx) => {
            rows.push([`표 ${idx + 1}`]);
            table.querySelectorAll('tr').forEach((tr) => {
                const cells = [...tr.querySelectorAll('th,td')].map((td) =>
                    String(td.innerText || '').replace(/\s+/g, ' ').trim()
                );
                if (cells.some((c) => c)) rows.push(cells);
            });
            rows.push([]);
        });

        const lineBoxes = formEl.querySelectorAll('.line-box');
        lineBoxes.forEach((box, idx) => {
            const text = String(box.innerText || '').trim();
            if (!text) return;
            rows.push([`서술 ${idx + 1}`, text]);
        });

        const worksheet = global.XLSX.utils.aoa_to_sheet(rows);
        worksheet['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
        const workbook = global.XLSX.utils.book_new();
        global.XLSX.utils.book_append_sheet(workbook, worksheet, '꾸리아종합보고');
        global.XLSX.writeFile(workbook, `${buildExportFileBase(meta)}.xlsx`);
    }

    function exportToHangul(formEl, meta) {
        if (!formEl) throw new Error('출력할 꾸리아 종합보고서가 없습니다.');
        const html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="utf-8">
    <meta name="Generator" content="Regio">
    <title>꾸리아 종합보고서</title>
    <style>
        body { font-family: '맑은 고딕', 'Malgun Gothic', sans-serif; padding: 20px; color: #111; }
        h1 { font-size: 12px; margin-bottom: 8px; }
        p { margin: 4px 0; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
        th, td { border: 1px solid #333; padding: 4px; text-align: center; vertical-align: middle; }
        .left { text-align: left; }
        .sec { font-weight: 700; margin: 14px 0 6px; }
        .box { border: 1px solid #333; min-height: 48px; padding: 8px; white-space: pre-wrap; }
    </style>
</head>
<body>
    <h1>꾸리아 종합보고서</h1>
    <p>꾸리아: ${escapeHtml(meta?.curiaName || '')}</p>
    <p>조회기간: ${escapeHtml(meta?.startDate || '')} ~ ${escapeHtml(meta?.endDate || '')}</p>
    ${formEl.innerHTML}
</body>
</html>`;
        downloadBlob('\ufeff' + html, 'text/html;charset=utf-8', `${buildExportFileBase(meta)}.html`);
        alert('한글(아래한글)에서 "파일 > 열기"로 저장된 HTML 파일을 열 수 있습니다.');
    }

    global.RegioCuriaComprehensiveReportForm = {
        render,
        hide,
        ensureStyles,
        exportToPdf,
        exportToExcel,
        exportToHangul
    };
})(typeof window !== 'undefined' ? window : global);
