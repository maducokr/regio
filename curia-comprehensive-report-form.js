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

    function cell(value, cls) {
        return blank(value, cls || 'w6');
    }

    /** 값이 있어도 PDF 전 수정 가능(저장 없음). 빈칸만 빨간 깜빡임 */
    function blank(value, cls) {
        const text = value === null || value === undefined || value === '' ? '' : String(value);
        const c = cls ? ` blank ${cls}` : ' blank';
        const has = text.trim() ? ' has-value' : '';
        return `<input type="text" class="${c.trim()} blank-editable${has}" value="${escapeHtml(text)}" placeholder=" " inputmode="text" autocomplete="off" aria-label="출력 전 수정">`;
    }

    function lineBoxHtml(text, minHeight) {
        const t = String(text || '').trim();
        const h = minHeight ? ` style="min-height:${minHeight};white-space:pre-wrap;"` : ' style="white-space:pre-wrap;"';
        const has = t ? ' has-value' : '';
        return `<div class="line-box blank-editable${has}"${h} contenteditable="true" data-placeholder="입력">${escapeHtml(t)}</div>`;
    }

    function fitBlankInputWidth(inp) {
        if (!inp || !inp.classList.contains('blank-editable')) return;
        const cs = window.getComputedStyle(inp);
        const minPx = parseFloat(cs.minWidth) || 8;
        const probe = document.createElement('span');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText = [
            'position:absolute',
            'left:-9999px',
            'top:0',
            'visibility:hidden',
            'white-space:pre',
            `font:${cs.font}`,
            `letter-spacing:${cs.letterSpacing}`,
            `padding-left:${cs.paddingLeft}`,
            `padding-right:${cs.paddingRight}`
        ].join(';');
        const raw = String(inp.value || '');
        probe.textContent = raw.length ? raw : '0';
        document.body.appendChild(probe);
        const w = Math.ceil(probe.getBoundingClientRect().width) + 8;
        document.body.removeChild(probe);
        inp.style.width = `${Math.max(minPx, raw.length ? w : minPx)}px`;
    }

    function wireBlankEditables(root) {
        if (!root) return;
        root.querySelectorAll('input.blank-editable').forEach((inp) => {
            const sync = () => {
                inp.classList.toggle('has-value', !!String(inp.value || '').trim());
                fitBlankInputWidth(inp);
            };
            sync();
            inp.addEventListener('input', sync);
        });
        root.querySelectorAll('.line-box.blank-editable').forEach((box) => {
            const sync = () => {
                box.classList.toggle('has-value', !!String(box.textContent || '').trim());
            };
            sync();
            box.addEventListener('input', sync);
        });
    }

    /** PDF/엑셀 출력 직전: 입력값을 텍스트로 고정(화면 입력란은 복원) */
    function freezeBlankInputsForExport(formEl) {
        const restorers = [];
        formEl.querySelectorAll('input.blank-editable').forEach((input) => {
            const span = document.createElement('span');
            const base = String(input.className || '')
                .replace(/\bblank-editable\b/g, '')
                .replace(/\bhas-value\b/g, '')
                .trim();
            span.className = `${base} blank-print`.trim();
            span.textContent = input.value || '';
            const parent = input.parentNode;
            parent.replaceChild(span, input);
            restorers.push(() => {
                parent.replaceChild(input, span);
            });
        });
        formEl.querySelectorAll('.line-box.blank-editable').forEach((box) => {
            const prevEditable = box.getAttribute('contenteditable');
            const prevClass = box.className;
            box.setAttribute('contenteditable', 'false');
            box.classList.remove('blank-editable');
            box.classList.add('blank-print');
            restorers.push(() => {
                if (prevEditable == null) box.removeAttribute('contenteditable');
                else box.setAttribute('contenteditable', prevEditable);
                box.className = prevClass;
            });
        });
        return () => restorers.forEach((fn) => fn());
    }

    async function withFrozenBlanks(formEl, work) {
        const restore = freezeBlankInputsForExport(formEl);
        try {
            // 레이아웃 반영 대기
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            return await work();
        } finally {
            restore();
        }
    }

    function n(value) {
        if (value === null || value === undefined || value === '') return '';
        const num = Number(value);
        if (Number.isNaN(num)) return String(value);
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
                vertical-align: baseline;
            }
            .curia-comp-form .blank.w3 { min-width: 2.4em; }
            .curia-comp-form .blank.w4 { min-width: 3.5em; }
            .curia-comp-form .blank.w6 { min-width: 5em; }
            .curia-comp-form .blank.w10 { min-width: 8em; }
            .curia-comp-form .blank.w20 { min-width: 14em; }
            @keyframes curia-blank-blink {
                0%, 100% { border-bottom-color: #dc2626; box-shadow: 0 2px 0 rgba(220, 38, 38, 0.55); }
                50% { border-bottom-color: #fca5a5; box-shadow: 0 2px 0 rgba(252, 165, 165, 0.35); }
            }
            .curia-comp-form input.blank.blank-editable {
                border: none;
                border-bottom: 2px solid #dc2626;
                border-radius: 0;
                background: rgba(220, 38, 38, 0.06);
                color: #7f1d1d;
                font: inherit;
                font-size: inherit !important;
                line-height: 1.3;
                padding: 1px 2px;
                margin: 0 1px;
                min-height: 1.25em !important;
                height: auto !important;
                min-width: 2mm !important;
                width: 2mm;
                max-width: 100%;
                box-sizing: border-box;
                animation: curia-blank-blink 1.1s ease-in-out infinite;
                field-sizing: content;
            }
            .curia-comp-form input.blank.w3.blank-editable,
            .curia-comp-form input.blank.w4.blank-editable,
            .curia-comp-form input.blank.w6.blank-editable,
            .curia-comp-form input.blank.w10.blank-editable,
            .curia-comp-form input.blank.w20.blank-editable {
                min-width: 2mm !important;
            }
            .curia-comp-form input.blank.blank-editable:placeholder-shown {
                animation: curia-blank-blink 1.1s ease-in-out infinite;
            }
            /* DB·기입된 값: 파란색 / 빈칸: 위 빨간색 깜빡임 */
            .curia-comp-form input.blank.blank-editable:not(:placeholder-shown),
            .curia-comp-form input.blank.blank-editable.has-value {
                animation: none;
                border-bottom-color: #2563eb;
                background: rgba(37, 99, 235, 0.06);
                color: #1d4ed8;
            }
            .curia-comp-form input.blank.blank-editable:focus {
                outline: none;
                animation: none;
                border-bottom-color: #2563eb;
                background: rgba(37, 99, 235, 0.1);
                color: #1d4ed8;
            }
            .curia-comp-form .blank-print {
                border-bottom: 1px solid #333;
                color: #111;
                animation: none !important;
                background: transparent !important;
            }
            .curia-comp-form .line-box.blank-editable {
                border-color: #dc2626;
                background: rgba(220, 38, 38, 0.04);
                color: #7f1d1d;
                outline: none;
                animation: curia-blank-blink 1.1s ease-in-out infinite;
                cursor: text;
            }
            .curia-comp-form .line-box.blank-editable.has-value,
            .curia-comp-form .line-box.blank-editable:focus {
                animation: none;
                border-color: #2563eb;
                color: #1d4ed8;
                background: rgba(37, 99, 235, 0.06);
            }
            .curia-comp-form .line-box.blank-editable:empty::before {
                content: attr(data-placeholder);
                color: #f87171;
                pointer-events: none;
            }
            .curia-comp-form .finance-hint {
                margin: 0 0 8px;
                font-size: 11px;
                color: #444;
            }
            .curia-comp-form .seoul-finance-balance {
                margin: 8px 0 4px;
                font-weight: 700;
                display: flex;
                align-items: baseline;
                gap: 10px;
            }
            .curia-comp-form .seoul-finance-balance .blank {
                flex: 1;
                max-width: 280px;
                text-align: right;
            }
            .curia-comp-form table.form-table.seoul-act1-table th,
            .curia-comp-form table.form-table.seoul-act1-table td {
                font-size: 11px;
                padding: 6px 5px;
                vertical-align: top;
            }
            .curia-comp-form table.form-table.seoul-act1-table td.col-item {
                font-weight: 600;
                width: 18%;
                text-align: center;
                vertical-align: middle;
            }
            .curia-comp-form table.form-table.seoul-act1-table td.col-cnt {
                width: 10%;
                text-align: center;
                vertical-align: middle;
            }
            .curia-comp-form table.form-table.seoul-act1-table td.col-detail {
                text-align: left;
                line-height: 1.55;
            }
            .curia-comp-form .seoul-act-instr {
                margin: 0 0 8px;
                font-size: 11px;
                color: #333;
                line-height: 1.5;
            }
            .curia-comp-form .seoul-act2-box {
                border: 1px solid #333;
                padding: 12px 12px 16px;
                margin: 0 0 12px;
                min-height: 220px;
            }
            .curia-comp-form .seoul-act2-sub {
                font-weight: 700;
                text-decoration: underline;
                text-underline-offset: 3px;
                margin: 0 0 8px;
            }
            .curia-comp-form .seoul-act2-box .seoul-act2-sub:not(:first-child) {
                margin-top: 18px;
            }
            .curia-comp-form .seoul-ops13-box {
                border: 1px solid #333;
                min-height: 280px;
                padding: 10px 12px;
                margin: 0 0 8px;
            }
            .curia-comp-form .seoul-form-footer {
                text-align: right;
                font-size: 11px;
                color: #444;
                margin: 4px 0 10px;
            }
            .curia-comp-form table.form-table.seoul-finance-table th,
            .curia-comp-form table.form-table.seoul-finance-table td {
                font-size: 10.5px;
                padding: 3px 4px;
            }
            .curia-comp-form table.form-table.seoul-finance-table td.cat {
                font-weight: 600;
                background: #fafafa;
            }
            .curia-comp-form table.form-table.seoul-finance-table tr.total-row td {
                font-weight: 700;
                background: #f3f4f6;
            }
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
            .curia-comp-form table.form-table td.hatched {
                background: repeating-linear-gradient(
                    -45deg,
                    #f3f4f6,
                    #f3f4f6 3px,
                    #e5e7eb 3px,
                    #e5e7eb 6px
                );
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
                        <td class="col-cnt">${blank(agg.count > 0 ? n(agg.count) : '', 'w4')}</td>
                        <td class="col-note">${blank(agg.content, 'w20')}</td>
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
        return blank(value > 0 ? n(value) : '', 'w4');
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
                    <td>${blank(p.ratio > 0 ? `${p.ratio}%` : '', 'w4')}</td>
                    <td>${evalNum(row.count)}</td>
                    <td>${evalNum(row.result)}</td>
                    <td>${blank(row.ratio > 0 ? `${row.ratio}%` : '', 'w4')}</td>
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
                            <td>${blank(prevRatioTotal, 'w4')}</td>
                            <td>${evalNum(cur.totalCount)}</td>
                            <td>${evalNum(cur.totalResult)}</td>
                            <td>${blank(curRatioTotal, 'w4')}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="sub-title" style="font-weight:600;">2) 향후 계획</div>
            ${lineBoxHtml(futurePlans || '', '72px')}
        `;
    }

    function buildSpecialNotesHtml(specialNotes) {
        const hint = '산하 Pr의 모범이 될 만한 활동 사례를 육하원칙에 따라 방법·주기(주간/월간)·성과·어려움·문제점·해결방안 중심으로 기록합니다.';
        const text = String(specialNotes || '').trim();
        return `
            <div class="sec-title">12. 특기 사항</div>
            <div class="special-hint">${escapeHtml(hint)}</div>
            ${lineBoxHtml(text, '80px')}
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
        return blank(n(r[key]), 'w4');
    }

    function orgTriple(row, mKey, fKey, tKey) {
        return `
            <td>${mfy(row, mKey)}</td>
            <td>${mfy(row, fKey)}</td>
            <td>${mfy(row, tKey)}</td>
        `;
    }

    function emptyRows(colCount, rowCount) {
        const cols = Array.from({ length: colCount }, () => `<td>${blank('', 'w6')}</td>`).join('');
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

    function buildOrgCompositionRows(org, options) {
        const opts = options || {};
        const includeYouth = opts.includeYouth === true;
        const founded = org.founded || {};
        const previous = org.previous || {};
        const current = org.current || {};
        const change = org.change || {};

        function cellsFor(src, mode) {
            const emptyPair = `<td>${blank('', 'w4')}</td><td>${blank('', 'w4')}</td>`;
            if (mode === 'prAdult') return `${emptyPair}<td>${blank(n(src.pr_adult), 'w4')}</td>`;
            if (mode === 'prYouth') return `${emptyPair}<td>${blank(n(src.pr_youth), 'w4')}</td>`;
            if (mode === 'prJunior') return `${emptyPair}<td>${blank(n(src.pr_junior), 'w4')}</td>`;
            if (mode === 'prTotal') {
                const t = (Number(src.pr_adult) || 0)
                    + (includeYouth ? (Number(src.pr_youth) || 0) : 0)
                    + (Number(src.pr_junior) || 0);
                return `${emptyPair}<td>${blank(t || '', 'w4')}</td>`;
            }
            if (mode === 'activeAdult') return orgTriple(src, 'active_adult_m', 'active_adult_f', 'active_adult_t');
            if (mode === 'activeYouth') return orgTriple(src, 'active_youth_m', 'active_youth_f', 'active_youth_t');
            if (mode === 'activeJunior') return orgTriple(src, 'active_junior_m', 'active_junior_f', 'active_junior_t');
            if (mode === 'activeTotal') {
                const m = (Number(src.active_adult_m) || 0)
                    + (includeYouth ? (Number(src.active_youth_m) || 0) : 0)
                    + (Number(src.active_junior_m) || 0);
                const f = (Number(src.active_adult_f) || 0)
                    + (includeYouth ? (Number(src.active_youth_f) || 0) : 0)
                    + (Number(src.active_junior_f) || 0);
                const t = (Number(src.active_adult_t) || 0)
                    + (includeYouth ? (Number(src.active_youth_t) || 0) : 0)
                    + (Number(src.active_junior_t) || 0);
                return `<td>${blank(m || '', 'w4')}</td><td>${blank(f || '', 'w4')}</td><td>${blank(t || '', 'w4')}</td>`;
            }
            if (mode === 'praetorian') return `${emptyPair}<td>${blank(n(src.praetorian), 'w4')}</td>`;
            if (mode === 'aux') return orgTriple(src, 'aux_m', 'aux_f', 'aux_t');
            if (mode === 'adjutorian') return `${emptyPair}<td>${blank(n(src.adjutorian), 'w4')}</td>`;
            return `${emptyPair}<td>${blank('', 'w4')}</td>`;
        }

        function block(mode) {
            return `${cellsFor(founded, mode)}${cellsFor(previous, mode)}${cellsFor(current, mode)}${cellsFor(change, mode)}`;
        }

        const prRowspan = includeYouth ? 4 : 3;
        const activeRowspan = includeYouth ? 4 : 3;
        const youthPrRow = includeYouth ? `<tr><td>청년</td>${block('prYouth')}</tr>` : '';
        const youthActiveRow = includeYouth ? `<tr><td>청년</td>${block('activeYouth')}</tr>` : '';

        return `
            <tr><td rowspan="${prRowspan}">쁘레시디움</td><td>성인</td>${block('prAdult')}</tr>
            ${youthPrRow}
            <tr><td>소년</td>${block('prJunior')}</tr>
            <tr><td>계</td>${block('prTotal')}</tr>
            <tr><td rowspan="${activeRowspan}">행동단원</td><td>성인</td>${block('activeAdult')}</tr>
            ${youthActiveRow}
            <tr><td>소년</td>${block('activeJunior')}</tr>
            <tr><td>계</td>${block('activeTotal')}</tr>
            <tr><td colspan="2">쁘레또리움단원</td>${block('praetorian')}</tr>
            <tr><td colspan="2">협조단원</td>${block('aux')}</tr>
            <tr><td colspan="2">아듀또리움단원</td>${block('adjutorian')}</tr>
        `;
    }

    function getLoggedInUser() {
        if (global.RegioAdminMenu && typeof global.RegioAdminMenu.getLoggedInUser === 'function') {
            return global.RegioAdminMenu.getLoggedInUser();
        }
        try {
            const raw = sessionStorage.getItem('userInfo') || localStorage.getItem('userInfo');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    async function refreshLoggedInUser() {
        if (global.RegioAuth && typeof global.RegioAuth.refreshLoggedInUserFromServer === 'function') {
            return global.RegioAuth.refreshLoggedInUserFromServer();
        }
        const user = getLoggedInUser();
        if (!user || !user.id) return user;
        try {
            const response = await fetch(`/api/members/${encodeURIComponent(user.id)}`);
            if (!response.ok) return user;
            const row = await response.json();
            if (!row || !row.id) return user;
            const next = {
                ...user,
                church_name: row.church_name != null ? row.church_name : user.church_name,
                curia_name: row.curia_name != null ? row.curia_name : user.curia_name,
                comitia_name: row.comitia_name != null ? row.comitia_name : user.comitia_name,
                regia_name: row.regia_name != null ? row.regia_name : user.regia_name,
                senatus_name: row.senatus_name != null ? row.senatus_name : user.senatus_name,
                pr_name: row.pr_name != null ? row.pr_name : user.pr_name,
                position: row.position != null ? row.position : user.position
            };
            const raw = JSON.stringify(next);
            sessionStorage.setItem('userInfo', raw);
            localStorage.setItem('userInfo', raw);
            return next;
        } catch (e) {
            return user;
        }
    }

    function resolveSenatusName(...candidates) {
        for (const raw of candidates) {
            const s = String(raw == null ? '' : raw).trim();
            if (!s || s === '-' || /미등록/.test(s)) continue;
            if (/대구/.test(s)) return '대구';
            if (/광주/.test(s)) return '광주';
            if (/서울/.test(s)) return '서울';
            if (/^LA$/i.test(s) || /엘에이/.test(s)) return 'LA';
            if (/뉴욕|New\s*York/i.test(s)) return '뉴욕';
            if (/필라델피아|Philadelphia|릴라델피아/i.test(s)) return '필라델피아';
            if (/^세계$/.test(s)) return '세계';
            if (/토론토|토론트|Toronto/i.test(s)) return '토론토';
            if (/몬트리올|Montreal/i.test(s)) return '몬트리올';
            if (/브라질|Brazil/i.test(s)) return '브라질';
            if (/아르헨|Argentina|아르헨티나/i.test(s)) return '아르헨';
            if (/파리|Paris/i.test(s)) return '파리';
            if (/마드리드|Madrid/i.test(s)) return '마드리드';
            if (/바르셀로나|Barcelona/i.test(s)) return '바르셀로나';
            if (/빌바오|Bilbao/i.test(s)) return '빌바오';
            return s;
        }
        return '';
    }

    /** 출력 양식용: 대구·광주만 전용, 그 외(서울·해외 등)는 서울(기본) 양식. 집계는 실제 소속 기준. */
    function formTemplateSenatus(name) {
        const s = resolveSenatusName(name);
        if (s === '대구' || s === '광주') return s;
        return '서울';
    }

    function recordsToActivityTotals(records) {
        const map = new Map();
        (records || []).forEach((rec) => {
            const name = String(rec.category_name || '').trim();
            if (!name) return;
            if (!map.has(name)) {
                map.set(name, {
                    category_name: name,
                    count: 0,
                    catechism_guide: 0,
                    group_join: 0,
                    resolution: 0,
                    sacrament: 0,
                    confirmation: 0,
                    baptism: 0,
                    first_communion: 0,
                    funeral_attendance: 0,
                    funeral_mass: 0,
                    memorial_mass: 0,
                    conditional_baptism: 0,
                    conditional_communion: 0,
                    membership: 0
                });
            }
            const row = map.get(name);
            row.count += Number(rec.count) || 0;
            [
                'catechism_guide', 'group_join', 'resolution', 'sacrament', 'confirmation',
                'baptism', 'first_communion', 'funeral_attendance', 'funeral_mass',
                'memorial_mass', 'conditional_baptism', 'conditional_communion', 'membership'
            ].forEach((k) => {
                row[k] += Number(rec[k]) || 0;
            });
        });
        return Array.from(map.values());
    }

    function sumTotals(totals, matcher, field) {
        const key = field || 'count';
        let sum = 0;
        for (const row of totals || []) {
            const name = String(row.category_name || '');
            if (typeof matcher === 'function' ? matcher(name) : matcher.test(name)) {
                sum += Number(row[key]) || 0;
            }
        }
        return sum > 0 ? sum : '';
    }

    function gwangjuResult(label, value, unit) {
        return `${escapeHtml(label)} ${blank(value, 'w4')}${unit ? ` ${escapeHtml(unit)}` : ''}`;
    }

    function computeGwangjuCompActivity(records) {
        const totals = recordsToActivityTotals(records);
        return {
            evangelism: sumTotals(totals, (n) => /복음선교|입교권면|외인|가두선교|교리반|통신교리|예비/.test(n) && !/교우|성사권유|상가|병자/.test(n)),
            catechismLead: sumTotals(totals, (n) => /교리반/.test(n), 'catechism_guide')
                || sumTotals(totals, (n) => /교리반\s*인도|교리반인도/.test(n)),
            baptized: sumTotals(totals, (n) => /예비신자|예비자|세례|영세/.test(n), 'baptism')
                || sumTotals(totals, (n) => /세례자|영세/.test(n)),
            selfIntro: sumTotals(totals, (n) => /자기소개서|소개서/.test(n)),
            believerCare: sumTotals(totals, (n) =>
                /교우\s*돌봄|교우방문|냉담|성사권유|혼인장애|회두|판공|견진|유아세례|상가|병자|영세자\s*방문|첫\s*영성체/.test(n)),
            groupJoin: sumTotals(totals, (n) => /단체\s*가입|단체가입/.test(n), 'group_join')
                || sumTotals(totals, (n) => /단체\s*가입|단체가입/.test(n)),
            conversion: sumTotals(totals, (n) => /회두|개종/.test(n)),
            marriageFix: sumTotals(totals, (n) => /혼인장애/.test(n), 'resolution')
                || sumTotals(totals, (n) => /혼인장애/.test(n)),
            confession: sumTotals(totals, (n) => /판공|고해/.test(n), 'sacrament')
                || sumTotals(totals, (n) => /판공|고해/.test(n)),
            confirmation: sumTotals(totals, (n) => /견진/.test(n), 'confirmation')
                || sumTotals(totals, (n) => /견진/.test(n)),
            infantBaptism: sumTotals(totals, (n) => /유아세례/.test(n), 'baptism')
                || sumTotals(totals, (n) => /유아세례/.test(n)),
            yeondo: sumTotals(totals, (n) => /연도|위령기도/.test(n)),
            funeralMass: sumTotals(totals, (n) => /장례미사|고별식/.test(n), 'funeral_mass')
                || sumTotals(totals, (n) => /장례미사|고별식/.test(n)),
            funeralOther: sumTotals(totals, (n) => /상가|장례수행|장지/.test(n)),
            neighborCare: sumTotals(totals, (n) => /이웃\s*돌봄|비신자|병원|복지|재난|사고/.test(n)),
            conditionalBaptism: sumTotals(totals, (n) => /대세/.test(n), 'conditional_baptism')
                || sumTotals(totals, (n) => /대세/.test(n)),
            baptismComplete: sumTotals(totals, (n) => /보례/.test(n)),
            expansion: sumTotals(totals, (n) => /행동단원\s*모집|협조단원\s*모집|유년|확장|입단권면|회원모집|Pr설립/.test(n)),
            activeRecruit: sumTotals(totals, (n) => /행동단원\s*모집|입단권면/.test(n), 'membership')
                || sumTotals(totals, (n) => /행동단원\s*모집|입단권면/.test(n)),
            auxRecruit: sumTotals(totals, (n) => /협조단원\s*모집/.test(n), 'membership')
                || sumTotals(totals, (n) => /협조단원\s*모집/.test(n)),
            parishOps: sumTotals(totals, (n) => /본당|주일학교|전례|호구조사|청소|차량|교통|소공동체/.test(n)),
            parishVisit: sumTotals(totals, (n) => /호구조사|면담|방문조사/.test(n)),
            otherAct: sumTotals(totals, (n) => /간행물|배포|생태|환경|자연보호|생명존중|가정성화|기타활동|기타사목/.test(n)),
            weekdayMass: sumTotals(totals, (n) => /평일미사/.test(n)),
            rosary: sumTotals(totals, (n) => /묵주기도/.test(n)),
            stations: sumTotals(totals, (n) => /십자가의\s*길|십자가의길/.test(n)),
            bible: sumTotals(totals, (n) => /성경|봉독|필사|통독/.test(n)),
            littleOffice: sumTotals(totals, (n) => /소성무일도|성무일도/.test(n)),
            spiritualOther: sumTotals(totals, (n) => /프랭크|더프|시복|지향기도/.test(n)),
            prayerSpirit: sumTotals(totals, (n) => /기도|묵주|미사|성경|십자가|성무/.test(n)),
            careCombo: sumTotals(totals, (n) => /교우|이웃|돌봄|상가|병자|병원/.test(n))
        };
    }

    /** 대구 꾸리아 종합보고 활동 세목 집계 */
    function computeDaeguCompActivity(records) {
        const totals = recordsToActivityTotals(records);
        return {
            neighbor: sumTotals(totals, (n) => /가톨릭|가두선교|외인|개종|방문|복음선교/.test(n) && !/예비|교리반/.test(n)),
            catechismLead: sumTotals(totals, (n) => /교리반\s*인도|교리반인도/.test(n))
                || sumTotals(totals, (n) => /교리반/.test(n), 'catechism_guide'),
            catechumen: sumTotals(totals, (n) => /예비신자|예비자/.test(n)),
            baptized: sumTotals(totals, (n) => /예비신자|예비자|세례|영세/.test(n), 'baptism')
                || sumTotals(totals, (n) => /세례자|영세/.test(n)),
            familyCare: sumTotals(totals, (n) => /가정|교우\s*돌봄|교우방문|가정을/.test(n)),
            groupJoin: sumTotals(totals, (n) => /단체\s*가입|단체가입/.test(n), 'group_join')
                || sumTotals(totals, (n) => /단체\s*가입|단체가입/.test(n)),
            sacramentInvite: sumTotals(totals, (n) => /성사권유|혼인장애|회두|판공|견진|유아세례/.test(n)),
            conversion: sumTotals(totals, (n) => /회두|개종/.test(n)),
            confession: sumTotals(totals, (n) => /판공|고해/.test(n), 'sacrament')
                || sumTotals(totals, (n) => /판공|고해/.test(n)),
            confirmation: sumTotals(totals, (n) => /견진/.test(n), 'confirmation')
                || sumTotals(totals, (n) => /견진/.test(n)),
            infantBaptism: sumTotals(totals, (n) => /유아세례/.test(n), 'baptism')
                || sumTotals(totals, (n) => /유아세례/.test(n)),
            marriageFix: sumTotals(totals, (n) => /혼인장애/.test(n), 'resolution')
                || sumTotals(totals, (n) => /혼인장애/.test(n)),
            neighborShare: sumTotals(totals, (n) => /상가|위령|장례|병자|봉성체|대세|보례|병원|복지|어려움/.test(n)),
            funeralVisit: sumTotals(totals, (n) => /상가/.test(n))
                || sumTotals(totals, (n) => /상가/.test(n), 'funeral_attendance'),
            memorialPrayer: sumTotals(totals, (n) => /위령기도|위령미사|보미사|연도/.test(n))
                || sumTotals(totals, (n) => /위령|보미사/.test(n), 'memorial_mass'),
            funeralMass: sumTotals(totals, (n) => /장례미사/.test(n), 'funeral_mass')
                || sumTotals(totals, (n) => /장례미사/.test(n)),
            burialEscort: sumTotals(totals, (n) => /장지|장례수행|장지수행/.test(n)),
            anointing: sumTotals(totals, (n) => /병자성사/.test(n)),
            sickCommunion: sumTotals(totals, (n) => /봉성체/.test(n), 'conditional_communion')
                || sumTotals(totals, (n) => /봉성체/.test(n)),
            conditionalBaptism: sumTotals(totals, (n) => /대세/.test(n), 'conditional_baptism')
                || sumTotals(totals, (n) => /대세/.test(n)),
            baptismComplete: sumTotals(totals, (n) => /보례/.test(n)),
            hospital: sumTotals(totals, (n) => /병원|복지시설|복지/.test(n)),
            shareOther: sumTotals(totals, (n) => /나눔|돌봄-기타/.test(n)),
            parishOps: sumTotals(totals, (n) => /본당|주일학교|전례|사도직|호구조사|청소|차량/.test(n) && !/첫\s*영성체/.test(n)),
            firstCommunionLead: sumTotals(totals, (n) => /첫\s*영성체/.test(n)),
            firstCommunionBaptism: sumTotals(totals, (n) => /첫\s*영성체/.test(n), 'baptism')
                || sumTotals(totals, (n) => /첫\s*영성체/.test(n), 'first_communion'),
            parishCatechism: sumTotals(totals, (n) => /교리반/.test(n), 'catechism_guide')
                || sumTotals(totals, (n) => /교리반\s*인도|교리반인도/.test(n)),
            legionGrow: sumTotals(totals, (n) => /행동단원\s*모집|협조단원\s*모집|Pr설립|레지오활동|입단권면/.test(n)),
            activeRecruit: sumTotals(totals, (n) => /행동단원\s*모집|입단권면/.test(n), 'membership')
                || sumTotals(totals, (n) => /행동단원\s*모집|입단권면/.test(n)),
            auxRecruit: sumTotals(totals, (n) => /협조단원\s*모집/.test(n), 'membership')
                || sumTotals(totals, (n) => /협조단원\s*모집/.test(n)),
            smallCommunity: sumTotals(totals, (n) => /소공동체/.test(n)),
            nature: sumTotals(totals, (n) => /자연보호|생태|환경|생명존중|헌혈/.test(n)),
            higherCouncil: sumTotals(totals, (n) => /성경|복음묵상|필사|빛잡지|성모님의\s*군단|미사|상급|묵주/.test(n)),
            bibleRead: sumTotals(totals, (n) => /성경통독|성경\s*통독|성경읽기/.test(n)),
            gospelMeditation: sumTotals(totals, (n) => /복음묵상|미사\s*전\s*독서|독서.*복음/.test(n)),
            bibleWrite: sumTotals(totals, (n) => /성경필사|성경\s*쓰기|필사/.test(n)),
            magazine: sumTotals(totals, (n) => /성모님의\s*군단|빛잡지|빛\s*잡지/.test(n)),
            meetingMass: sumTotals(totals, (n) => /주회\s*전후\s*미사|주회합.*미사/.test(n)),
            weekdayMass: sumTotals(totals, (n) => /평일미사/.test(n)),
            higherOther: sumTotals(totals, (n) => /상급평의회\s*지시|상급.*지시/.test(n)),
            rosary: sumTotals(totals, (n) => /묵주기도/.test(n)),
            otherAct: sumTotals(totals, (n) => /기타활동|기타사목|특별활동/.test(n))
        };
    }

    function daeguResult(label, value, unit) {
        return `${escapeHtml(label)} ${blank(value, 'w4')}${unit ? ` ${escapeHtml(unit)}` : ''}`;
    }

    function daeguEventLineHtml(label, event) {
        const ev = event || {};
        return `
            <div style="margin:4px 0 8px;">
                ${escapeHtml(label)} —
                일시 ${blank(ev.datetime || ev.date || '', 'w10')}
                &nbsp; 장소 ${blank(ev.place || '', 'w10')}
                &nbsp; 참가인원 ${blank(ev.attendance || ev.attendees || '', 'w4')}
            </div>
        `;
    }

    function firstMatchedEvent(events, labels) {
        const list = matchEventsByLabels(events, labels);
        return list[0] || {};
    }

    function matchEventsByLabels(events, labels) {
        const list = Array.isArray(events) ? events : [];
        const lower = labels.map((l) => String(l).toLowerCase());
        return list.filter((ev) => {
            const blob = `${ev.title || ''} ${ev.content || ''}`.toLowerCase();
            return lower.some((lb) => blob.includes(lb));
        });
    }

    function buildGwangjuEduRowsHtml(rows, minRows) {
        const list = Array.isArray(rows) ? rows : [];
        const html = list.map((r) => `
            <tr>
                <td class="left">${blank(r.title, 'w10')}</td>
                <td>${blank(r.datetime || '20  .  .  .', 'w8')}</td>
                <td>${blank(r.place, 'w8')}</td>
                <td>${blank(r.target, 'w6')}</td>
                <td>${blank(r.attendance, 'w4')}</td>
                <td class="left">${blank(r.lecturer || r.content || '', 'w12')}</td>
            </tr>
        `).join('');
        const need = Math.max(0, minRows - list.length);
        return html + (need ? emptyRows(6, need) : '');
    }

    function buildGwangjuEducationTablesHtml(events) {
        const ev = events || {};
        return `
            <div class="sec-title">9. 교육 실시사항
                <span style="font-weight:400;font-size:11px;">(조회 기간 내 산하 Pr 실시 · 수정·추가 가능)</span>
            </div>
            <div class="org-table-wrap">
                <table class="form-table edu-table">
                    <thead>
                        <tr>
                            <th>교육 명칭</th>
                            <th>실시일</th>
                            <th>장소</th>
                            <th>대상</th>
                            <th>참석인원</th>
                            <th>내용</th>
                        </tr>
                    </thead>
                    <tbody>${buildGwangjuEduRowsHtml(ev.education_events, 7)}</tbody>
                </table>
            </div>

            <div class="sec-title">10. 피정 실시사항
                <span style="font-weight:400;font-size:11px;">(조회 기간 내 산하 Pr 실시 · 수정·추가 가능)</span>
            </div>
            <div class="org-table-wrap">
                <table class="form-table edu-table">
                    <thead>
                        <tr>
                            <th>피정 명칭</th>
                            <th>실시일</th>
                            <th>장소</th>
                            <th>대상</th>
                            <th>참석인원</th>
                            <th>내용</th>
                        </tr>
                    </thead>
                    <tbody>${buildGwangjuEduRowsHtml(ev.retreat_events, 5)}</tbody>
                </table>
            </div>
        `;
    }

    function gwangjuEventTableHtml(title, dateHeader, rows, minRows, placeHint) {
        const list = Array.isArray(rows) ? rows.slice() : [];
        while (list.length < minRows) list.push({});
        const body = list.slice(0, Math.max(minRows, rows?.length || 0)).map((ev) => `
            <tr>
                <td>${blank(ev.datetime || ev.date || '20  .  .  .', 'w8')}</td>
                <td>${blank(ev.place || placeHint || '', 'w8')}</td>
                <td>${blank(ev.organizer || ev.host || '', 'w8')}</td>
                <td>${blank(ev.attendance || ev.attendees || '', 'w4')}</td>
            </tr>
        `).join('');
        return `
            <div class="sub-title" style="font-weight:600;">${escapeHtml(title)}</div>
            <div class="org-table-wrap">
                <table class="form-table">
                    <thead>
                        <tr>
                            <th>${escapeHtml(dateHeader)}</th>
                            <th>장 소</th>
                            <th>주관 평의회</th>
                            <th>참석인원(명)</th>
                        </tr>
                    </thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
        `;
    }

    function buildGwangjuSection14Html(model) {
        const roster = model.roster || {};
        const stats = roster.curia_stats || {};
        const officers = Array.isArray(roster.officers) ? roster.officers : [];
        const byRole = (role) => officers.find((o) => o.role === role) || {};
        const praesidia = Array.isArray(roster.praesidia) ? roster.praesidia : [];

        const officerCols = ['단장', '부단장', '서기', '회계'].map((role) => {
            const o = byRole(role);
            return `<td>${blank(o.name, 'w6')}<br>${blank(o.elected_on, 'w6')}</td>`;
        }).join('');

        let prRows = '';
        const minPr = Math.max(praesidia.length, 8);
        for (let i = 0; i < minPr; i += 1) {
            const pr = praesidia[i] || {};
            const off = pr.officers || {};
            const g = (role) => off[role] || {};
            prRows += `<tr>
                <td class="left">${blank(pr.pr_name ? `${pr.pr_name}${pr.founded_on ? ` (${pr.founded_on})` : ''}` : '', 'w12')}</td>
                <td>${blank(pr.meeting_weekday, 'w3')}</td>
                <td>${blank(pr.meeting_time_place, 'w8')}</td>
                <td>${blank([g('단장').baptism_name || g('단장').name, g('단장').appointed_on].filter(Boolean).join(' '), 'w8')}</td>
                <td>${blank([g('부단장').baptism_name || g('부단장').name, g('부단장').appointed_on].filter(Boolean).join(' '), 'w8')}</td>
                <td>${blank([g('서기').baptism_name || g('서기').name, g('서기').appointed_on].filter(Boolean).join(' '), 'w8')}</td>
                <td>${blank([g('회계').baptism_name || g('회계').name, g('회계').appointed_on].filter(Boolean).join(' '), 'w8')}</td>
                <td>${blank(pr.active_m, 'w3')}</td>
                <td>${blank(pr.active_f, 'w3')}</td>
                <td>${blank(pr.aux_m, 'w3')}</td>
                <td>${blank(pr.aux_f, 'w3')}</td>
            </tr>`;
        }

        return `
            <div class="sec-title">14. 조직 현황 및 간부 명단</div>
            <div class="sub-title">가. 꾸리아 조직 현황</div>
            <div class="org-table-wrap">
                <table class="form-table">
                    <thead>
                        <tr>
                            <th rowspan="2">순번</th>
                            <th rowspan="2">호도명</th>
                            <th rowspan="2">본당</th>
                            <th rowspan="2">Pr. 수</th>
                            <th colspan="4">행동단원</th>
                            <th colspan="4">협조단원</th>
                        </tr>
                        <tr>
                            <th>남</th><th>여</th><th>계</th><th>쁘레또리움</th>
                            <th>남</th><th>여</th><th>계</th><th>아듀또리움</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>1</td>
                            <td>${blank(model.curia_name, 'w10')}</td>
                            <td>${blank(stats.church_name || model.church_name, 'w8')}</td>
                            <td>${blank(stats.pr_count, 'w4')}</td>
                            <td>${blank(stats.active_m, 'w3')}</td>
                            <td>${blank(stats.active_f, 'w3')}</td>
                            <td>${blank(stats.active_t, 'w3')}</td>
                            <td>${blank(stats.praetorian, 'w3')}</td>
                            <td>${blank(stats.aux_m, 'w3')}</td>
                            <td>${blank(stats.aux_f, 'w3')}</td>
                            <td>${blank(stats.aux_t, 'w3')}</td>
                            <td>${blank(stats.adjutorian, 'w3')}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="sub-title">나. 꾸리아 간부 현황</div>
            <div class="org-table-wrap">
                <table class="form-table">
                    <thead>
                        <tr>
                            <th>순번</th>
                            <th>본당</th>
                            <th>호도명 설립일</th>
                            <th>회합 요일</th>
                            <th>시간 장소</th>
                            <th>단장<br>선출일</th>
                            <th>부단장<br>선출일</th>
                            <th>서기<br>선출일</th>
                            <th>회계<br>선출일</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>1</td>
                            <td>${blank(stats.church_name || model.church_name, 'w8')}</td>
                            <td>${blank([model.curia_name, stats.founded_on].filter(Boolean).join(' '), 'w12')}</td>
                            <td>${blank(stats.meeting_weekday || (model.meeting || {}).weekday, 'w4')}</td>
                            <td>${blank(stats.meeting_time_place || (model.meeting || {}).place, 'w10')}</td>
                            ${officerCols}
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="sub-title">다. 직속 쁘레시디움 현황</div>
            <div class="org-table-wrap">
                <table class="form-table">
                    <thead>
                        <tr>
                            <th rowspan="2">호도명 (설립일)</th>
                            <th colspan="2">회합</th>
                            <th rowspan="2">단장<br>세례명 승인일</th>
                            <th rowspan="2">부단장<br>세례명 승인일</th>
                            <th rowspan="2">서기<br>세례명 승인일</th>
                            <th rowspan="2">회계<br>세례명 승인일</th>
                            <th colspan="2">행동단원</th>
                            <th colspan="2">협조단원</th>
                        </tr>
                        <tr>
                            <th>요일</th><th>시간 장소</th>
                            <th>남</th><th>여</th>
                            <th>남</th><th>여</th>
                        </tr>
                    </thead>
                    <tbody>${prRows}</tbody>
                </table>
            </div>
        `;
    }

    /** 광주 세나뚜스 평의회 종합보고서 양식 */
    function buildGwangjuFormHtml(model) {
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
            if (role === '영적지도자') return `<td>${blank('', 'w6')}</td>`;
            return `<td>${cell(officerMap[role].attendance || '', 'w6')} %</td>`;
        }).join('');

        const org = m.organization || {};
        const a = computeGwangjuCompActivity(m.activityRecords || []);
        const aPrev = computeGwangjuCompActivity(m.evalPrevious || []);
        const ev = m.events || {};
        const legionAll = [].concat(ev.legion_events || [], ev.other_events || []);
        const acies = matchEventsByLabels(legionAll, ['아치에스']);
        const annual = matchEventsByLabels(legionAll, ['연차', '총친목', '총 친목']);
        const outdoor = matchEventsByLabels(legionAll, ['야외']);
        const maryNight = matchEventsByLabels(ev.other_events || legionAll, ['성모의 밤', '성모의밤']);
        const o = m.ops || {};

        const orgCur = org.current || {};
        const orgPrev = org.previous || {};
        const prCurr = (Number(orgCur.pr_adult) || 0) + (Number(orgCur.pr_junior) || 0) || '';
        const prPrev = (Number(orgPrev.pr_adult) || 0) + (Number(orgPrev.pr_junior) || 0) || '';
        const activeCurr = (Number(orgCur.active_adult_t) || 0) + (Number(orgCur.active_junior_t) || 0) || orgCur.active_adult_t || '';
        const activePrev = (Number(orgPrev.active_adult_t) || 0) + (Number(orgPrev.active_junior_t) || 0) || '';
        const auxCurr = orgCur.aux_t || '';
        const auxPrev = orgPrev.aux_t || '';

        function delta(c, p) {
            const cn = Number(c);
            const pn = Number(p);
            if (!Number.isFinite(cn) || !Number.isFinite(pn)) return '';
            return String(cn - pn);
        }

        return `
            <div class="curia-comp-form curia-comp-gwangju" id="curiaComprehensiveFormPrint">
                <div class="form-title">
                    ${blank(m.curia_name, 'w12')} 레지아 / 꼬미씨움 / 꾸리아
                    제 ${blank(m.report_seq, 'w4')} 차 종합 보고서
                </div>
                <ol class="info-list">
                    <li>1. 승인일: ${blank(m.approved_y || m.founded_y, 'w4')} 년 ${blank(m.approved_m || m.founded_m, 'w3')} 월 ${blank(m.approved_d || m.founded_d, 'w3')} 일</li>
                    <li>2. 보고 기간:
                        ${blank(start?.y, 'w4')} 년 ${blank(start?.m, 'w3')} 월 ${blank(start?.d, 'w3')} 일(${blank(m.meeting_from, 'w3')}차)
                        ~
                        ${blank(end?.y, 'w4')} 년 ${blank(end?.m, 'w3')} 월 ${blank(end?.d, 'w3')} 일(${blank(m.meeting_to, 'w3')}차)
                    </li>
                    <li>3. 회합 일시: 매월 ${blank(meeting.weekday, 'w4')}요일 ${blank(meeting.hour, 'w3')}시 ${blank(meeting.minute, 'w3')}분</li>
                    <li>4. 회합 장소: 천주교 ${blank(m.church_name || m.roster?.curia_stats?.church_name, 'w8')} 성당 ${blank(meeting.place, 'w10')}</li>
                    <li>5. 조직 현황</li>
                </ol>

                <div class="sub-title">가. 간부 구성</div>
                <div class="org-table-wrap">
                    <table class="form-table">
                        <thead>
                            <tr>
                                <th style="width:16%"></th>
                                <th>영적 지도신부</th><th>단장</th><th>부단장</th><th>서기</th><th>회계</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td>성명</td>${nameRow}</tr>
                            <tr><td>세례명</td>${baptismRow}</tr>
                            <tr><td>간부 선출일</td>${electedRow}</tr>
                            <tr><td>상급평의회 출석률</td>${attendRow}</tr>
                        </tbody>
                    </table>
                </div>

                <div class="sub-title">나. 조직 구성 현황</div>
                <div class="org-table-wrap">
                    <table class="form-table">
                        <thead>
                            <tr>
                                <th rowspan="2" colspan="2">구분</th>
                                <th colspan="3">설립 시</th>
                                <th colspan="3">전차 보고서</th>
                                <th colspan="3">현재</th>
                                <th colspan="3">증감</th>
                            </tr>
                            <tr>
                                <th>남</th><th>여</th><th>계</th>
                                <th>남</th><th>여</th><th>계</th>
                                <th>남</th><th>여</th><th>계</th>
                                <th>남</th><th>여</th><th>계</th>
                            </tr>
                        </thead>
                        <tbody>${buildOrgCompositionRows(org)}</tbody>
                    </table>
                </div>

                ${buildMovementTablesHtml(m.movement)}

                <div class="sec-title">6. 운영 및 관리 현황</div>
                <div>
                    가. 출석률 — 간부 ${blank(o.attendance_officer, 'w4')} %
                    &nbsp; 평의원 ${blank(o.attendance_councilor, 'w4')} %
                    &nbsp; 전체 ${blank(o.attendance_total, 'w4')} %
                </div>
                <div style="margin-top:6px;">
                    나. 통신 교환 — 수신 ${blank(o.mail_in, 'w4')} 건
                    &nbsp; 발신 ${blank(o.mail_out, 'w4')} 건
                </div>
                <div class="sub-title">다. 방문</div>
                ${lineBoxHtml(o.visit_pr || '', '36px')}
                <div class="sub-title">라. 기타</div>
                ${lineBoxHtml('', '36px')}

                <div class="sec-title">7. 회계 보고 (단위: 원)</div>
                <div class="org-table-wrap">
                    <table class="form-table">
                        <thead>
                            <tr>
                                <th colspan="2">수입</th>
                                <th colspan="3">지출</th>
                                <th rowspan="2">잔액</th>
                            </tr>
                            <tr>
                                <th>항목</th><th>금액</th>
                                <th>항목</th><th>세목</th><th>금액</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td class="left">이월금</td><td>${blank('', 'w6')}</td><td class="left" rowspan="2">상급 의연금</td><td class="left">세나뚜스</td><td>${blank('', 'w6')}</td><td rowspan="12">${blank('', 'w8')}</td></tr>
                            <tr><td class="left">의연금</td><td>${blank('', 'w6')}</td><td class="left">꼬미씨움</td><td>${blank('', 'w6')}</td></tr>
                            <tr><td class="left">Pr. 의연금</td><td>${blank('', 'w6')}</td><td class="left" rowspan="3">관리 운영비</td><td class="left">비품비</td><td>${blank('', 'w6')}</td></tr>
                            <tr><td class="left">교육 행사비</td><td>${blank('', 'w6')}</td><td class="left">성모님의 군단</td><td>${blank('', 'w6')}</td></tr>
                            <tr><td class="left">기타</td><td>${blank('', 'w6')}</td><td class="left">성물 구입비</td><td>${blank('', 'w6')}</td></tr>
                            <tr><td class="left">${blank('', 'w8')}</td><td>${blank('', 'w6')}</td><td class="left" rowspan="2">회의비</td><td class="left">간부 회의비</td><td>${blank('', 'w6')}</td></tr>
                            <tr><td class="left">${blank('', 'w8')}</td><td>${blank('', 'w6')}</td><td class="left">월례 회의비</td><td>${blank('', 'w6')}</td></tr>
                            <tr><td class="left"><strong>합계</strong></td><td>${blank('', 'w6')}</td><td class="left" rowspan="2">교육 행사비</td><td class="left">교육비</td><td>${blank('', 'w6')}</td></tr>
                            <tr><td colspan="2"></td><td class="left">행사비</td><td>${blank('', 'w6')}</td></tr>
                            <tr><td colspan="2"></td><td class="left" rowspan="2">여비, 기타</td><td class="left">교통비</td><td>${blank('', 'w6')}</td></tr>
                            <tr><td colspan="2"></td><td class="left">잡비</td><td>${blank('', 'w6')}</td></tr>
                            <tr><td colspan="2"></td><td class="left" colspan="2"><strong>합계</strong></td><td>${blank('', 'w6')}</td></tr>
                        </tbody>
                    </table>
                </div>

                <div class="sec-title">8. 행사</div>
                <div class="sub-title">가. 레지오 행사</div>
                ${gwangjuEventTableHtml('1) 아치에스', '일 시', acies, 5, '성당')}
                ${gwangjuEventTableHtml('2) 연차 총 친목회', '실시일', annual, 5, '성당')}
                ${gwangjuEventTableHtml('3) 야외 행사', '실시일', outdoor, 5, '성당')}
                <div style="margin:6px 0 10px;">4) 쁘레시디움 친목회 — 복되신 동정 마리아 성탄축일(9월 8일) 전후 쁘레시디움 별로 실시</div>
                <div class="sub-title">나. 기타 행사</div>
                ${gwangjuEventTableHtml('1) 성모의 밤', '실시일', maryNight, 5, '')}
                <div style="margin:6px 0 10px;">2) 위령 미사와 묘지 참배 — 11월 위령성월에 쁘레시디움 별로 실시</div>

                ${buildGwangjuEducationTablesHtml(m.events)}

                <div class="sec-title">11. 활동 상황
                    <span style="font-weight:400;font-size:11px;">(대표 예시 · 수정·추가 가능 · 산하 회원 집계)</span>
                </div>
                <div class="org-table-wrap">
                    <table class="form-table">
                        <thead>
                            <tr><th>종목</th><th>활동 횟수</th><th>활동 내용</th><th>결과</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>복음선교</td>
                                <td>${blank(a.evangelism, 'w4')}</td>
                                <td class="left">외인 입교권면, 교리중단자 권면, 가두선교, 교리반 인도, 통신교리, 교리반 봉사</td>
                                <td class="left">
                                    ${gwangjuResult('교리반 인도', a.catechismLead, '명')}<br>
                                    ${gwangjuResult('영세자', a.baptized, '명')}<br>
                                    ${gwangjuResult('자기소개서', a.selfIntro, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td>교우 돌봄</td>
                                <td>${blank(a.believerCare, 'w4')}</td>
                                <td class="left">새영세자·냉담자·교우가정·혼인장애 방문, 성사권유, 상가·병자 돌봄</td>
                                <td class="left">
                                    ${gwangjuResult('단체 가입', a.groupJoin, '명')}<br>
                                    ${gwangjuResult('회두', a.conversion, '명')}<br>
                                    ${gwangjuResult('혼인장애 해소', a.marriageFix, '명')}<br>
                                    ${gwangjuResult('판공', a.confession, '명')}<br>
                                    ${gwangjuResult('견진', a.confirmation, '명')}<br>
                                    ${gwangjuResult('유아세례', a.infantBaptism, '명')}<br>
                                    ${gwangjuResult('연도', a.yeondo, '명')}<br>
                                    ${gwangjuResult('장례미사', a.funeralMass, '명')}<br>
                                    ${gwangjuResult('기타 장례', a.funeralOther, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td>이웃 돌봄</td>
                                <td>${blank(a.neighborCare, 'w4')}</td>
                                <td class="left">비신자 병자·상가 방문, 병원·복지시설, 재난·사고 피해자 돌봄</td>
                                <td class="left">
                                    ${gwangjuResult('대세자', a.conditionalBaptism, '명')}<br>
                                    ${gwangjuResult('보례자', a.baptismComplete, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td>확장</td>
                                <td>${blank(a.expansion, 'w4')}</td>
                                <td class="left">행동·협조단원 모집, 유년단 설립·돌봄</td>
                                <td class="left">
                                    ${gwangjuResult('행동단원 입단', a.activeRecruit, '명')}<br>
                                    ${gwangjuResult('협조단원 입단', a.auxRecruit, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td>본당 협조</td>
                                <td>${blank(a.parishOps, 'w4')}</td>
                                <td class="left">행사 협조, 호구조사, 주일학교·전례, 청소, 차량, 소공동체</td>
                                <td class="left">${gwangjuResult('면담', a.parishVisit, '호')}</td>
                            </tr>
                            <tr>
                                <td>기타</td>
                                <td>${blank(a.otherAct, 'w4')}</td>
                                <td class="left">간행물 배포, 생태·환경, 생명존중, 가정성화</td>
                                <td class="left">${blank('', 'w8')}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="sec-title">영성 생활</div>
                <div class="org-table-wrap">
                    <table class="form-table">
                        <tbody>
                            <tr><th style="width:22%">평일 미사</th><td class="left">평일미사 참석</td><td>${blank(a.weekdayMass, 'w4')} 회</td></tr>
                            <tr><th>묵주 기도</th><td class="left">상급평의회 지시 지향</td><td>${blank(a.rosary, 'w4')} 단</td></tr>
                            <tr><th>십자가의 길</th><td class="left">개인 또는 단체</td><td>${blank(a.stations, 'w4')} 회</td></tr>
                            <tr>
                                <th>성경 봉독, 쓰기</th>
                                <td class="left">봉독 ${blank('', 'w3')}/${blank('', 'w3')} · 필사 ${blank('', 'w3')}/${blank('', 'w3')}</td>
                                <td>${blank(a.bible, 'w4')} 분</td>
                            </tr>
                            <tr><th>소성무일도</th><td class="left">봉헌 횟수</td><td>${blank(a.littleOffice, 'w4')} 회</td></tr>
                            <tr><th>기 타</th><td class="left">프랭크 더프 시복 기원 등</td><td>${blank(a.spiritualOther, 'w4')} 회</td></tr>
                        </tbody>
                    </table>
                </div>

                <div class="sec-title">12. 평가 및 향후 계획</div>
                <div class="sub-title">가. 현황분석</div>
                <div class="sub-title" style="font-weight:600;">1) 조직 현황</div>
                <div class="org-table-wrap">
                    <table class="form-table">
                        <thead>
                            <tr><th>구분</th><th>꾸리아</th><th>쁘레시디움</th><th>행동단원</th><th>협조단원</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>전차(제 ${blank('', 'w3')} 차)</td>
                                <td>${blank('1', 'w4')}</td>
                                <td>${blank(prPrev, 'w4')}</td>
                                <td>${blank(activePrev, 'w4')}</td>
                                <td>${blank(auxPrev, 'w4')}</td>
                            </tr>
                            <tr>
                                <td>현재(제 ${blank(m.report_seq, 'w3')} 차)</td>
                                <td>${blank('1', 'w4')}</td>
                                <td>${blank(prCurr, 'w4')}</td>
                                <td>${blank(activeCurr, 'w4')}</td>
                                <td>${blank(auxCurr, 'w4')}</td>
                            </tr>
                            <tr>
                                <td>증감</td>
                                <td>${blank('', 'w4')}</td>
                                <td>${blank(delta(prCurr, prPrev), 'w4')}</td>
                                <td>${blank(delta(activeCurr, activePrev), 'w4')}</td>
                                <td>${blank(delta(auxCurr, auxPrev), 'w4')}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="sub-title" style="font-weight:600;">2) 활동 현황</div>
                <div class="org-table-wrap">
                    <table class="form-table">
                        <thead>
                            <tr>
                                <th>구분</th>
                                <th>기도 영성</th>
                                <th>복음 선교</th>
                                <th>교우/이웃 돌봄</th>
                                <th>레지오 확장</th>
                                <th>본당 협조</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>전차</td>
                                <td>${blank(aPrev.prayerSpirit, 'w4')}</td>
                                <td>${blank(aPrev.evangelism, 'w4')}</td>
                                <td>${blank(aPrev.careCombo, 'w4')}</td>
                                <td>${blank(aPrev.expansion, 'w4')}</td>
                                <td>${blank(aPrev.parishOps, 'w4')}</td>
                            </tr>
                            <tr>
                                <td>현재</td>
                                <td>${blank(a.prayerSpirit, 'w4')}</td>
                                <td>${blank(a.evangelism, 'w4')}</td>
                                <td>${blank(a.careCombo, 'w4')}</td>
                                <td>${blank(a.expansion, 'w4')}</td>
                                <td>${blank(a.parishOps, 'w4')}</td>
                            </tr>
                            <tr>
                                <td>증감</td>
                                <td>${blank(delta(a.prayerSpirit, aPrev.prayerSpirit), 'w4')}</td>
                                <td>${blank(delta(a.evangelism, aPrev.evangelism), 'w4')}</td>
                                <td>${blank(delta(a.careCombo, aPrev.careCombo), 'w4')}</td>
                                <td>${blank(delta(a.expansion, aPrev.expansion), 'w4')}</td>
                                <td>${blank(delta(a.parishOps, aPrev.parishOps), 'w4')}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="sub-title" style="font-weight:600;">3) 평가</div>
                <div>전차년도 계획</div>
                ${lineBoxHtml('', '48px')}
                <div style="margin-top:6px;">전차년도 계획에 따른 결과</div>
                ${lineBoxHtml('', '48px')}
                <div class="sub-title">나. 향후 계획</div>
                <div>1) 조직</div>
                ${lineBoxHtml(m.futurePlans || '', '56px')}
                <div style="margin-top:6px;">2) 활동</div>
                ${lineBoxHtml('', '56px')}

                <div class="sec-title">13. 특기 사항</div>
                <div class="special-hint">
                    ※ 특기사항 작성 시 유의사항<br>
                    · 1년간 평의회 운영 중 어려움 극복·활동사례를 정리하되 동일 사안 반복 보고를 피합니다.<br>
                    · 꼬미씨움은 직속 외에 산하 꾸리아 특기사항을 간추려 소개합니다.<br>
                    · 레지오 정상화 노력과 모범활동 사례를 기재합니다.<br>
                    · 하급 평의회 사업 지원으로 성공한 사례도 기록할 수 있습니다.
                </div>
                ${lineBoxHtml(m.specialNotes || '', '100px')}

                ${buildGwangjuSection14Html(m)}

                <div class="sec-title">기타(질의 및 건의)</div>
                ${lineBoxHtml(String(m.inquiries || '').trim())}

                <p class="note">※ 광주 세나뚜스 종합보고서 · 산하 회원 DB로 조직·행사·교육·활동·영성 집계. DB 값은 파란색, 빈칸은 빨간색으로 깜박입니다. PDF 전 수정 가능(저장 없음).</p>
            </div>
        `;
    }

    function buildDaeguOrgByAgeRows(byAge, org) {
        const orgCur = (org && org.current) || {};
        const orgPrev = (org && org.previous) || {};
        const ages = byAge || {};
        const adult = ages.adult || {};
        const youth = ages.youth || {};
        const junior = ages.junior || {};
        const total = ages.total || {
            pr: (Number(orgCur.pr_adult) || 0) + (Number(orgCur.pr_junior) || 0) || '',
            active_m: (Number(orgCur.active_adult_m) || 0) + (Number(orgCur.active_junior_m) || 0) || '',
            active_f: (Number(orgCur.active_adult_f) || 0) + (Number(orgCur.active_junior_f) || 0) || '',
            active_t: (Number(orgCur.active_adult_t) || 0) + (Number(orgCur.active_junior_t) || 0) || '',
            praetorian: orgCur.praetorian,
            aux_m: orgCur.aux_m,
            aux_f: orgCur.aux_f,
            aux_t: orgCur.aux_t,
            adjutorian: orgCur.adjutorian
        };
        const prPrev = (Number(orgPrev.pr_adult) || 0) + (Number(orgPrev.pr_junior) || 0) || '';
        const prCurr = total.pr || '';
        const prDelta = (Number.isFinite(Number(prCurr)) && Number.isFinite(Number(prPrev)))
            ? String(Number(prCurr) - Number(prPrev))
            : '';
        const activeDelta = '';
        const cuPrev = '';
        const cuCurr = (orgCur.cu_adult == null && orgCur.cu_junior == null)
            ? '1'
            : String((Number(orgCur.cu_adult) || 0) + (Number(orgCur.cu_junior) || 0) || 1);
        const coCurr = orgCur.co_count || '';

        function ageRow(label, row, isTotal) {
            const r = row || {};
            const prCurrCell = isTotal ? prCurr : (r.pr || '');
            const prPrevCell = isTotal ? prPrev : '';
            const prDeltaCell = isTotal ? prDelta : '';
            return `<tr>
                <td>${escapeHtml(label)}</td>
                <td>${blank(isTotal ? '' : '', 'w3')}</td>
                <td>${blank(isTotal ? coCurr : '', 'w3')}</td>
                <td>${blank(isTotal ? cuPrev : '', 'w3')}</td>
                <td>${blank(isTotal ? cuCurr : '', 'w3')}</td>
                <td>${blank(prPrevCell, 'w3')}</td>
                <td>${blank(prCurrCell, 'w3')}</td>
                <td>${blank(prDeltaCell, 'w3')}</td>
                <td>${blank(r.active_m, 'w3')}</td>
                <td>${blank(r.active_f, 'w3')}</td>
                <td>${blank(r.active_t, 'w3')}</td>
                <td>${blank(isTotal ? activeDelta : '', 'w3')}</td>
                <td>${blank(r.praetorian, 'w3')}</td>
                <td>${blank(r.aux_m, 'w3')}</td>
                <td>${blank(r.aux_f, 'w3')}</td>
                <td>${blank(r.aux_t, 'w3')}</td>
                <td>${blank(r.adjutorian, 'w3')}</td>
            </tr>`;
        }

        return [
            ageRow('성인', adult, false),
            ageRow('청년', youth, false),
            ageRow('소년', junior, false),
            ageRow('합계', total, true)
        ].join('');
    }

    function buildDaeguRetreatRowsHtml(rows, minRows) {
        const list = Array.isArray(rows) ? rows.slice() : [];
        while (list.length < minRows) list.push({});
        return list.slice(0, Math.max(minRows, rows?.length || 0)).map((r, idx) => `
            <tr>
                <td>${blank(String(idx + 1), 'w3')}</td>
                <td class="left">${blank(r.title, 'w10')}</td>
                <td>${blank(r.datetime, 'w8')}</td>
                <td>${blank(r.place, 'w8')}</td>
                <td>${blank(r.target, 'w6')}</td>
                <td>${blank(r.attendance, 'w4')}</td>
                <td class="left">${blank(r.lecturer || r.content || '', 'w12')}</td>
            </tr>
        `).join('');
    }

    function buildDaeguEducationPlanRowsHtml(events) {
        const list = Array.isArray(events) ? events : [];
        const buckets = {
            'Se. (Re.)': list.filter((e) => /se|senatus|세나뚜스|레지아|re\./i.test(`${e.organizer || ''} ${e.title || ''}`)),
            'Co.': list.filter((e) => /co\.|comitium|꼬미|꼬미씨움/i.test(`${e.organizer || ''} ${e.title || ''}`)),
            'Cu.': list.filter((e) => !/se|senatus|세나뚜스|레지아|re\.|co\.|comitium|꼬미/i.test(`${e.organizer || ''}`))
        };
        return ['Se. (Re.)', 'Co.', 'Cu.'].map((host) => {
            const row = (buckets[host] || [])[0] || {};
            const done = row.datetime || row.attendance || row.title ? '실시' : '';
            return `<tr>
                <td>${escapeHtml(host)}</td>
                <td class="left">${blank(row.title, 'w12')}</td>
                <td>${blank(row.datetime, 'w8')}</td>
                <td>${blank('', 'w4')}</td>
                <td>${blank(row.attendance, 'w4')}</td>
                <td>${blank(done, 'w4')}</td>
                <td class="left">${blank(row.place || row.lecturer || '', 'w8')}</td>
            </tr>`;
        }).join('');
    }

    /** 대구 세나뚜스 꾸리아 종합보고서 양식 (이미지 1→5 순서) */
    function buildDaeguFormHtml(model) {
        const m = model || {};
        const start = parseYmd(m.start_date);
        const end = parseYmd(m.end_date);
        const meeting = m.meeting || {};
        const officers = m.officers || [];
        const roles = ['담당사제', '단장', '부단장', '서기', '회계'];
        const officerMap = {
            담당사제: { name: m.spiritual_director || '', baptism_name: '', elected_on: '', attendance: '' },
            단장: officerByRole(officers, '단장'),
            부단장: officerByRole(officers, '부단장'),
            서기: officerByRole(officers, '서기'),
            회계: officerByRole(officers, '회계')
        };
        const nameRow = roles.map((role) => `<td>${cell(officerMap[role].name)}</td>`).join('');
        const baptismRow = roles.map((role) => `<td>${cell(officerMap[role].baptism_name)}</td>`).join('');
        const electedRow = roles.map((role) => {
            if (role === '담당사제') return `<td class="hatched">${blank('', 'w6')}</td>`;
            return `<td>${cell(officerMap[role].elected_on)}</td>`;
        }).join('');
        const attendRow = roles.map((role) => {
            if (role === '담당사제') return `<td class="hatched">${blank('', 'w6')}</td>`;
            return `<td>${cell(officerMap[role].attendance || '', 'w6')} %</td>`;
        }).join('');

        const a = computeDaeguCompActivity(m.activityRecords || []);
        const att = m.attendance || {};
        const o = m.ops || {};
        const fin = m.finance || {};
        const income = fin.income || {};
        const expense = fin.expense || {};
        const ev = m.events || {};
        const legionAll = [].concat(ev.legion_events || [], ev.other_events || []);
        const acies = firstMatchedEvent(legionAll, ['아치에스']);
        const annual = firstMatchedEvent(legionAll, ['연차', '총친목', '총 친목']);
        const outdoor = firstMatchedEvent(legionAll, ['야외']);
        const debate = firstMatchedEvent(legionAll, ['토론']);
        const otherHosted = (ev.other_events || []).filter((e) => e.title || e.datetime || e.place);
        const otherText = otherHosted.map((e) =>
            [e.title, e.datetime, e.place, e.attendance].filter(Boolean).join(' / ')
        ).join('\n');

        const mv = m.movement || {};
        const officerChangeText = [
            ...(mv.curia_officers || []).map((r) =>
                [r.role, r.name, r.baptism_name, r.elected_on, r.remark].filter(Boolean).join(' ')
            ),
            ...(mv.pr_officers || []).map((r) =>
                [r.pr_name, r.role, r.name, r.appointed_on].filter(Boolean).join(' ')
            )
        ].filter(Boolean).join('\n');
        const newUnitsText = (mv.new_presidia || [])
            .map((r) => [r.affiliation, r.pr_name, r.founded_on].filter(Boolean).join(' '))
            .filter(Boolean).join('\n');
        const dissolvedText = (mv.returned_presidia || [])
            .map((r) => [r.affiliation, r.pr_name, r.returned_on, r.remark].filter(Boolean).join(' '))
            .filter(Boolean).join('\n');

        const focusNotes = String(m.specialNotes || '').trim();

        return `
            <div class="curia-comp-form curia-comp-daegu" id="curiaComprehensiveFormPrint">
                <div class="form-title">제 ${blank(m.report_seq, 'w4')} 차 종합보고서</div>
                <ol class="info-list">
                    <li>1. 승인일자: ${blank(m.approved_y || m.founded_y, 'w4')} 년 ${blank(m.approved_m || m.founded_m, 'w3')} 월 ${blank(m.approved_d || m.founded_d, 'w3')} 일</li>
                    <li>2. 보고기간:
                        ${blank(start?.y, 'w4')} 년 ${blank(start?.m, 'w3')} 월 ${blank(start?.d, 'w3')} 일(${blank(m.meeting_from, 'w3')}차)
                        ~
                        ${blank(end?.y, 'w4')} 년 ${blank(end?.m, 'w3')} 월 ${blank(end?.d, 'w3')} 일(${blank(m.meeting_to, 'w3')}차)
                        ${blank('', 'w3')}차분
                    </li>
                    <li>3. 회합일시 및 장소:
                        매월 ${blank(meeting.weekday, 'w4')}요일 ${blank(meeting.hour, 'w3')}시 ${blank(meeting.minute, 'w3')}분,
                        ${blank(m.church_name, 'w8')} 성당 ${blank(meeting.place, 'w10')} 회의실
                    </li>
                    <li>4. 조직현황</li>
                </ol>

                <div class="sub-title">가. 간부구성</div>
                <div class="org-table-wrap">
                    <table class="form-table">
                        <thead>
                            <tr>
                                <th style="width:16%"></th>
                                <th>담당사제</th><th>단장</th><th>부단장</th><th>서기</th><th>회계</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td>성명</td>${nameRow}</tr>
                            <tr><td>세례명</td>${baptismRow}</tr>
                            <tr><td>선출 일자</td>${electedRow}</tr>
                            <tr><td>상급평의회 출석률</td>${attendRow}</tr>
                        </tbody>
                    </table>
                </div>

                <div class="sub-title">나. 조직구성현황</div>
                <div class="org-table-wrap">
                    <table class="form-table">
                        <thead>
                            <tr>
                                <th rowspan="2">구분</th>
                                <th colspan="2">Co.</th>
                                <th colspan="2">Cu.</th>
                                <th colspan="3">Pr.</th>
                                <th colspan="4">행동단원</th>
                                <th rowspan="2">쁘레또리움<br>단원</th>
                                <th colspan="3">협조단원</th>
                                <th rowspan="2">아쥬또리움<br>단원</th>
                            </tr>
                            <tr>
                                <th>전차</th><th>현재</th>
                                <th>전차</th><th>현재</th>
                                <th>전차</th><th>현재</th><th>증감</th>
                                <th>남</th><th>여</th><th>계</th><th>증감</th>
                                <th>남</th><th>여</th><th>계</th>
                            </tr>
                        </thead>
                        <tbody>${buildDaeguOrgByAgeRows(m.membership_by_age, m.organization)}</tbody>
                    </table>
                </div>

                <div class="sub-title">다. 간부변경</div>
                ${lineBoxHtml(officerChangeText, '40px')}
                <div class="sub-title">라. 신설 및 해체 Pr. Cu Co.</div>
                <div>신설</div>
                ${lineBoxHtml(newUnitsText, '36px')}
                <div style="margin-top:6px;">해체(사유)</div>
                ${lineBoxHtml(dissolvedText, '36px')}

                <div class="sec-title">5. 운영 및 관리현황</div>
                <div>
                    가. 출석율 — 간부 ${blank(o.attendance_officer || att.rate_officers, 'w4')} %
                    &nbsp; 평의원 ${blank(o.attendance_councilor || att.rate_members, 'w4')} %
                    &nbsp; 전체 ${blank(o.attendance_total || att.rate_total, 'w4')} %
                </div>
                <div style="margin-top:6px;">
                    나. 통신교환 — 수신 ${blank(o.mail_in, 'w4')} 건
                    &nbsp; 발신 ${blank(o.mail_out, 'w4')} 건
                </div>
                <div style="margin-top:6px;">
                    다. 방문 — ${blank(o.visit_count, 'w4')} 회
                    (${blank(o.visit_pr_count, 'w3')}개 Pr.)
                    (${blank(o.visit_cu_count, 'w3')}개 Cu.)
                    (${blank(o.visit_co_count, 'w3')}개 Co.)
                </div>

                <div class="sec-title">6. 회계보고 (단위: 원)</div>
                <div class="org-table-wrap">
                    <table class="form-table">
                        <thead>
                            <tr><th>수입</th><th>지출</th><th>잔액</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="height:72px;vertical-align:top;" class="left">${blank(income.contribution || income.total || '', 'w10')}</td>
                                <td style="vertical-align:top;" class="left">${blank(expense.contribution || expense.total || '', 'w10')}</td>
                                <td style="vertical-align:top;" class="left">${blank(fin.balance || '', 'w10')}</td>
                            </tr>
                            <tr>
                                <td>계 ${blank(income.total, 'w6')} 원</td>
                                <td>계 ${blank(expense.total, 'w6')} 원</td>
                                <td>계 ${blank(fin.balance, 'w6')} 원</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="sec-title">7. 행사</div>
                <div class="sub-title">가. 행사 실시 현황</div>
                ${daeguEventLineHtml('1) 아치에스 행사', acies)}
                ${daeguEventLineHtml('2) 연차 총 친목회', annual)}
                ${daeguEventLineHtml('3) 야외행사', outdoor)}
                ${daeguEventLineHtml('4) 토론대회', debate)}
                <div style="margin:4px 0 8px;">5) 기타 평의회 주관 행사:</div>
                ${lineBoxHtml(otherText, '40px')}

                <div class="sec-title">8. 교육 실시 사항</div>
                <div class="sub-title">가. 교육 실시 현황</div>
                <div class="org-table-wrap">
                    <table class="form-table">
                        <thead>
                            <tr>
                                <th>주관</th>
                                <th>교육 계획 내용</th>
                                <th>교육 계획 일시</th>
                                <th>예상 인원</th>
                                <th>참가 인원</th>
                                <th>실시 여부</th>
                                <th>비고</th>
                            </tr>
                        </thead>
                        <tbody>${buildDaeguEducationPlanRowsHtml(ev.education_events)}</tbody>
                    </table>
                </div>

                <div class="sub-title">나. 교육 후 자체 평가 사항</div>
                ${lineBoxHtml('', '56px')}

                <div class="sec-title">9. 피정 실시 사항</div>
                <div class="org-table-wrap">
                    <table class="form-table">
                        <thead>
                            <tr>
                                <th>횟수</th>
                                <th>피정 명칭</th>
                                <th>일 시</th>
                                <th>장 소</th>
                                <th>대 상</th>
                                <th>참가인원</th>
                                <th>내 용</th>
                            </tr>
                        </thead>
                        <tbody>${buildDaeguRetreatRowsHtml(ev.retreat_events, 3)}</tbody>
                    </table>
                </div>
                <div class="special-hint">※ 실시하지 않았다면 실시하지 않은 이유와 향후 방안 기술</div>
                ${lineBoxHtml('', '40px')}

                <div class="sec-title">10. 활동상황</div>
                <div class="sub-title">가. 전차보고에서 제시한 중점 활동목표</div>
                ${lineBoxHtml('', '56px')}
                <div class="sub-title">나. 중점을 두고 추진한 활동 내용과 성과</div>
                ${lineBoxHtml(focusNotes, '56px')}
                <div class="sub-title">다. 활동상황 분석</div>
                ${lineBoxHtml('', '56px')}

                <div class="sub-title">라. 활동 결과
                    <span style="font-weight:400;font-size:11px;">(산하 회원 활동세목 집계 · 수정 가능)</span>
                </div>
                <div class="org-table-wrap">
                    <table class="form-table">
                        <thead>
                            <tr><th>종목</th><th>활동 횟수(회)</th><th>내용(결과)</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="left">이웃에 가톨릭 알리기</td>
                                <td>${blank(a.neighbor, 'w4')}</td>
                                <td class="left">${daeguResult('교리반 인도', a.catechismLead, '명')}</td>
                            </tr>
                            <tr>
                                <td class="left">예비신자와 함께하는 활동</td>
                                <td>${blank(a.catechumen, 'w4')}</td>
                                <td class="left">${daeguResult('영세자', a.baptized, '명')}</td>
                            </tr>
                            <tr>
                                <td class="left">가정을 위한 활동, 교우 돌봄</td>
                                <td>${blank(a.familyCare, 'w4')}</td>
                                <td class="left">${daeguResult('단체가입', a.groupJoin, '명')}</td>
                            </tr>
                            <tr>
                                <td class="left">성사권유 및 혼인장애자를 위한 활동</td>
                                <td>${blank(a.sacramentInvite, 'w4')}</td>
                                <td class="left">
                                    ${daeguResult('회두', a.conversion, '명')}<br>
                                    ${daeguResult('판공', a.confession, '명')}<br>
                                    ${daeguResult('견진', a.confirmation, '명')}<br>
                                    ${daeguResult('유아세례', a.infantBaptism, '명')}<br>
                                    ${daeguResult('혼인장애 해소', a.marriageFix, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td class="left">어려움을 겪는 이웃과 나눔 활동</td>
                                <td>${blank(a.neighborShare, 'w4')}</td>
                                <td class="left">
                                    ${daeguResult('상가방문 및 돌봄', a.funeralVisit, '회')}<br>
                                    ${daeguResult('위령기도', a.memorialPrayer, '회')}<br>
                                    ${daeguResult('장례미사', a.funeralMass, '회')}<br>
                                    ${daeguResult('장지수행', a.burialEscort, '회')}<br>
                                    ${daeguResult('병자성사', a.anointing, '명')}<br>
                                    ${daeguResult('봉성체', a.sickCommunion, '명')}<br>
                                    ${daeguResult('대세자', a.conditionalBaptism, '명')}<br>
                                    ${daeguResult('보례자', a.baptismComplete, '명')}<br>
                                    ${daeguResult('병원 및 복지시설', a.hospital, '회')}<br>
                                    ${daeguResult('기타', a.shareOther, '회')}
                                </td>
                            </tr>
                            <tr>
                                <td class="left">본당운영에 기여하는 활동</td>
                                <td>${blank(a.parishOps, 'w4')}</td>
                                <td class="left">
                                    ${daeguResult('첫 영성체', a.firstCommunionLead, '명')}<br>
                                    ${daeguResult('첫 영성체반 유아세례 외 영세', a.firstCommunionBaptism, '명')}<br>
                                    ${daeguResult('교리반인도', a.parishCatechism, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td class="left">레지오 발전을 위한 활동</td>
                                <td>${blank(a.legionGrow, 'w4')}</td>
                                <td class="left">
                                    ${daeguResult('행동단원', a.activeRecruit, '명')}
                                    &nbsp; ${daeguResult('협조단원', a.auxRecruit, '명')}
                                </td>
                            </tr>
                            <tr>
                                <td class="left">소공동체와 함께하는 활동</td>
                                <td>${blank(a.smallCommunity, 'w4')}</td>
                                <td class="left">${blank('', 'w10')}</td>
                            </tr>
                            <tr>
                                <td class="left">자연보호 및 생명존중 운동</td>
                                <td>${blank(a.nature, 'w4')}</td>
                                <td class="left">${blank('', 'w10')}</td>
                            </tr>
                            <tr>
                                <td class="left">상급평의회가 권고한 활동</td>
                                <td>${blank(a.higherCouncil, 'w4')}</td>
                                <td class="left">
                                    ${daeguResult('성경통독', a.bibleRead, '장')}<br>
                                    ${daeguResult('미사 전 독서, 복음묵상', a.gospelMeditation, '회')}<br>
                                    ${daeguResult('성경필사', a.bibleWrite, '장')}<br>
                                    ${daeguResult('성모님의 군단, 빛잡지 읽기', a.magazine, '회')}<br>
                                    ${daeguResult('주회 전후 미사', a.meetingMass, '회')}<br>
                                    ${daeguResult('평일미사', a.weekdayMass, '회')}<br>
                                    ${daeguResult('기타 상급평의회 지시 활동', a.higherOther, '회')}<br>
                                    ${daeguResult('묵주기도(Se.에서 권고한 지향)', a.rosary, '단')}
                                </td>
                            </tr>
                            <tr>
                                <td class="left">기타활동</td>
                                <td>${blank(a.otherAct, 'w4')}</td>
                                <td class="left">${blank('', 'w10')}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="sec-title">11. 레지오 마리애 발전방안</div>
                ${lineBoxHtml(m.futurePlans || '', '64px')}
                <div class="sec-title">12. 차기 중점 목표</div>
                ${lineBoxHtml('', '64px')}

                <div class="sec-title">13. 중점적으로 활동한 내용</div>
                <div class="special-hint">
                    Co.은 하급 평의회 또는 레지오 정상화를 위한 노력 등 Co.이 활동한 내용기재 하고<br>
                    Cu.는 Pr.의 정상화 및 레지오 활성화를 위한 노력 등 Cu.가 활동한 내용 중 모범사례 작성<br>
                    단, Cu. 또는 Pr.의 활동 중 세나뚜스 산하 모든 Cu.나 Pr.에 귀감이 될 만한 활동이 있는 경우는
                    Cu. 나 Pr.의 모범 활동 사례도 함께 작성
                </div>
                ${lineBoxHtml(focusNotes, '160px')}
                <div style="text-align:right; margin-top:16px;">
                    ${blank(m.curia_name, 'w12')} Re. Co. Cu.단장
                    ${blank(m.president_name || officerMap['단장'].name, 'w8')} (인)
                </div>

                <div class="sec-title">기타(질의 및 건의)</div>
                ${lineBoxHtml(String(m.inquiries || '').trim())}

                <p class="note">※ 대구 세나뚜스 꾸리아 종합보고서 · 산하 회원 DB로 조직·행사·교육·피정·활동세목 집계. DB 값은 파란색, 빈칸은 빨간색으로 깜박입니다. PDF 전 수정 가능(저장 없음).</p>
            </div>
        `;
    }

    function buildFormHtml(model) {
        const m = model || {};
        const start = parseYmd(m.start_date);
        const end = parseYmd(m.end_date);
        const meeting = m.meeting || {};
        const officers = m.officers || [];
        const roles = ['영적지도자', '대리자', '단장', '부단장', '서기', '회계'];
        const proxyFromOfficers = officerByRole(officers, '대리자');
        const officerMap = {
            영적지도자: { name: m.spiritual_director || '', baptism_name: '', elected_on: '', attendance: '' },
            대리자: {
                name: m.spiritual_proxy || proxyFromOfficers.name || '',
                baptism_name: proxyFromOfficers.baptism_name || '',
                elected_on: proxyFromOfficers.elected_on || '',
                attendance: ''
            },
            단장: officerByRole(officers, '단장'),
            부단장: officerByRole(officers, '부단장'),
            서기: officerByRole(officers, '서기'),
            회계: officerByRole(officers, '회계')
        };

        const nameRow = roles.map((role) => `<td>${cell(officerMap[role].name)}</td>`).join('');
        const baptismRow = roles.map((role) => `<td>${cell(officerMap[role].baptism_name)}</td>`).join('');
        const electedRow = roles.map((role) => `<td>${cell(officerMap[role].elected_on)}</td>`).join('');
        const attendRow = roles.map((role) => {
            if (role === '영적지도자' || role === '대리자') return `<td>${blank('', 'w6')}</td>`;
            return `<td>${cell(officerMap[role].attendance || '00.0%', 'w6')}</td>`;
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
                                <th style="width:14%"></th>
                                <th>영적지도자</th>
                                <th>대리자</th>
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
                            ${buildOrgCompositionRows(org, { includeYouth: true })}
                        </tbody>
                    </table>
                </div>

                ${buildMovementTablesHtml(m.movement)}

                ${buildOpsAndEventsHtml(m.ops, m.events)}
                ${buildEducationTablesHtml(m.events)}

                <div class="sec-title">기타(질의 및 건의)</div>
                ${lineBoxHtml(inquiryText)}

                ${buildSeoulOfficialActivityTailHtml()}

                <p class="note">※ 활동·운영 란은 직접 기입합니다. 빈칸은 빨간색으로 깜박이며, PDF/Excel 전 수정 가능합니다(저장 없음).</p>
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

    /** 서울 양식: (세목 ) 직접 기입용 */
    function seoulParenBlank(label) {
        return `${escapeHtml(label)}(${blank('', 'w3')})`;
    }

    /**
     * 서울 세나뚜스 꾸리아 종합보고 — 기존 10.활동사항~명부 대신
     * 공식 양식 11.활동사항(1) / 12.활동사항(2) / 13.운영상황 (직접 기입)
     */
    function buildSeoulOfficialActivityTailHtml() {
        const cnt = () => blank('', 'w4');
        const detailBlank = () => blank('', 'w20');
        const join = (items) => items.map(seoulParenBlank).join(', ');

        const rows = [
            {
                item: '교구 또는 세나뚜스 지시 사항',
                detail: detailBlank()
            },
            {
                item: '본당 사목자 지시 사항',
                detail: detailBlank()
            },
            {
                item: '입교 권면',
                detail: join([
                    '외인 입교 권면', '교리 중단자 재권면', '개종 권면', '가두 선교', '방문 선교'
                ])
            },
            {
                item: '예비신자 돌봄',
                detail: join([
                    '교리반 인도 예비신자 돌봄', '통신교리자 돌봄', '교리반 봉사 또는 협조'
                ])
            },
            {
                item: '교우 돌봄',
                detail: join([
                    '새 영세자 돌봄', '전입교우 돌봄', '냉담 교우 돌봄', '조당(혼인장애)자 안내',
                    '성사 권면', '유아 세례 권면', '첫 영성체', '교우 가정 방문'
                ])
            },
            {
                item: '어려움 겪는 분 돌봄',
                detail: join([
                    '교우 환자 방문', '외인 환자 방문', '다문화 가정 돌봄', '외인 상가 돌봄', '교우 상가 돌봄',
                    '위령기도[연도]', '장례미사', '추모미사', '입관', '장지수행'
                ])
            },
            {
                item: '레지오 확장',
                detail: join([
                    '행동단원 모집', '협조단원 모집 및 돌봄', '소년 레지오 지도'
                ])
            },
            {
                item: '특별 활동',
                detail: join([
                    '호구조사(호별방문)', '재해 및 사고 피해자 돌봄', '복지시설 노력 봉사', '병원방문 활동'
                ])
            },
            {
                item: '본당 협조',
                detail: join([
                    '행사 준비 및 협조', '주일학교 돌봄', '청소 미화', '미사안내 봉사', '기타 본당 협조'
                ])
            },
            {
                item: '소공동체 활동<br>(본당과 직장)',
                detail: join([
                    '소공동체 모임 참석', '구역·반장교육 참석', '반모임 참석 권유', '기타'
                ])
            },
            {
                item: '가정성화 활동<br>(가족 단위)',
                detail: join([
                    '기도하기', '성경 봉독 및 기도', '미사참례', '복지시설 봉사'
                ])
            },
            {
                item: '기타 활동',
                detail: detailBlank()
            }
        ];

        const body = rows.map((r) => `
            <tr>
                <td class="col-item">${r.item}</td>
                <td class="col-cnt">${cnt()}</td>
                <td class="col-detail">${r.detail}</td>
            </tr>
        `).join('');

        return `
            <div class="sec-title">11. 활동 사항(1) :
                <span style="font-weight:400;font-size:11px;">활동은 아래 내용을 기준으로 작성하되 필요에 따라서 내용을 수정할 수 있습니다.</span>
            </div>
            <div class="org-table-wrap">
                <table class="form-table seoul-act1-table">
                    <thead>
                        <tr>
                            <th style="width:18%">종 목</th>
                            <th style="width:10%">활동횟수</th>
                            <th>활 동 내 용</th>
                        </tr>
                    </thead>
                    <tbody>${body}</tbody>
                </table>
            </div>

            <div class="sec-title">12. 활동 사항(2) :</div>
            <p class="seoul-act-instr">
                ① 서울대교구 소속 꾸리아는 지난 1년간 본당 사목자의 사목 방침을 실천하기 위해 활동했던 내용들을 정리하고 운영상 어려웠던 점과 해결 방안을 제시한다.<br>
                ② 교구 레지아(서울대교구 제외) 소속의 꾸리아는 교구장의 사목 목표를 따르는 레지아의 실천 계획을 실천하고 정리하며, 운영상 어려웠던 점과 해결 방안을 제시한다.
            </p>
            <div class="seoul-act2-box">
                <div class="seoul-act2-sub">가) 중점 목표와 실천 결과</div>
                ${lineBoxHtml('', '100px')}
                <div class="seoul-act2-sub">나) 운영상 애로사항 및 해결 방법</div>
                ${lineBoxHtml('', '100px')}
            </div>

            <div class="sec-title">13. 운영상황 :
                <span style="font-weight:400;font-size:11px;">쁘레시디움 사업 보고서 중에서 어려움을 극복한 내용이나 기타 다양한 활동 사례들을 발췌하여 기록한다.</span>
            </div>
            ${lineBoxHtml('', '280px')}
            <div class="seoul-form-footer">서울 무염시태 세나뚜스 양식 제16호(2024년 12월)</div>
        `;
    }

    /** 서울 꾸리아 종합보고 7. 회계 보고 — 전 항목 직접 기입 */
    function buildSeoulFinanceReportHtml() {
        const amt = () => blank('', 'w6');
        const freeLabel = () => blank('', 'w10');

        const expenseGroups = [
            { cat: '의연금', items: [''] },
            { cat: '회의비', items: ['월례 회의비', '간부 회의비'] },
            { cat: '꽃·초', items: ['꽃값', '초값'] },
            { cat: '교육 / 피정', items: ['단원교육', '단원피정', '장소예약'] },
            { cat: '인쇄비', items: ['종합 보고서', '월례회의 자료'] },
            { cat: '비품비', items: ['벡실리움 / 성모상', '레지오제대보/단기'] },
            { cat: '행사비', items: ['아치에스', '연차 총 친목회', '야외행사', '토론대회', '간담회'] },
            { cat: '활동비', items: [''] },
            { cat: '보조비', items: ['신설 Pr.', '청년/소년 Pr.', '수첩', 'Pr. 양식', '신입단원 교본'] },
            { cat: '교통 / 통신', items: ['우표 / 전화', '교통비'] },
            { cat: '수수료', items: ['송금'] },
            { cat: '도서 / 문구', items: ['사무용품', '월간지', '소모품'] },
            { cat: '상품비', items: ['교본', '뗏세라'] },
            { cat: '기타', items: ['단원선종', '택배비'] }
        ];

        const expenseRows = [];
        expenseGroups.forEach((g) => {
            g.items.forEach((item, i) => {
                expenseRows.push({
                    cat: g.cat,
                    item,
                    isFirst: i === 0,
                    rowspan: g.items.length
                });
            });
        });

        const incomeLabels = [
            '전차이월금',
            '의연금',
            '이자수입',
            '상품비 — 교본',
            '상품비 — 뗏세라',
            '기타수입'
        ];
        while (incomeLabels.length < expenseRows.length) {
            incomeLabels.push('');
        }

        const rowsHtml = expenseRows.map((ex, idx) => {
            const incomeLabel = incomeLabels[idx]
                ? `<td class="left">${escapeHtml(incomeLabels[idx])}</td>`
                : `<td class="left">${freeLabel()}</td>`;
            const catCell = ex.isFirst
                ? `<td class="left cat" rowspan="${ex.rowspan}">${escapeHtml(ex.cat)}</td>`
                : '';
            const itemCell = ex.item
                ? `<td class="left">${escapeHtml(ex.item)}</td>`
                : '<td class="left"></td>';
            const subtotalCell = ex.isFirst
                ? `<td rowspan="${ex.rowspan}">${amt()}</td>`
                : '';
            return `<tr>
                ${incomeLabel}<td>${amt()}</td>
                ${catCell}${itemCell}<td>${amt()}</td>${subtotalCell}
            </tr>`;
        }).join('');

        return `
            <div class="sec-title">7. 회계 보고</div>
            <p class="finance-hint">회계 내용은 아래 기준으로 작성하되 필요에 따라서 내용을 수정할 수 있습니다. (전 항목 직접 기입 · 저장 없음)</p>
            <div class="org-table-wrap">
                <table class="form-table seoul-finance-table">
                    <thead>
                        <tr>
                            <th colspan="2">수 입</th>
                            <th colspan="4">지 출</th>
                        </tr>
                        <tr>
                            <th style="width:18%">항목</th>
                            <th style="width:10%">금액</th>
                            <th style="width:14%">구분</th>
                            <th style="width:22%">세목</th>
                            <th style="width:10%">금액</th>
                            <th style="width:10%">소계</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                        <tr class="total-row">
                            <td class="left">수입합계</td>
                            <td>${amt()}</td>
                            <td class="left" colspan="3">지출합계</td>
                            <td>${amt()}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="seoul-finance-balance">
                <span>잔 액</span>${amt()}
            </div>
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

            ${buildSeoulFinanceReportHtml()}

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
            const who = rawName.replace(/^[TG](?:10|[1-6][78]|[1-9])/i, '') || rawName;
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
        let roster = { officers: [], praesidia: [], curia_stats: {} };
        let previousRecords = [];
        const user = await refreshLoggedInUser() || getLoggedInUser();

        try {
            monthly = await fetchCouncilMonthly(
                curiaName,
                end?.year || new Date().getFullYear(),
                end?.month || (new Date().getMonth() + 1)
            );
        } catch (error) {
            console.warn('꾸리아 종합보고 월례 API 실패:', error);
        }

        const senatusName = resolveSenatusName(
            user?.senatus_name,
            monthly?.senatus_name,
            opts.senatusName
        );
        const formSenatus = formTemplateSenatus(senatusName);
        const isGwangju = formSenatus === '광주';
        const isDaegu = formSenatus === '대구';
        console.info('[꾸리아종합보고] senatus=', senatusName, {
            user: user?.senatus_name,
            monthly: monthly?.senatus_name,
            form: formSenatus
        });

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
            roster = { officers: [], praesidia: [], curia_stats: {} };
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
            church_name: churchName || roster?.curia_stats?.church_name || monthly?.church_name || '',
            senatus_name: senatusName,
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
            spiritual_proxy: monthly?.spiritual_proxy || '',
            officers: monthly?.officers || [],
            president_name: monthly?.president_name || '',
            organization: {
                founded: {},
                previous: orgPrevious,
                current: orgCurrent,
                change: monthly?.organization?.increase || {}
            },
            membership_by_age: monthly?.membership_by_age || {},
            attendance: monthly?.attendance || {},
            finance: monthly?.finance || {},
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

        container.innerHTML = isDaegu
            ? buildDaeguFormHtml(model)
            : isGwangju
                ? buildGwangjuFormHtml(model)
                : buildFormHtml(model);
        wireBlankEditables(container);
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

        await withFrozenBlanks(formEl, async () => {
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

            const fileName = `${buildExportFileBase(meta)}.pdf`;
            if (global.RegioPdfShare && typeof global.RegioPdfShare.deliverJsPdf === 'function') {
                await global.RegioPdfShare.deliverJsPdf(pdf, fileName, {
                    title: '꾸리아 종합보고',
                    text: meta?.curiaName || fileName
                });
            } else {
                pdf.save(fileName);
            }
        });
    }

    async function exportToExcel(formEl, meta) {
        if (!formEl) throw new Error('출력할 꾸리아 종합보고서가 없습니다.');
        if (!global.XLSX) {
            await loadScript('https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js');
        }
        if (!global.XLSX) throw new Error('Excel 라이브러리를 불러오지 못했습니다.');

        await withFrozenBlanks(formEl, async () => {
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
        });
    }

    function exportToHangul(formEl, meta) {
        if (!formEl) throw new Error('출력할 꾸리아 종합보고서가 없습니다.');
        const noteEls = [...formEl.querySelectorAll('.note')];
        const prevDisplays = noteEls.map((el) => el.style.display);
        noteEls.forEach((el) => { el.style.display = 'none'; });
        const restore = freezeBlankInputsForExport(formEl);
        try {
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
        .box, .line-box { border: 1px solid #333; min-height: 48px; padding: 8px; white-space: pre-wrap; }
        .blank, .blank-print { display: inline; border-bottom: none; }
        input { display: none !important; }
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
        } finally {
            restore();
            noteEls.forEach((el, i) => { el.style.display = prevDisplays[i]; });
        }
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
