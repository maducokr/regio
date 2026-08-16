/**
 * Pr 쁘레시디움 사업 보고서 양식
 * activity-report.html?scope=pr + 일년 집계 시 활동요약 위에 표시
 */
(function (global) {
    'use strict';

    const FIXED_EVENTS = [
        { key: 'acies', labels: ['아치에스'], title: '아치에스' },
        { key: 'outdoor', labels: ['야외 행사', '야외행사'], title: '야외 행사' },
        { key: 'pr_social', labels: ['쁘레시디움 친목회', 'Pr친목회', 'Pr 친목회'], title: '쁘레시디움 친목회' },
        { key: 'annual_social', labels: ['연차 총 친목회', '연차총친목회', '총친목회'], title: '연차 총 친목회' },
        { key: 'debate', labels: ['토론 대회', '토론대회'], title: '토론 대회' }
    ];

    const OTHER_EVENTS = [
        { key: 'mary_night', labels: ['성모의 밤', '성모의밤'], title: '성모의 밤' },
        { key: 'requiem', labels: ['위령미사', '위령성월'], title: '위령미사(위령성월)' },
        { key: 'president_meet', labels: ['단장 간담회', '단장간담회', '단장 회의', '단장회의'], title: '단장 간담회' }
    ];

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
        const text = value === null || value === undefined || value === '' ? '' : String(value);
        const c = cls ? ` blank ${cls}` : ' blank';
        if (text) {
            return `<span class="${c.trim()}">${escapeHtml(text)}</span>`;
        }
        return `<input type="text" class="${c.trim()} blank-editable" value="" placeholder=" " inputmode="text" autocomplete="off" aria-label="직접 입력">`;
    }

    function ratioBlank(present, total) {
        return `${blank(present, 'w3')} / ${blank(total, 'w3')}`;
    }

    function wireBlankEditables(root) {
        if (!root) return;
        root.querySelectorAll('input.blank-editable').forEach((inp) => {
            const sync = () => inp.classList.toggle('has-value', !!String(inp.value || '').trim());
            sync();
            inp.addEventListener('input', sync);
        });
    }

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
            input.style.display = 'none';
            input.parentNode.insertBefore(span, input);
            restorers.push(() => {
                span.remove();
                input.style.display = '';
            });
        });
        return () => restorers.forEach((fn) => fn());
    }

    async function withFrozenBlanks(formEl, work) {
        const restore = freezeBlankInputsForExport(formEl);
        try {
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            return await work();
        } finally {
            restore();
        }
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
        return { y: m[1], m: m[2], d: m[3], year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
    }

    function matchEvent(events, labels) {
        if (!Array.isArray(events) || !events.length) return null;
        const lowerLabels = labels.map((l) => l.toLowerCase());
        const matches = events.filter((ev) => {
            const title = String(ev.title || ev.content || '').toLowerCase();
            const content = String(ev.content || '').toLowerCase();
            return lowerLabels.some((lb) => title.includes(lb.toLowerCase()) || content.includes(lb.toLowerCase()));
        });
        if (!matches.length) return null;
        // 참석인원 있는 기록을 우선 (꾸리아 등 상위 주관 참석 포함)
        return matches.find((ev) => String(ev.attendance || ev.attendees || '').trim()) || matches[0];
    }

    function eventDateAtt(ev) {
        if (!ev) return { date: '', attendance: '' };
        return {
            date: String(ev.datetime || ev.date || '').trim(),
            attendance: String(ev.attendance || ev.attendees || '').trim()
        };
    }

    function isHigherOrgLabel(text) {
        return /^(꾸리아|꼬미시움|레지아|본당)(\s*[:：]|$)/i.test(String(text || '').trim());
    }

    function formatEventRowLabel(defTitle, ev) {
        const parts = [defTitle];
        const org = String(ev?.organizer || '').trim();
        if (org && (isHigherOrgLabel(org) || !/^Pr\s*[:：]/i.test(org))) {
            parts.push(`(주관:${org})`);
        }
        return parts.join(' ');
    }

    function parseEventNoteLines(note, fallbackType) {
        const text = note != null ? String(note).trim() : '';
        if (!text) return [];

        const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        let startIdx = 0;
        if (lines.length && !/^\d+\.\s*/.test(lines[0])) {
            startIdx = 1; // 헤더(교육/피정및연수/Pr:…)
        }

        const rows = [];
        for (let i = startIdx; i < lines.length; i += 1) {
            const line = lines[i].replace(/^\d+\.\s*/, '');
            const parts = line.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
            const row = {
                kind: '',
                title: '',
                host: '',
                date: '',
                place: '',
                content: '',
                attendees: ''
            };
            parts.forEach((part, idx) => {
                if (part.startsWith('구분:')) row.kind = part.slice(3).trim();
                else if (part.startsWith('제목:')) {
                    const t = part.slice(3).trim();
                    row.title = (t === '(제목없음)' || t === '(명칭없음)') ? '' : t;
                }
                else if (part.startsWith('주관:')) row.host = part.slice(3).trim();
                else if (part.startsWith('일자:')) row.date = part.slice(3).trim();
                else if (part.startsWith('장소:')) row.place = part.slice(3).trim();
                else if (part.startsWith('내용:')) row.content = part.slice(3).trim();
                else if (part.startsWith('참석:')) row.attendees = part.slice(3).trim();
                else if (idx === 0 || (idx === 1 && !row.title && !row.kind)) {
                    const raw = (part === '(명칭없음)' || part === '(제목없음)') ? '' : part;
                    if (!row.kind && /^(실시|계획)$/.test(raw)) row.kind = raw;
                    else if (!row.title) row.title = raw;
                } else if (!row.content) {
                    row.content = part;
                }
            });
            if (row.kind || row.title || row.date || row.place || row.content || row.attendees) {
                rows.push(row);
            }
        }

        if (!rows.length && text) {
            rows.push({
                kind: '',
                title: fallbackType || '',
                host: '',
                date: '',
                place: '',
                content: text,
                attendees: ''
            });
        }
        return rows;
    }

    function educationEventKey(ev) {
        const title = String(ev.title || '').trim();
        const content = String(ev.content || '').trim();
        return [
            String(ev.event_type || ''),
            title || content,
            String(ev.datetime || ev.date || ''),
            String(ev.place || ''),
            String(ev.organizer || ev.host || ''),
            String(ev.attendance || ev.attendees || ''),
            content && content !== title ? content : ''
        ].join('|');
    }

    function mergeEducationEvents(primary, secondary) {
        const map = new Map();
        [...(primary || []), ...(secondary || [])].forEach((ev) => {
            if (!ev) return;
            const key = educationEventKey(ev);
            if (!map.has(key)) map.set(key, ev);
        });
        return Array.from(map.values());
    }

    /** Pr 소속 회원의 교육·피정 활동을 활동요약 API에서 직접 수집 */
    async function fetchPrEducationFromSummary(churchName, prName, startDate, endDate) {
        const qs = new URLSearchParams({
            start_date: startDate,
            end_date: endDate,
            church_name: churchName,
            pr_name: prName
        });
        const res = await fetch(`/api/activities/summary?${qs.toString()}`);
        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data)) return [];

        const out = [];
        data.forEach((record) => {
            const category = String(record.category_name || '');
            let eventType = '';
            if (category === '메모및 행사-교육' || category.endsWith('-교육')) eventType = '교육';
            else if (category === '메모및 행사-피정및연수' || category.includes('피정및연수')) eventType = '피정및연수';
            else return;

            const activityDate = String(record.activity_date || '').slice(0, 10);
            const noteRows = parseEventNoteLines(record.note, eventType);
            if (!noteRows.length) {
                out.push({
                    kind: '',
                    title: eventType,
                    organizer: '',
                    datetime: activityDate,
                    place: '',
                    attendance: Number(record.count) > 0 ? String(record.count) : '',
                    content: '',
                    event_type: eventType
                });
                return;
            }
            noteRows.forEach((row) => {
                const kind = String(row.kind || '').trim();
                out.push({
                    kind,
                    title: row.title || eventType,
                    organizer: row.host || '',
                    datetime: row.date || activityDate,
                    place: row.place || '',
                    attendance: row.attendees
                        || (Number(record.count) > 0 ? String(record.count) : '')
                        || (kind === '계획' ? '0' : ''),
                    content: row.content || '',
                    event_type: eventType
                });
            });
        });
        return out;
    }

    function officerName(officers, role) {
        const list = officers || [];
        const found = list.find((o) => String(o.role || '') === role);
        if (!found) return '';
        const name = String(found.name || '').trim();
        const baptism = String(found.baptism_name || '').trim();
        if (name && baptism) return `${name}(${baptism})`;
        return name || baptism;
    }

    function memVal(bucket, key) {
        if (!bucket) return '';
        const v = bucket[key];
        if (v === null || v === undefined || v === '') return '';
        return n(v);
    }

    /** 단원수 표: 행=유형, 열=전차/현재/증감 — 빈칸은 편집 가능 */
    function membershipRowHtml(label, prev, curr, inc, dec, keys) {
        const pM = memVal(prev, keys.m);
        const pF = memVal(prev, keys.f);
        const pT = memVal(prev, keys.t);
        const cM = memVal(curr, keys.m);
        const cF = memVal(curr, keys.f);
        const cT = memVal(curr, keys.t);
        const iT = memVal(inc, keys.t);
        const dT = memVal(dec, keys.t);
        let delta = '';
        if (iT !== '' || dT !== '') {
            const iv = Number(iT) || 0;
            const dv = Number(dT) || 0;
            delta = String(iv - dv);
        }
        return `<tr>
            <td class="row-label">${escapeHtml(label)}</td>
            <td>${blank(pM, 'w3')}</td><td>${blank(pF, 'w3')}</td><td>${blank(pT, 'w3')}</td>
            <td>${blank(cM, 'w3')}</td><td>${blank(cF, 'w3')}</td><td>${blank(cT, 'w3')}</td>
            <td>${blank(iT, 'w3')}</td><td>${blank(dT, 'w3')}</td><td>${blank(delta, 'w3')}</td>
        </tr>`;
    }

    function membershipTotalOnlyRow(label, prev, curr, inc, dec, key) {
        const iRaw = memVal(inc, key);
        const dRaw = memVal(dec, key);
        let delta = '';
        if (iRaw !== '' || dRaw !== '') {
            delta = String((Number(iRaw) || 0) - (Number(dRaw) || 0));
        }
        return `<tr>
            <td class="row-label">${escapeHtml(label)}</td>
            <td>${blank('', 'w3')}</td><td>${blank('', 'w3')}</td><td>${blank(memVal(prev, key), 'w3')}</td>
            <td>${blank('', 'w3')}</td><td>${blank('', 'w3')}</td><td>${blank(memVal(curr, key), 'w3')}</td>
            <td>${blank(iRaw, 'w3')}</td><td>${blank(dRaw, 'w3')}</td>
            <td>${blank(delta, 'w3')}</td>
        </tr>`;
    }

    function ensureStyles() {
        let style = document.getElementById('pr-business-report-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'pr-business-report-styles';
            document.head.appendChild(style);
        }
        style.textContent = `
            .pr-biz-form {
                border: 1px solid #222;
                padding: 14px 12px 18px;
                background: #fff;
                color: #111;
                font-size: 12px;
                line-height: 1.4;
                margin-bottom: 8px;
                max-width: 100%;
                box-sizing: border-box;
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
            }
            .pr-biz-form .biz-head {
                display: grid;
                grid-template-columns: 56px 1fr auto;
                gap: 8px;
                align-items: start;
                margin-bottom: 10px;
            }
            .pr-biz-form .biz-logo {
                width: 52px;
                height: 52px;
                border: 1px solid #999;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 9px;
                text-align: center;
                color: #555;
                line-height: 1.15;
            }
            .pr-biz-form .biz-titles { text-align: center; padding-top: 2px; }
            .pr-biz-form .biz-titles .org { font-size: 12px; font-weight: 700; }
            .pr-biz-form .biz-titles .doc-title { font-size: 12px; font-weight: 700; margin-top: 4px; }
            .pr-biz-form .biz-submit { font-size: 11px; text-align: right; white-space: nowrap; }
            .pr-biz-form .biz-affil { text-align: center; margin: 4px 0 10px; font-size: 12px; }
            .pr-biz-form .blank {
                display: inline-block;
                min-width: 2em;
                border-bottom: 1px solid #333;
                text-align: center;
                padding: 0 3px;
                min-height: 1.1em;
            }
            .pr-biz-form .blank.w3 { min-width: 2.4em; }
            .pr-biz-form .blank.w4 { min-width: 3.2em; }
            .pr-biz-form .blank.w6 { min-width: 4.5em; }
            .pr-biz-form .blank.w8 { min-width: 6em; }
            .pr-biz-form .blank.w12 { min-width: 9em; }
            @keyframes pr-biz-blank-blink {
                0%, 100% { border-bottom-color: #2563eb; box-shadow: 0 2px 0 rgba(37, 99, 235, 0.55); }
                50% { border-bottom-color: #93c5fd; box-shadow: 0 2px 0 rgba(147, 197, 253, 0.35); }
            }
            .pr-biz-form input.blank.blank-editable {
                border: none;
                border-bottom: 2px solid #2563eb;
                border-radius: 0;
                background: rgba(37, 99, 235, 0.06);
                color: #1e3a8a;
                font: inherit;
                font-size: inherit !important;
                line-height: 1.3;
                padding: 1px 4px;
                margin: 0 1px;
                min-height: 1.25em !important;
                height: auto !important;
                width: auto;
                max-width: 100%;
                box-sizing: border-box;
                animation: pr-biz-blank-blink 1.1s ease-in-out infinite;
            }
            .pr-biz-form input.blank.blank-editable:placeholder-shown {
                animation: pr-biz-blank-blink 1.1s ease-in-out infinite;
            }
            .pr-biz-form input.blank.blank-editable:not(:placeholder-shown),
            .pr-biz-form input.blank.blank-editable.has-value {
                animation: none;
                border-bottom-color: #1d4ed8;
                background: rgba(37, 99, 235, 0.04);
                color: #111;
            }
            .pr-biz-form input.blank.blank-editable:focus {
                outline: none;
                animation: none;
                border-bottom-color: #1d4ed8;
                background: rgba(37, 99, 235, 0.08);
            }
            .pr-biz-form .blank.blank-print {
                display: inline-block;
                min-width: 2em;
                border-bottom: 1px solid #333;
                text-align: center;
                padding: 0 3px;
                min-height: 1.1em;
            }
            .pr-biz-form table.biz-table {
                width: 100%;
                border-collapse: collapse;
                margin: 0 0 10px;
                font-size: 12px;
                table-layout: fixed;
                box-sizing: border-box;
            }
            .pr-biz-form table.biz-table th,
            .pr-biz-form table.biz-table td {
                border: 1px solid #333;
                padding: 4px 5px;
                text-align: center;
                vertical-align: middle;
                word-break: keep-all;
                overflow-wrap: anywhere;
            }
            .pr-biz-form table.biz-table th { background: #f3f4f6; font-weight: 600; }
            .pr-biz-form table.biz-table td.left,
            .pr-biz-form table.biz-table .row-label {
                text-align: left;
                white-space: normal;
            }
            .pr-biz-form .biz-sec-title {
                font-weight: 700;
                font-size: 12px;
                margin: 8px 0 4px;
            }
            .pr-biz-form .biz-scroll {
                width: 100%;
                max-width: 100%;
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
                margin-bottom: 10px;
            }
            .pr-biz-form .biz-scroll table.biz-table {
                table-layout: auto;
                min-width: 560px;
            }
            .pr-biz-form .biz-two-col {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 0;
                border: 1px solid #333;
                margin-bottom: 10px;
                max-width: 100%;
                box-sizing: border-box;
            }
            .pr-biz-form .biz-two-col > div { min-width: 0; overflow: hidden; }
            .pr-biz-form .biz-two-col > div:first-child { border-right: 1px solid #333; }
            .pr-biz-form .biz-two-col table {
                margin: 0;
                border: none;
                width: 100%;
                table-layout: fixed;
            }
            .pr-biz-form .biz-two-col table th,
            .pr-biz-form .biz-two-col table td { border-color: #333; }
            /* 행사 / 일자 / 참석 3열 비율 고정 — 참석열 잘림 방지 */
            .pr-biz-form .biz-two-col table th:nth-child(1),
            .pr-biz-form .biz-two-col table td:nth-child(1) { width: 46%; }
            .pr-biz-form .biz-two-col table th:nth-child(2),
            .pr-biz-form .biz-two-col table td:nth-child(2) { width: 36%; }
            .pr-biz-form .biz-two-col table th:nth-child(3),
            .pr-biz-form .biz-two-col table td:nth-child(3) { width: 18%; min-width: 2.5em; }
            .pr-biz-form .finance-grid {
                display: grid;
                grid-template-columns: 1fr 1.2fr auto;
                border: 1px solid #333;
                margin-bottom: 10px;
                max-width: 100%;
            }
            .pr-biz-form .finance-grid > div { border-right: 1px solid #333; min-width: 0; }
            .pr-biz-form .finance-grid > div:last-child { border-right: none; }
            .pr-biz-form .finance-grid h4 {
                margin: 0;
                padding: 4px;
                text-align: center;
                border-bottom: 1px solid #333;
                background: #f3f4f6;
                font-size: 12px;
            }
            .pr-biz-form .finance-grid table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 0; table-layout: fixed; }
            .pr-biz-form .finance-grid td { border-bottom: 1px solid #ddd; padding: 4px 6px; word-break: keep-all; overflow-wrap: anywhere; }
            .pr-biz-form .finance-grid tr:last-child td { border-bottom: none; }
            .pr-biz-form .finance-balance {
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                padding: 8px;
                min-width: 72px;
                font-weight: 700;
            }
            .pr-biz-form .biz-note { font-size: 12px; color: #666; margin-top: 4px; line-height: 1.45; }
            .pr-biz-form.pr-biz-pdf-export .biz-note { display: none !important; }
            @media (max-width: 720px) {
                .pr-biz-form {
                    padding: 10px 8px 14px;
                    overflow-x: visible;
                }
                .pr-biz-form .biz-two-col,
                .pr-biz-form .finance-grid { grid-template-columns: 1fr; }
                .pr-biz-form .biz-two-col > div:first-child,
                .pr-biz-form .finance-grid > div { border-right: none; border-bottom: 1px solid #333; }
                .pr-biz-form .biz-two-col > div:last-child,
                .pr-biz-form .finance-grid > div:last-child { border-bottom: none; }
                .pr-biz-form .biz-head { grid-template-columns: 48px 1fr; }
                .pr-biz-form .biz-submit { grid-column: 1 / -1; text-align: left; white-space: normal; }
                .pr-biz-form .biz-two-col table th:nth-child(1),
                .pr-biz-form .biz-two-col table td:nth-child(1) { width: 42%; }
                .pr-biz-form .biz-two-col table th:nth-child(2),
                .pr-biz-form .biz-two-col table td:nth-child(2) { width: 40%; }
                .pr-biz-form .biz-two-col table th:nth-child(3),
                .pr-biz-form .biz-two-col table td:nth-child(3) { width: 18%; min-width: 2.8em; }
                .pr-biz-form table.biz-table th,
                .pr-biz-form table.biz-table td { padding: 5px 4px; }
                .pr-biz-form .blank.w8,
                .pr-biz-form .blank.w12 { min-width: 4em; max-width: 100%; }
            }
        `;
    }

    function buildFormHtml(model) {
        const m = model || {};
        const officers = m.officers || [];
        const mem = m.membership || {};
        const prev = mem.previous || {};
        const curr = mem.current || {};
        const inc = mem.increase || {};
        const dec = mem.decrease || {};
        const att = m.attendance || {};
        const meeting = m.meeting || {};
        const fin = m.finance || {};
        const start = parseYmd(m.start_date);
        const end = parseYmd(m.end_date);
        const today = parseYmd(m.submit_date) || parseYmd(new Date().toISOString().slice(0, 10));

        const president = officerName(officers, '단장');
        const vp = officerName(officers, '부단장');
        const secretary = officerName(officers, '서기');
        const treasurer = officerName(officers, '회계');
        const memberAtt = ratioBlank(att.members_present, att.members_total);

        const events = m.events || [];
        const fixedRows = FIXED_EVENTS.map((def) => {
            const ev = matchEvent(events, def.labels);
            const info = eventDateAtt(ev);
            return `<tr>
                <td class="left">${cell(formatEventRowLabel(def.title, ev))}</td>
                <td>${cell(info.date)}</td>
                <td>${cell(info.attendance)}</td>
            </tr>`;
        }).join('');

        const otherRows = OTHER_EVENTS.map((def) => {
            const ev = matchEvent(events, def.labels);
            const info = eventDateAtt(ev);
            return `<tr>
                <td class="left">${cell(formatEventRowLabel(def.title, ev))}</td>
                <td>${cell(info.date)}</td>
                <td>${cell(info.attendance)}</td>
            </tr>`;
        }).join('');

        // 교육/피정: education_events 우선, 없으면 events에서 추출 (실시·계획 모두)
        const eduSource = Array.isArray(m.education_events) && m.education_events.length
            ? m.education_events
            : events;
        const eduEvents = eduSource.filter((ev) => {
            const eventType = String(ev.event_type || '').trim();
            const title = String(ev.title || '');
            const content = String(ev.content || '');
            const organizer = String(ev.organizer || '');
            const isFixed = [...FIXED_EVENTS, ...OTHER_EVENTS].some((def) =>
                def.labels.some((lb) => title.includes(lb) || content.includes(lb))
            );
            if (isFixed) return false;
            if (eventType === '교육' || eventType === '피정및연수') return true;
            // education_events 소스면 이미 교육만 있음
            if (Array.isArray(m.education_events) && m.education_events.length) return true;
            const blob = `${eventType} ${title} ${content} ${organizer}`;
            return /교육|피정|연수/.test(blob);
        });
        const eduRows = [];
        const eduCount = Math.max(eduEvents.length, 1);
        for (let i = 0; i < Math.min(eduCount, 10); i++) {
            const ev = eduEvents[i];
            const info = eventDateAtt(ev);
            const kind = String(ev?.kind || '').trim();
            const parts = [];
            if (kind) parts.push(`[${kind}]`);
            const eduTitle = String(ev?.title || '').trim();
            const eduContent = String(ev?.content || '').trim();
            if (eduTitle) parts.push(eduTitle);
            else if (eduContent) parts.push(eduContent);
            if (eduContent && eduContent !== eduTitle) {
                parts.push(eduContent);
            }
            if (ev?.organizer && isHigherOrgLabel(ev.organizer)) {
                parts.push(`(주관:${String(ev.organizer).trim()})`);
            }
            const labelText = ev
                ? (parts.join(' ') || String(ev.event_type || ''))
                : '';
            eduRows.push(`<tr>
                <td class="left">${cell(labelText)}</td>
                <td>${cell(info.date)}</td>
                <td>${cell(info.attendance)}</td>
            </tr>`);
        }
        // 빈 칸 최소 1줄 유지 (자료 없을 때)
        while (eduRows.length < 1) {
            eduRows.push('<tr><td class="left"></td><td></td><td></td></tr>');
        }

        const activeKeys = { m: 'active_m', f: 'active_f', t: 'active_t' };
        const auxKeys = { m: 'aux_m', f: 'aux_f', t: 'aux_t' };

        return `
            <div class="pr-biz-form" id="prBusinessFormPrint">
                <div class="biz-head">
                    <div class="biz-logo">LEGIO<br>MARIAE</div>
                    <div class="biz-titles">
                        <div class="org">레지오 마리애</div>
                        <div class="doc-title">쁘레시디움 제 ${blank(m.report_seq, 'w4')} 차 사업 보고서</div>
                    </div>
                    <div class="biz-submit">
                        제출일: ${blank(today?.y, 'w4')} . ${blank(today?.m, 'w3')} . ${blank(today?.d, 'w3')} .
                    </div>
                </div>
                <div class="biz-affil">
                    천주교 ${blank(m.church_name, 'w8')} 성당
                    ${blank(m.council_name || m.curia_name, 'w8')} 직속
                    &nbsp; Pr: ${blank(m.pr_name, 'w12')}
                </div>

                <table class="biz-table">
                    <tr>
                        <th style="width:14%">설립일</th>
                        <td class="left">${blank(m.founded_y, 'w4')} 년 ${blank(m.founded_m, 'w3')} 월 ${blank(m.founded_d, 'w3')} 일</td>
                        <th style="width:14%">승인일</th>
                        <td class="left">${blank(m.approved_y, 'w4')} 년 ${blank(m.approved_m, 'w3')} 월 ${blank(m.approved_d, 'w3')} 일</td>
                    </tr>
                    <tr>
                        <th>보고기간</th>
                        <td colspan="3" class="left">
                            ${blank(start?.y, 'w4')} 년 ${blank(start?.m, 'w3')} 월 ~
                            ${blank(end?.y, 'w4')} 년 ${blank(end?.m, 'w3')} 월
                            (${blank(m.meeting_from, 'w3')}차 ~ ${blank(m.meeting_to, 'w3')}차)
                            (${blank(m.weeks, 'w3')}주간)
                        </td>
                    </tr>
                    <tr>
                        <th>주회합</th>
                        <td colspan="3" class="left">
                            요일 ${blank(meeting.weekday, 'w4')}
                            &nbsp; ${blank(meeting.hour, 'w3')} 시 ${blank(meeting.minute, 'w3')} 분
                            &nbsp; 장소 ${blank(meeting.place, 'w12')}
                        </td>
                    </tr>
                </table>

                <div class="biz-sec-title">간부</div>
                <div class="biz-scroll">
                <table class="biz-table">
                    <thead>
                        <tr>
                            <th>구분/성명(세례명)</th>
                            <th>영적지도자</th>
                            <th>대리자</th>
                            <th>단장</th>
                            <th>부단장</th>
                            <th>서기</th>
                            <th>회계</th>
                            <th>단원출석</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="row-label">성명(세례명)</td>
                            <td>${blank(m.spiritual_director, 'w8')}</td>
                            <td>${blank(m.proxy_name, 'w8')}</td>
                            <td>${blank(president, 'w8')}</td>
                            <td>${blank(vp, 'w8')}</td>
                            <td>${blank(secretary, 'w8')}</td>
                            <td>${blank(treasurer, 'w8')}</td>
                            <td>${memberAtt}</td>
                        </tr>
                        <tr>
                            <td class="row-label">출석상황</td>
                            <td>${ratioBlank()}</td><td>${ratioBlank()}</td><td>${ratioBlank()}</td>
                            <td>${ratioBlank()}</td><td>${ratioBlank()}</td><td>${ratioBlank()}</td>
                            <td>${ratioBlank(att.officers_present, att.officers_total)}</td>
                        </tr>
                        <tr>
                            <td class="row-label">평의회출석</td>
                            <td>${ratioBlank()}</td><td>${ratioBlank()}</td><td>${ratioBlank()}</td>
                            <td>${ratioBlank()}</td><td>${ratioBlank()}</td><td>${ratioBlank()}</td>
                            <td>${ratioBlank()}</td>
                        </tr>
                        <tr>
                            <td class="row-label">간부이동</td>
                            <td colspan="7" class="left">${blank(m.officer_change, 'w12')}</td>
                        </tr>
                    </tbody>
                </table>
                </div>

                <div class="biz-sec-title">단원 수</div>
                <div class="biz-scroll">
                <table class="biz-table">
                    <thead>
                        <tr>
                            <th rowspan="2">구분</th>
                            <th colspan="3">전차 보고 시</th>
                            <th colspan="3">현재</th>
                            <th colspan="3">증감</th>
                        </tr>
                        <tr>
                            <th>남</th><th>여</th><th>계</th>
                            <th>남</th><th>여</th><th>계</th>
                            <th>증가</th><th>감소</th><th>계</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${membershipRowHtml('행동단원', prev, curr, inc, dec, activeKeys)}
                        ${membershipTotalOnlyRow('쁘레또리움 단원', prev, curr, inc, dec, 'praetorian')}
                        ${membershipRowHtml('협조단원', prev, curr, inc, dec, auxKeys)}
                        ${membershipTotalOnlyRow('아쥬또리움 단원', prev, curr, inc, dec, 'adjutorian')}
                    </tbody>
                </table>
                </div>

                <div class="biz-sec-title">회계보고</div>
                <div class="finance-grid">
                    <div>
                        <h4>수입</h4>
                        <table>
                            <tr><td class="left">전차이월금</td><td>${blank(fin.carry_in, 'w6')}</td></tr>
                            <tr><td class="left">비밀 헌금</td><td>${blank(fin.secret_bag, 'w6')}</td></tr>
                            <tr><td class="left">${blank(fin.income_other_label, 'w8')}</td><td>${blank(fin.income_other, 'w6')}</td></tr>
                            <tr><td class="left">${blank('', 'w8')}</td><td>${blank('', 'w6')}</td></tr>
                            <tr><td class="left"><strong>수입계</strong></td><td>${blank(fin.income_total, 'w6')}</td></tr>
                        </table>
                    </div>
                    <div>
                        <h4>지출</h4>
                        <table>
                            <tr><td class="left">의연금</td><td>${blank((fin.expense_detail || {}).levy, 'w6')}</td></tr>
                            <tr><td class="left">꽃값</td><td>${blank((fin.expense_detail || {}).flower, 'w6')}</td></tr>
                            <tr><td class="left">초값</td><td>${blank((fin.expense_detail || {}).candle, 'w6')}</td></tr>
                            <tr><td class="left">위령미사예물</td><td>${blank((fin.expense_detail || {}).mass, 'w6')}</td></tr>
                            <tr><td class="left">인쇄비</td><td>${blank((fin.expense_detail || {}).print, 'w6')}</td></tr>
                            <tr><td class="left">${blank(fin.expense_other_label, 'w8')}</td><td>${blank(fin.expense_other, 'w6')}</td></tr>
                            <tr><td class="left"><strong>지출계</strong></td><td>${blank(fin.expense_total, 'w6')}</td></tr>
                        </table>
                    </div>
                    <div class="finance-balance">
                        <div>잔액</div>
                        <div>${blank(fin.balance, 'w6')}</div>
                    </div>
                </div>

                <div class="biz-two-col">
                    <div>
                        <table class="biz-table">
                            <thead>
                                <tr><th>행사</th><th>일자</th><th>참석</th></tr>
                            </thead>
                            <tbody>${fixedRows}</tbody>
                        </table>
                        <table class="biz-table">
                            <thead>
                                <tr><th>기타(행사)</th><th>일자</th><th>참석</th></tr>
                            </thead>
                            <tbody>${otherRows}</tbody>
                        </table>
                    </div>
                    <div>
                        <table class="biz-table">
                            <thead>
                                <tr><th>교육 및 피정</th><th>일자</th><th>참석</th></tr>
                            </thead>
                            <tbody>${eduRows.join('')}</tbody>
                        </table>
                    </div>
                </div>
                <p class="biz-note">※ DB에 있는 항목(성당·Pr·직속·설립/승인일·보고기간·주회합·간부 G1~G4·단원수·참석인원이 있는 행사)만 자동 기입됩니다. 파란 깜빡임 빈칸은 화면에만 직접 입력되며, PDF 출력 시 입력값이 포함됩니다(DB 저장 없음).</p>
            </div>
        `;
    }

    async function fetchPrMonthly(churchName, prName, year, month) {
        const qs = new URLSearchParams({
            church_name: churchName,
            pr_name: prName,
            year: String(year),
            month: String(month)
        });
        const res = await fetch(`/api/pr-monthly-report?${qs.toString()}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Pr 월례 자료 조회 실패 (${res.status})`);
        }
        return res.json();
    }

    async function fetchPrEvents(prName, startDate, endDate, churchName) {
        const qs = new URLSearchParams({
            type: 'pr',
            name: prName,
            start_date: startDate,
            end_date: endDate
        });
        if (churchName) qs.set('church_name', churchName);
        const res = await fetch(`/api/council-event-report?${qs.toString()}`);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data.events) ? data.events : [];
    }

    /**
     * @param {object} opts
     * @param {string} opts.churchName
     * @param {string} opts.prName
     * @param {string} opts.startDate YYYY-MM-DD
     * @param {string} opts.endDate YYYY-MM-DD
     * @param {HTMLElement} opts.container
     */
    async function render(opts) {
        ensureStyles();
        const container = opts.container;
        if (!container) return;

        const churchName = String(opts.churchName || '').trim();
        const prName = String(opts.prName || '').trim();
        const startDate = String(opts.startDate || '').trim();
        const endDate = String(opts.endDate || '').trim();

        if (!churchName || !prName || !startDate || !endDate) {
            container.innerHTML = '<div class="no-data">성당·Pr·기간을 선택한 뒤 일년 집계를 조회하세요.</div>';
            return;
        }

        container.innerHTML = '<div class="no-data">사업 보고서 양식을 불러오는 중…</div>';

        const end = parseYmd(endDate);
        let monthly = null;
        let events = [];
        let educationEvents = [];
        try {
            monthly = await fetchPrMonthly(churchName, prName, end?.year || new Date().getFullYear(), end?.month || (new Date().getMonth() + 1));
        } catch (error) {
            console.warn('Pr 사업보고 월례 API 실패:', error);
        }
        try {
            events = await fetchPrEvents(prName, startDate, endDate, churchName);
        } catch (error) {
            console.warn('Pr 사업보고 행사 API 실패:', error);
        }
        try {
            educationEvents = await fetchPrEducationFromSummary(churchName, prName, startDate, endDate);
        } catch (error) {
            console.warn('Pr 사업보고 교육·피정 조회 실패:', error);
        }

        // 교육·피정은 활동요약(회원소속) 기준으로 우선 수집하고, 행사 API 결과와 병합
        const councilEdu = (events || []).filter((ev) => {
            const t = String(ev.event_type || '');
            return t === '교육' || t === '피정및연수' || /교육|피정|연수/.test(`${t} ${ev.title || ''} ${ev.content || ''}`);
        });
        const mergedEducation = mergeEducationEvents(educationEvents, councilEdu);
        const otherEvents = (events || []).filter((ev) => {
            const t = String(ev.event_type || '');
            return !(t === '교육' || t === '피정및연수');
        });
        events = [...otherEvents, ...mergedEducation];

        const model = {
            church_name: churchName,
            pr_name: prName,
            start_date: startDate,
            end_date: endDate,
            submit_date: new Date().toISOString().slice(0, 10),
            council_name: monthly?.council_name || '',
            curia_name: monthly?.council_name || '',
            officers: monthly?.officers || [],
            membership: monthly?.membership || {},
            attendance: monthly?.attendance || {},
            meeting: monthly?.meeting || {},
            finance: monthly?.finance || {},
            spiritual_director: monthly?.spiritual_director || '',
            events,
            education_events: mergedEducation,
            meeting_from: monthly?.meeting_from || '',
            meeting_to: monthly?.meeting_to || '',
            weeks: '',
            report_seq: '',
            founded_y: '', founded_m: '', founded_d: '',
            approved_y: '', approved_m: '', approved_d: '',
            proxy_name: '',
            officer_change: ''
        };

        function splitYmd(raw) {
            if (raw == null || raw === '') return { y: '', m: '', d: '' };
            // API는 YYYY-MM-DD 문자열. ISO(UTC)면 로컬 일자로 보정
            if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
                return {
                    y: String(raw.getFullYear()),
                    m: String(raw.getMonth() + 1),
                    d: String(raw.getDate())
                };
            }
            const s = String(raw).trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                const [y, m, d] = s.split('-');
                return { y, m: String(Number(m)), d: String(Number(d)) };
            }
            const iso = s.match(/^(\d{4}-\d{2}-\d{2})T/);
            if (iso) {
                const dt = new Date(s);
                if (!Number.isNaN(dt.getTime())) {
                    return {
                        y: String(dt.getFullYear()),
                        m: String(dt.getMonth() + 1),
                        d: String(dt.getDate())
                    };
                }
                const [y, m, d] = iso[1].split('-');
                return { y, m: String(Number(m)), d: String(Number(d)) };
            }
            return { y: '', m: '', d: '' };
        }
        let foundedParts = splitYmd(monthly?.pr_founded_on);
        let approvedParts = splitYmd(monthly?.pr_approved_on);
        // 월례 API에 날짜가 없으면 회원 목록에서 Pr 공통 값 보완
        if (!foundedParts.y && !approvedParts.y) {
            try {
                const qs = new URLSearchParams({
                    church_name: churchName,
                    pr_name: prName
                });
                const memRes = await fetch(`/api/members?${qs.toString()}`);
                if (memRes.ok) {
                    const memData = await memRes.json();
                    const list = Array.isArray(memData) ? memData : (memData.members || memData.data || []);
                    for (const row of list) {
                        const f = splitYmd(row.pr_founded_on);
                        const a = splitYmd(row.pr_approved_on);
                        if (f.y || a.y) {
                            foundedParts = f;
                            approvedParts = a;
                            break;
                        }
                    }
                }
            } catch (e) {
                console.warn('Pr 설립·승인일 보완 조회 실패:', e);
            }
        }
        model.founded_y = foundedParts.y;
        model.founded_m = foundedParts.m;
        model.founded_d = foundedParts.d;
        model.approved_y = approvedParts.y;
        model.approved_m = approvedParts.m;
        model.approved_d = approvedParts.d;

        // 주간 수 추정
        try {
            const s = new Date(startDate);
            const e = new Date(endDate);
            const days = Math.max(0, Math.round((e - s) / 86400000) + 1);
            model.weeks = String(Math.round(days / 7));
        } catch (e) { /* ignore */ }

        container.innerHTML = buildFormHtml(model);
        wireBlankEditables(container);
    }

    function hide(container) {
        if (container) {
            container.innerHTML = '';
        }
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

    async function exportToPdf(formEl, meta) {
        if (!formEl) {
            throw new Error('출력할 사업 보고서 양식이 없습니다. 먼저 일년 집계를 조회해주세요.');
        }
        await ensurePdfLibraries();
        ensureStyles();

        formEl.classList.add('pr-biz-pdf-export');
        try {
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

                const stamp = new Date().toISOString().slice(0, 10);
                const prName = meta?.prName || '';
                const startDate = meta?.startDate || '';
                const endDate = meta?.endDate || '';
                const range = startDate && endDate ? `${startDate}_${endDate}` : stamp;
                const fileName = `Regio_Pr사업보고_${safeFilePart(prName)}_${safeFilePart(range)}.pdf`;
                pdf.save(fileName);
            });
        } finally {
            formEl.classList.remove('pr-biz-pdf-export');
        }
    }

    global.RegioPrBusinessReportForm = {
        render,
        hide,
        buildFormHtml,
        ensureStyles,
        exportToPdf
    };
})(typeof window !== 'undefined' ? window : global);
