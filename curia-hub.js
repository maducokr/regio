(function (global) {
    'use strict';

    const COUNCIL_LEVELS = [
        { key: 'curia', label: '꾸리아', nameField: 'curia_name', activityScope: 'curia' },
        { key: 'comitia', label: '꼬미시움', nameField: 'comitia_name', activityScope: 'comitia' },
        { key: 'regia', label: '레지아', nameField: 'regia_name', activityScope: 'regia' }
    ];

    /** Pr 보고 교구(지역) 4분류 */
    const PR_DIOCESE_OPTIONS = ['부산', '제주', '광주(전주)', '마산'];
    const PR_REPORT_DIOCESE_KEY = 'prReportDiocese';

    function normalizePrDiocese(value) {
        const s = String(value == null ? '' : value).trim();
        if (!s) return '';
        if (PR_DIOCESE_OPTIONS.includes(s)) return s;
        if (/제주/.test(s)) return '제주';
        if (/마산/.test(s)) return '마산';
        if (/광주|전주/.test(s)) return '광주(전주)';
        if (/부산/.test(s)) return '부산';
        return '';
    }

    function getSelectedPrDiocese() {
        try {
            return normalizePrDiocese(sessionStorage.getItem(PR_REPORT_DIOCESE_KEY) || '');
        } catch (e) {
            return '';
        }
    }

    function setSelectedPrDiocese(value) {
        const name = normalizePrDiocese(value);
        try {
            if (name) sessionStorage.setItem(PR_REPORT_DIOCESE_KEY, name);
            else sessionStorage.removeItem(PR_REPORT_DIOCESE_KEY);
        } catch (e) { /* ignore */ }
        return name;
    }

    async function fetchDiocesePrs(dioceseName, prType) {
        const name = normalizePrDiocese(dioceseName);
        if (!name) return [];
        const qs = new URLSearchParams({ diocese_name: name });
        const normalizedType = String(prType || '').trim();
        if (['성인', '직속', '청년', '소년'].includes(normalizedType)) {
            qs.set('pr_type', normalizedType);
        }
        const response = await fetch(`/api/diocese-prs?${qs.toString()}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) {
            throw new Error(data.error || '교구별 Pr 목록 조회에 실패했습니다.');
        }
        return Array.isArray(data.prs) ? data.prs : [];
    }

    function getLoggedInUser() {
        if (global.RegioAdminMenu && typeof RegioAdminMenu.getLoggedInUser === 'function') {
            return RegioAdminMenu.getLoggedInUser();
        }
        const raw = sessionStorage.getItem('userInfo') || localStorage.getItem('userInfo');
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (error) {
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
                diocese_name: row.diocese_name != null ? row.diocese_name : user.diocese_name,
                pr_name: row.pr_name != null ? row.pr_name : user.pr_name,
                pr_type: row.pr_type != null ? row.pr_type : user.pr_type,
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

    /** 로그인·API 등 후보에서 세나뚜스 표준명(대구/광주/서울) 추출 */
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

    /** 출력 양식용: 대구·광주만 전용, 그 외(서울·해외 등)는 서울 양식 */
    function formTemplateSenatus(name) {
        const s = resolveSenatusName(name);
        if (s === '대구' || s === '광주') return s;
        return '서울';
    }

    /** Pr 보고 4분류(부산·제주·광주(전주)·마산)는 광주 세나뚜스만 */
    function isGwangjuSenatusUser(user) {
        return resolveSenatusName(user?.senatus_name) === '광주';
    }

    /** DB에서 확인된 로그인 회원 세나뚜스로 세션을 맞춘다(잘못된 옛 값 덮어씀). */
    function rememberSenatusName(senatus, force) {
        const name = resolveSenatusName(senatus);
        if (!name) return;
        try {
            const raw = sessionStorage.getItem('userInfo') || localStorage.getItem('userInfo');
            if (!raw) return;
            const user = JSON.parse(raw);
            const current = resolveSenatusName(user?.senatus_name);
            if (!force && current && current === name) return;
            if (!force && current && current !== name) {
                // 로그인 회원 DB 값이 있으면 그쪽이 우선 — 단위 다수결로 덮지 않음
                return;
            }
            user.senatus_name = name;
            const next = JSON.stringify(user);
            sessionStorage.setItem('userInfo', next);
            localStorage.setItem('userInfo', next);
        } catch (e) {
            /* ignore */
        }
    }

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
        const t = dedupeReportBlockText(String(text || '').trim());
        const styleParts = [];
        if (minHeight) styleParts.push(`min-height:${minHeight}`);
        styleParts.push('white-space:pre-wrap');
        const styleAttr = ` style="${styleParts.join(';')}"`;
        const has = t ? ' has-value' : '';
        return `<div class="line-box blank-editable${has}"${styleAttr} contenteditable="true" data-placeholder="입력">${escapeHtml(t)}</div>`;
    }

    /** 월례 주요활동·질의 블록 중복 제거 (같은 본문이 두 번 이어진 경우) */
    function dedupeReportBlockText(text) {
        const raw = String(text || '').trim();
        if (!raw) return '';
        const blocks = raw.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
        if (blocks.length < 2) return raw;
        const seen = new Set();
        const out = [];
        for (const block of blocks) {
            const parts = block.split(/\n/);
            const body = parts.length > 1 ? parts.slice(1).join('\n').trim() : block;
            const key = (body || block).replace(/\s+/g, ' ').trim().toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(block);
        }
        // 전체 문자열이 앞뒤로 두 번 이어 붙여진 경우 (A+A)
        if (out.length >= 2 && out.length % 2 === 0) {
            const half = out.length / 2;
            const a = out.slice(0, half).join('\n\n');
            const b = out.slice(half).join('\n\n');
            if (a === b) return a;
        }
        return out.join('\n\n');
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
            const sync = () => box.classList.toggle('has-value', !!String(box.textContent || '').trim());
            sync();
            box.addEventListener('input', sync);
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
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            return await work();
        } finally {
            restore();
        }
    }

    function ensureStyles() {
        let style = document.getElementById('council-report-hub-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'council-report-hub-styles';
            document.head.appendChild(style);
        }
        style.textContent = `
            .council-hub-modal.modal { display:block; position:fixed; z-index:1000; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.5); overflow-y:auto; }
            .council-hub-modal .modal-content { background:#fff; margin:8% auto 40px; padding:28px 24px; border-radius:12px; width:90%; max-width:420px; position:relative; box-sizing:border-box; }
            .council-hub-modal .modal-content.wide { max-width:980px; width:min(980px, 96vw); }
            @media (max-width: 767.98px) {
                .council-hub-modal.modal { padding:8px; }
                .council-hub-modal .modal-content,
                .council-hub-modal .modal-content.wide {
                    width: calc(100vw - 16px) !important;
                    max-width: calc(100vw - 16px) !important;
                    margin: 8px auto 16px !important;
                    padding: 16px 12px !important;
                    max-height: calc(100dvh - 24px);
                    overflow-y: auto;
                }
            }
            .council-hub-modal .close { color:#aaa; float:right; font-size:28px; font-weight:bold; position:absolute; right:18px; top:12px; cursor:pointer; }
            .council-hub-modal .close:hover { color:#000; }
            .council-hub-modal h2 { text-align:center; margin:0 0 8px; color:#1f2937; font-size: 12px; }
            .council-hub-modal .hub-sub { text-align:center; margin:0 0 20px; color:#64748b; font-size: 12px; }
            .council-hub-modal .hub-actions { display:flex; flex-direction:column; gap:10px; }
            .council-hub-modal .hub-btn { width:100%; padding:14px 16px; border:1px solid #dbe3ee; border-radius:10px; background:#f8fafc; color:#334155; font-size: 12px; font-weight:700; cursor:pointer; }
            .council-hub-modal .hub-btn:hover { border-color:#4A90E2; color:#4A90E2; background:#eef5fc; }
            .council-hub-modal .hub-btn.primary { background:#4A90E2; border-color:#4A90E2; color:#fff; }
            .council-hub-modal .hub-btn.primary:hover { background:#357ABD; }
            .council-hub-modal .org-toolbar { display:flex; gap:8px; align-items:stretch; margin-bottom:14px; flex-wrap:wrap; }
            .council-hub-modal .org-toolbar input, .council-hub-modal .org-toolbar select { flex:1; min-width:100px; padding:11px 12px; border:1px solid #dbe3ee; border-radius:8px; font-size: 12px; }
            .council-hub-modal .org-toolbar button { flex-shrink:0; padding:0 14px; border:none; border-radius:8px; background:#4A90E2; color:#fff; font-weight:600; cursor:pointer; min-height:42px; }
            .council-hub-modal .org-toolbar button.pdf-btn { background:#16a34a; }
            .council-hub-modal .org-toolbar button.pdf-btn:hover { background:#15803d; }
            .council-hub-modal .org-toolbar button.pdf-btn:disabled { background:#94a3b8; cursor:not-allowed; }
            .council-hub-modal .org-toolbar button.excel-btn { background:#2563eb; }
            .council-hub-modal .org-toolbar button.excel-btn:hover { background:#1d4ed8; }
            .council-hub-modal .org-toolbar button.excel-btn:disabled { background:#94a3b8; cursor:not-allowed; }
            .council-hub-modal .org-toolbar button.hwp-btn { background:#7c3aed; }
            .council-hub-modal .org-toolbar button.hwp-btn:hover { background:#6d28d9; }
            .council-hub-modal .org-toolbar button.hwp-btn:disabled { background:#94a3b8; cursor:not-allowed; }
            .council-hub-modal .org-meta { margin:0 0 12px; color:#555; font-size: 12px; line-height:1.5; }
            .council-hub-modal .org-pr-block { margin-bottom:18px; }
            .council-hub-modal .org-pr-title { margin:0 0 8px; padding:8px 10px; background:#eef5fc; border-radius:8px; color:#357ABD; font-size: 12px; font-weight:700; }
            .council-hub-modal .org-table-wrap { overflow-x:auto; }
            .council-hub-modal table { width:100%; border-collapse:collapse; font-size: 12px; }
            .council-hub-modal th, .council-hub-modal td { border:1px solid #e2e8f0; padding:8px 10px; text-align:left; }
            .council-hub-modal th { background:#f8fafc; color:#475569; font-weight:600; white-space:nowrap; }
            .council-hub-modal td { color:#334155; }
            .council-hub-modal .empty { padding:24px; text-align:center; color:#888; }
            .council-hub-modal .back-row { margin-top:16px; display:flex; gap:8px; }
            .council-hub-modal .back-row button { flex:1; padding:12px; border:1px solid #dbe3ee; border-radius:8px; background:#fff; color:#64748b; font-weight:600; cursor:pointer; }

            .curia-monthly-form { border:1px solid #333; padding:16px 14px 20px; background:#fff; color:#111; font-size:12px; line-height:1.45; }
            .curia-monthly-form .form-head { text-align:center; margin-bottom:12px; }
            .curia-monthly-form .form-head .org-en { font-size:11px; letter-spacing:0.5px; }
            .curia-monthly-form .form-head .org-ko { font-size: 12px; margin-top:2px; }
            .curia-monthly-form .form-title { font-size: 12px; font-weight:700; margin:8px 0 4px; }
            .curia-monthly-form .form-asof { font-size: 12px; margin-bottom:10px; }
            .curia-monthly-form .form-curia-name { text-align:right; font-size:12px; margin-bottom:8px; }
            .curia-monthly-form .sec { margin:10px 0; }
            .curia-monthly-form .sec-title { font-weight:700; margin-bottom:4px; }
            .curia-monthly-form .blank { display:inline-block; min-width:2.2em; border-bottom:1px solid #333; text-align:center; padding:0 4px; min-height:1.1em; vertical-align:baseline; }
            .curia-monthly-form .blank.w4 { min-width:3.5em; }
            .curia-monthly-form .blank.w6 { min-width:5em; }
            .curia-monthly-form .blank.w10 { min-width:8em; }
            .curia-monthly-form .blank.w20 { min-width:14em; }
            /* Pr 월례 7.회계 금액칸 포함 — 빈칸·수정표시 라인 기본 2mm, 내용에 따라 확장 */
            .curia-monthly-form .blank.amt,
            .council-hub-modal .curia-monthly-form input.blank.amt.blank-editable,
            .council-hub-modal .curia-monthly-form input.blank.blank-editable,
            .curia-monthly-form input.blank.blank-editable {
                min-width:2mm !important;
                width:2mm;
                max-width:100%;
                field-sizing:content;
            }
            @keyframes monthly-blank-blink {
                0%, 100% { border-bottom-color:#dc2626; box-shadow:0 2px 0 rgba(220,38,38,0.55); }
                50% { border-bottom-color:#fca5a5; box-shadow:0 2px 0 rgba(252,165,165,0.35); }
            }
            /* 모달 전역 input 스타일(.modal-content input)보다 우선 — 빈칸 직접입력 */
            .council-hub-modal .curia-monthly-form input.blank.blank-editable,
            .curia-monthly-form input.blank.blank-editable {
                display:inline-block !important;
                width:2mm;
                min-width:2mm !important;
                max-width:100% !important;
                margin:0 1px !important;
                padding:1px 2px !important;
                border:none !important;
                border-bottom:2px solid #dc2626 !important;
                border-radius:0 !important;
                background:rgba(220,38,38,0.08) !important;
                color:#7f1d1d !important;
                font:inherit !important;
                font-size:inherit !important;
                line-height:1.3 !important;
                min-height:1.25em !important;
                height:auto !important;
                box-sizing:border-box !important;
                vertical-align:baseline !important;
                box-shadow:0 2px 0 rgba(220,38,38,0.45);
                animation:monthly-blank-blink 1.1s ease-in-out infinite !important;
                field-sizing:content;
            }
            .curia-monthly-form .blank.w4.blank-editable,
            .council-hub-modal .curia-monthly-form input.blank.w4.blank-editable,
            .curia-monthly-form .blank.w6.blank-editable,
            .council-hub-modal .curia-monthly-form input.blank.w6.blank-editable,
            .curia-monthly-form .blank.w10.blank-editable,
            .council-hub-modal .curia-monthly-form input.blank.w10.blank-editable,
            .curia-monthly-form .blank.w20.blank-editable,
            .council-hub-modal .curia-monthly-form input.blank.w20.blank-editable {
                min-width:2mm !important;
            }
            /* DB·기입된 값: 파란색 / 빈칸: 위 빨간색 깜빡임 */
            .council-hub-modal .curia-monthly-form input.blank.blank-editable:not(:placeholder-shown),
            .council-hub-modal .curia-monthly-form input.blank.blank-editable.has-value,
            .curia-monthly-form input.blank.blank-editable:not(:placeholder-shown),
            .curia-monthly-form input.blank.blank-editable.has-value {
                animation:none !important;
                border-bottom-color:#2563eb !important;
                background:rgba(37,99,235,0.06) !important;
                color:#1d4ed8 !important;
                box-shadow:none;
            }
            .council-hub-modal .curia-monthly-form input.blank.blank-editable:focus,
            .curia-monthly-form input.blank.blank-editable:focus {
                outline:none !important;
                animation:none !important;
                border-bottom-color:#2563eb !important;
                background:rgba(37,99,235,0.1) !important;
                color:#1d4ed8 !important;
            }
            .curia-monthly-form .blank-print {
                display:inline-block; min-width:2.2em; border-bottom:1px solid #333; color:#111;
                animation:none !important; background:transparent !important; box-shadow:none !important;
                padding:0 4px; text-align:center;
            }
            .curia-monthly-form .line-box { border:1px solid #333; min-height:42px; padding:6px 8px; margin-top:4px; }
            .curia-monthly-form .line-box.blank-editable {
                border-color:#dc2626 !important; background:rgba(220,38,38,0.04) !important; color:#7f1d1d;
                outline:none; animation:monthly-blank-blink 1.1s ease-in-out infinite; cursor:text;
            }
            .curia-monthly-form .line-box.blank-editable.has-value,
            .curia-monthly-form .line-box.blank-editable:focus {
                animation:none !important;
                border-color:#2563eb !important;
                color:#1d4ed8 !important;
                background:rgba(37,99,235,0.06) !important;
            }
            .curia-monthly-form .line-box.blank-editable:empty::before {
                content:attr(data-placeholder); color:#f87171; pointer-events:none;
            }
            .curia-monthly-form table.form-table { width:100%; border-collapse:collapse; margin-top:4px; font-size:11px; }
            .curia-monthly-form table.form-table th,
            .curia-monthly-form table.form-table td { border:1px solid #333; padding:4px 5px; text-align:center; vertical-align:middle; }
            .curia-monthly-form table.form-table th { background:#f3f4f6; font-weight:600; }
            .curia-monthly-form table.form-table td.left { text-align:left; }
            .curia-monthly-form.pr-monthly-daegu .daegu-act-table td { font-size:10px; vertical-align:top; }
            .curia-monthly-form.pr-monthly-daegu .daegu-act-table th { font-size:11px; }
            .curia-monthly-form.council-monthly-daegu .daegu-act-table td { font-size:10px; vertical-align:top; }
            .curia-monthly-form.council-monthly-daegu .daegu-act-table th { font-size:11px; }
            .curia-monthly-form.council-monthly-daegu .daegu-council-mem { font-size:10px; }
            .curia-monthly-form.council-monthly-daegu .daegu-council-mem th,
            .curia-monthly-form.council-monthly-daegu .daegu-council-mem td { padding:3px 2px; }
            .curia-monthly-form.council-monthly-gwangju .gj-council-status { font-size:10px; }
            .curia-monthly-form.council-monthly-gwangju .gj-council-status th,
            .curia-monthly-form.council-monthly-gwangju .gj-council-status td { padding:3px 2px; }
            .curia-monthly-form .finance-wrap { display:grid; grid-template-columns:1fr 1fr; gap:0; border:1px solid #333; }
            .curia-monthly-form .finance-col { border-right:1px solid #333; }
            .curia-monthly-form .finance-col:last-child { border-right:none; }
            .curia-monthly-form .finance-col h4 { margin:0; padding:6px; text-align:center; border-bottom:1px solid #333; background:#f3f4f6; font-size:12px; }
            .curia-monthly-form .finance-col table { width:100%; border-collapse:collapse; font-size:11px; }
            .curia-monthly-form .finance-col td { border-bottom:1px solid #ddd; padding:5px 8px; }
            .curia-monthly-form .finance-col tr:last-child td { border-bottom:none; }
            .curia-monthly-form .finance-balance { border:1px solid #333; border-top:none; padding:6px 10px; text-align:right; }
            .curia-monthly-form .note { margin-top:8px; font-size:11px; color:#666; }
            .curia-monthly-form .org-table-wrap {
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
                max-width: 100%;
            }
            @media (max-width: 720px) {
                .curia-monthly-form {
                    padding: 10px 8px 14px;
                    font-size: 11px;
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                    max-width: 100%;
                    box-sizing: border-box;
                }
                .curia-monthly-form .form-head .org-ko { font-size: 11px; }
                .curia-monthly-form .form-title { font-size: 11px; }
                .curia-monthly-form .form-asof,
                .curia-monthly-form .form-curia-name { font-size: 11px; }
                .curia-monthly-form .sec { margin: 8px 0; }
                .curia-monthly-form .sec-title { font-size: 11px; }
                .curia-monthly-form table.form-table { font-size: 10px; }
                .curia-monthly-form table.form-table th,
                .curia-monthly-form table.form-table td { padding: 3px 2px; }
                .curia-monthly-form .org-table-wrap table.form-table { min-width: 480px; }
                .curia-monthly-form .finance-wrap { grid-template-columns: 1fr; }
                .curia-monthly-form .finance-col { border-right: none; border-bottom: 1px solid #333; }
                .curia-monthly-form .finance-col:last-child { border-bottom: none; }
                .curia-monthly-form .finance-col h4 { font-size: 11px; padding: 5px 4px; }
                .curia-monthly-form .finance-col table { font-size: 10px; }
                .curia-monthly-form .finance-col td { padding: 4px 5px; }
                .curia-monthly-form .finance-balance { padding: 5px 8px; font-size: 10px; }
                .curia-monthly-form .line-box { min-height: 36px; padding: 5px 6px; }
                .curia-monthly-form.pr-monthly-daegu .daegu-act-table td,
                .curia-monthly-form.council-monthly-daegu .daegu-act-table td { font-size: 9px; }
                .curia-monthly-form.pr-monthly-daegu .daegu-act-table th,
                .curia-monthly-form.council-monthly-daegu .daegu-act-table th { font-size: 10px; }
                .curia-monthly-form.council-monthly-daegu .daegu-council-mem,
                .curia-monthly-form.council-monthly-gwangju .gj-council-status { font-size: 9px; }
                .curia-monthly-form.pr-monthly-daegu .org-table-wrap .form-table { min-width: 620px; }
                .curia-monthly-form.council-monthly-daegu .org-table-wrap .daegu-council-mem { min-width: 920px; }
                .curia-monthly-form.pr-monthly-gwangju .org-table-wrap .form-table { min-width: 680px; }
                .curia-monthly-form.council-monthly-gwangju .org-table-wrap .gj-council-status { min-width: 980px; }
                .curia-monthly-form.council-monthly-gwangju .org-table-wrap .form-table:not(.gj-council-status) { min-width: 640px; }
            }
        `;
    }

    function closeModal(modal) {
        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    }

    function getLevelMeta(key) {
        return COUNCIL_LEVELS.find((item) => item.key === key) || null;
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

    function safeFilePart(value) {
        return String(value || '')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, '_')
            .slice(0, 40) || 'report';
    }

    async function exportMonthlyFormToPdf(formEl, meta) {
        if (!formEl) {
            throw new Error('출력할 월례보고 양식이 없습니다. 먼저 조회해주세요.');
        }
        await ensurePdfLibraries();

        const label = meta?.label || '평의회';
        const name = meta?.name || '';
        const year = meta?.year || '';
        const month = meta?.month || '';
        const noteEl = formEl.querySelector('.note');
        const noteDisplay = noteEl ? noteEl.style.display : '';
        if (noteEl) noteEl.style.display = 'none';

        try {
            await withFrozenBlanks(formEl, async () => {
                const canvas = global.RegioPdfShare && typeof global.RegioPdfShare.captureFormToCanvas === 'function'
                    ? await global.RegioPdfShare.captureFormToCanvas(formEl)
                    : await global.html2canvas(formEl, {
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
                const imgWidth = usableWidth;
                // 캔버스를 페이지 높이만큼 잘라 넣어 페이지 경계에서 내용이 겹쳐 보이지 않게 함
                const pxPerMm = canvas.width / imgWidth;
                const pageSlicePx = Math.max(1, Math.floor(usableHeight * pxPerMm));
                let srcY = 0;
                let pageIndex = 0;
                while (srcY < canvas.height) {
                    const slicePx = Math.min(pageSlicePx, canvas.height - srcY);
                    const sliceCanvas = document.createElement('canvas');
                    sliceCanvas.width = canvas.width;
                    sliceCanvas.height = slicePx;
                    const ctx = sliceCanvas.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
                    ctx.drawImage(
                        canvas,
                        0, srcY, canvas.width, slicePx,
                        0, 0, canvas.width, slicePx
                    );
                    const sliceMm = slicePx / pxPerMm;
                    const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.95);
                    if (pageIndex > 0) pdf.addPage();
                    pdf.addImage(sliceData, 'JPEG', margin, margin, imgWidth, sliceMm);
                    srcY += slicePx;
                    pageIndex += 1;
                    if (pageIndex > 40) break;
                }

                const stamp = new Date().toISOString().slice(0, 10);
                const fileName = `Regio_${safeFilePart(label)}월례보고_${safeFilePart(name)}_${year}-${String(month).padStart(2, '0')}_${stamp}.pdf`;
                if (global.RegioPdfShare && typeof global.RegioPdfShare.deliverJsPdf === 'function') {
                    await global.RegioPdfShare.deliverJsPdf(pdf, fileName, {
                        title: `${label} 월례보고`,
                        text: `${name} ${year}년 ${month}월`
                    });
                } else {
                    pdf.save(fileName);
                }
            });
        } finally {
            if (noteEl) noteEl.style.display = noteDisplay;
        }
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

    async function ensureXlsxLibrary() {
        if (global.XLSX) return;
        await loadScript('https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js');
        if (!global.XLSX) throw new Error('Excel 라이브러리를 불러오지 못했습니다.');
    }

    function monthlyExportBase(meta) {
        const label = meta?.label || '평의회';
        const name = meta?.name || '';
        const year = meta?.year || '';
        const month = meta?.month || '';
        const stamp = new Date().toISOString().slice(0, 10);
        return `Regio_${safeFilePart(label)}월례보고_${safeFilePart(name)}_${year}-${String(month).padStart(2, '0')}_${stamp}`;
    }

    async function exportMonthlyFormToExcel(formEl, meta) {
        if (!formEl) throw new Error('출력할 월례보고 양식이 없습니다. 먼저 조회해주세요.');
        await ensureXlsxLibrary();
        const noteEl = formEl.querySelector('.note');
        const noteDisplay = noteEl ? noteEl.style.display : '';
        if (noteEl) noteEl.style.display = 'none';
        try {
            await withFrozenBlanks(formEl, async () => {
                const rows = [];
                const label = meta?.label || '월례';
                rows.push([`${label} 월례 보고서`]);
                rows.push(['명칭', meta?.name || '']);
                rows.push(['기간', `${meta?.year || ''}년 ${meta?.month || ''}월`]);
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

                const blocks = [];
                formEl.querySelectorAll('.sec, .line-box').forEach((el) => {
                    const text = String(el.innerText || '').replace(/\s+/g, ' ').trim();
                    if (text) blocks.push([text]);
                });
                if (blocks.length) {
                    rows.push(['본문']);
                    blocks.forEach((b) => rows.push(b));
                }

                const worksheet = global.XLSX.utils.aoa_to_sheet(rows);
                worksheet['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
                const workbook = global.XLSX.utils.book_new();
                global.XLSX.utils.book_append_sheet(workbook, worksheet, '월례보고');
                global.XLSX.writeFile(workbook, `${monthlyExportBase(meta)}.xlsx`);
            });
        } finally {
            if (noteEl) noteEl.style.display = noteDisplay;
        }
    }

    function exportMonthlyFormToHangul(formEl, meta) {
        if (!formEl) throw new Error('출력할 월례보고 양식이 없습니다. 먼저 조회해주세요.');
        const label = meta?.label || '월례';
        const noteEl = formEl.querySelector('.note');
        const noteDisplay = noteEl ? noteEl.style.display : '';
        if (noteEl) noteEl.style.display = 'none';
        const restore = freezeBlankInputsForExport(formEl);
        try {
            const html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="utf-8">
    <meta name="Generator" content="Regio">
    <title>${escapeHtml(label)} 월례 보고서</title>
    <style>
        body { font-family: '맑은 고딕', 'Malgun Gothic', sans-serif; padding: 20px; color: #111; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11px; }
        th, td { border: 1px solid #333; padding: 4px; text-align: center; vertical-align: middle; }
        .left { text-align: left; }
        .line-box { border: 1px solid #333; min-height: 48px; padding: 8px; white-space: pre-wrap; }
        .blank, .blank-print { display: inline; border-bottom: none; }
        input { display: none !important; }
    </style>
</head>
<body>
    <h1>${escapeHtml(label)} 월례 보고서</h1>
    <p>${escapeHtml(meta?.name || '')} · ${escapeHtml(String(meta?.year || ''))}년 ${escapeHtml(String(meta?.month || ''))}월</p>
    ${formEl.innerHTML}
</body>
</html>`;
            downloadBlob('\ufeff' + html, 'text/html;charset=utf-8', `${monthlyExportBase(meta)}.html`);
            alert('한글(아래한글)에서 "파일 > 열기"로 저장된 HTML 파일을 열 수 있습니다.');
        } finally {
            restore();
            if (noteEl) noteEl.style.display = noteDisplay;
        }
    }

    function orgCellsCuria(row) {
        const r = row || {};
        return [
            r.pr_adult, r.pr_junior,
            r.active_adult_m, r.active_adult_f, r.active_adult_t,
            r.active_junior_m, r.active_junior_f, r.active_junior_t,
            r.praetorian,
            r.aux_m, r.aux_f, r.aux_t,
            r.adjutorian
        ].map((v) => `<td>${blank(v, 'w4')}</td>`).join('');
    }

    function orgCellsComitia(row) {
        const r = row || {};
        // 꼬미시움 양식: Cu.수 + Pr.수 + 행동단원 + 쁘레 + 협조(단일) + 아듀
        return [
            r.cu_adult, r.cu_junior,
            r.pr_adult, r.pr_junior,
            r.active_adult_m, r.active_adult_f, r.active_adult_t,
            r.active_junior_m, r.active_junior_f, r.active_junior_t,
            r.praetorian,
            r.aux_t,
            r.adjutorian
        ].map((v) => `<td>${blank(v, 'w4')}</td>`).join('');
    }

    function orgCellsRegia(row) {
        const r = row || {};
        // 레지아 양식: Co.수 + Cu.수 + Pr.수 + 행동단원 + 쁘레 + 협조(단일) + 아듀
        return [
            r.co_count,
            r.cu_adult, r.cu_junior,
            r.pr_adult, r.pr_junior,
            r.active_adult_m, r.active_adult_f, r.active_adult_t,
            r.active_junior_m, r.active_junior_f, r.active_junior_t,
            r.praetorian,
            r.aux_t,
            r.adjutorian
        ].map((v) => `<td>${blank(v, 'w4')}</td>`).join('');
    }

    function buildOrgStatusTableHtml(data) {
        const org = data.organization || {};
        const type = data.type || 'curia';

        if (type === 'regia') {
            return `
                <div class="org-table-wrap">
                    <table class="form-table">
                        <thead>
                            <tr>
                                <th rowspan="3">구분</th>
                                <th rowspan="3">Co. 수</th>
                                <th colspan="2">Cu. 수</th>
                                <th colspan="2">Pr. 수</th>
                                <th colspan="6">행동 단원</th>
                                <th rowspan="3">쁘레또리움<br>단원</th>
                                <th rowspan="3">협조<br>단원</th>
                                <th rowspan="3">아듀또리움<br>단원</th>
                            </tr>
                            <tr>
                                <th rowspan="2">성인</th>
                                <th rowspan="2">소년</th>
                                <th rowspan="2">성인</th>
                                <th rowspan="2">소년</th>
                                <th colspan="3">성인</th>
                                <th colspan="3">소년</th>
                            </tr>
                            <tr>
                                <th>남</th><th>여</th><th>계</th>
                                <th>남</th><th>여</th><th>계</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td>전월</td>${orgCellsRegia(org.previous)}</tr>
                            <tr><td>현재</td>${orgCellsRegia(org.current)}</tr>
                            <tr><td>증</td>${orgCellsRegia(org.increase)}</tr>
                            <tr><td>감</td>${orgCellsRegia(org.decrease)}</tr>
                        </tbody>
                    </table>
                </div>
            `;
        }

        if (type === 'comitia') {
            return `
                <div class="org-table-wrap">
                    <table class="form-table">
                        <thead>
                            <tr>
                                <th rowspan="3">구분</th>
                                <th colspan="2">Cu. 수</th>
                                <th colspan="2">Pr. 수</th>
                                <th colspan="6">행동 단원</th>
                                <th rowspan="3">쁘레또리움<br>단원</th>
                                <th rowspan="3">협조<br>단원</th>
                                <th rowspan="3">아쥬또리움<br>단원</th>
                            </tr>
                            <tr>
                                <th rowspan="2">성인</th>
                                <th rowspan="2">소년</th>
                                <th rowspan="2">성인</th>
                                <th rowspan="2">소년</th>
                                <th colspan="3">성인</th>
                                <th colspan="3">소년</th>
                            </tr>
                            <tr>
                                <th>남</th><th>여</th><th>계</th>
                                <th>남</th><th>여</th><th>계</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td>전월</td>${orgCellsComitia(org.previous)}</tr>
                            <tr><td>현재</td>${orgCellsComitia(org.current)}</tr>
                            <tr><td>증 증가</td>${orgCellsComitia(org.increase)}</tr>
                            <tr><td>감 감소</td>${orgCellsComitia(org.decrease)}</tr>
                        </tbody>
                    </table>
                </div>
            `;
        }

        // 꾸리아: Pr.수 중심 양식
        return `
            <div class="org-table-wrap">
                <table class="form-table">
                    <thead>
                        <tr>
                            <th rowspan="3">구분</th>
                            <th colspan="2">Pr. 수</th>
                            <th colspan="6">행동 단원</th>
                            <th rowspan="3">쁘레또리움<br>단원</th>
                            <th colspan="3">협조 단원</th>
                            <th rowspan="3">아쥬또리움<br>단원</th>
                        </tr>
                        <tr>
                            <th rowspan="2">성인</th>
                            <th rowspan="2">소년</th>
                            <th colspan="3">성인</th>
                            <th colspan="3">소년</th>
                            <th rowspan="2">남</th>
                            <th rowspan="2">여</th>
                            <th rowspan="2">계</th>
                        </tr>
                        <tr>
                            <th>남</th><th>여</th><th>계</th>
                            <th>남</th><th>여</th><th>계</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>전월</td>${orgCellsCuria(org.previous)}</tr>
                        <tr><td>현재</td>${orgCellsCuria(org.current)}</tr>
                        <tr><td>증 증가</td>${orgCellsCuria(org.increase)}</tr>
                        <tr><td>감 감소</td>${orgCellsCuria(org.decrease)}</tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    function buildMonthlyFormHtml(data) {
        const label = data.label || '꾸리아';
        const type = data.type || 'curia';
        const isRegia = type === 'regia';
        const councilName = data.council_name || data.curia_name || '';
        const officers = data.officers || [];
        const events = data.events || [];
        const fin = data.finance || { income: {}, expense: { others: [] } };
        const meeting = data.meeting || {};
        const att = data.attendance || {};

        // 레지아 공식 양식: 행사 4행 / 지출 기타 2행
        const minEventRows = isRegia ? 4 : 3;
        const eventRows = (events.length ? events : [{ kind: '', title: '', organizer: '', datetime: '', place: '', attendance: '' }])
            .concat(Array(Math.max(0, minEventRows - Math.max(events.length, 1))).fill({ kind: '', title: '', organizer: '', datetime: '', place: '', attendance: '' }))
            .slice(0, Math.max(minEventRows, events.length));

        const expenseOthers = isRegia
            ? (fin.expense.others || ['', '']).slice(0, 2).concat(['', '']).slice(0, 2)
            : (fin.expense.others || ['', '', '', '']);

        const officerNote = type === 'comitia' ? 'C1~C4'
            : isRegia ? 'R1~R4'
                : 'K1~K4';

        const officerSectionTitle = isRegia
            ? `4. 간부 명단 (영적지도자: ${blank(data.spiritual_director, 'w10')} 대리자: ${blank(data.spiritual_proxy, 'w10')})`
            : `4. 간부 명단 (${escapeHtml(label)} 직책)`;

        const officerExtra = isRegia ? '' : `
                    <div style="margin:4px 0 6px;">
                        영적지도자 ${blank(data.spiritual_director, 'w10')}
                        &nbsp;&nbsp;대리자 ${blank(data.spiritual_proxy, 'w10')}
                    </div>`;

        return `
            <div class="curia-monthly-form" id="curiaMonthlyFormPrint">
                <div class="form-head">
                    <div class="org-en">LEGIO MARIAE</div>
                    <div class="org-ko">레지오 마리애</div>
                    <div class="form-title">${escapeHtml(label)} 월례 보고서(${blank(data.report_no, 'w4')})차</div>
                    <div class="form-asof">
                        ${blank(data.year, 'w6')}년
                        ${blank(data.month, 'w4')}월말 현재
                    </div>
                </div>
                <div class="form-curia-name">${escapeHtml(label)}명: ${blank(councilName, 'w20')}</div>

                <div class="sec">
                    <div class="sec-title">1. 회합 일시 :</div>
                    <div>
                        ${blank(meeting.year, 'w6')}년
                        ${blank(meeting.month, 'w4')}월
                        ${blank(meeting.day, 'w4')}일
                        (${blank(meeting.weekday, 'w4')})요일
                        ${blank(meeting.hour, 'w4')}시
                        ${blank(meeting.minute, 'w4')}분
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">2. 장소 :</div>
                    <div>${blank(meeting.place, 'w20')}</div>
                </div>

                <div class="sec">
                    <div class="sec-title">3. 출석상황 :</div>
                    <div>
                        간부 ${blank(att.officers_present, 'w4')} /
                        ${blank(att.officers_total, 'w4')}
                        &nbsp;&nbsp;의원 ${blank(att.members_present, 'w4')} /
                        ${blank(att.members_total, 'w4')}
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">${officerSectionTitle}</div>
                    ${officerExtra}
                    <div class="org-table-wrap">
                        <table class="form-table">
                            <thead>
                                <tr>
                                    <th>구분</th><th>성명</th><th>세례명</th><th>선출일</th><th>참고 사항</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${officers.map((o) => `
                                    <tr>
                                        <td>${blank(o.role, 'w6')}</td>
                                        <td>${blank(o.name, 'w6')}</td>
                                        <td>${blank(o.baptism_name, 'w6')}</td>
                                        <td>${blank(o.elected_on, 'w6')}</td>
                                        <td>${blank(o.remark, 'w6')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">5. 조직 현황</div>
                    ${buildOrgStatusTableHtml(data)}
                </div>

                <div class="sec">
                    <div class="sec-title">6. 신설(해체)된 Pr. 또는 평의회 명칭 및 사유</div>
                    ${lineBoxHtml(data.new_or_dissolved)}
                </div>

                <div class="sec">
                    <div class="sec-title">7. 주요사항 (행사/교육/피정) &lt;구분 : 실시 또는 계획&gt;</div>
                    <div class="org-table-wrap">
                        <table class="form-table">
                            <thead>
                                <tr>
                                    <th>구분</th><th>제목</th><th>주관</th><th>일시</th><th>장소</th><th>참석</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${eventRows.map((e) => `
                                    <tr>
                                        <td>${blank(e.kind, 'w4')}</td>
                                        <td class="left">${blank(e.member_name ? `${e.title || ''} (${e.member_name})` : e.title, 'w10')}</td>
                                        <td>${blank(e.organizer, 'w6')}</td>
                                        <td>${blank(e.datetime, 'w6')}</td>
                                        <td>${blank(e.place, 'w6')}</td>
                                        <td>${blank(e.attendance, 'w4')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">8. 회계 보고</div>
                    <div class="finance-wrap">
                        <div class="finance-col">
                            <h4>수입</h4>
                            <table>
                                <tr><td>전월이월금</td><td style="text-align:right;">${blank(fin.income.brought_forward, 'w6')}</td></tr>
                                <tr><td>의연금</td><td style="text-align:right;">${blank(fin.income.contribution, 'w6')}</td></tr>
                                <tr><td>이자 수입</td><td style="text-align:right;">${blank(fin.income.interest, 'w6')}</td></tr>
                                <tr><td>상품비</td><td style="text-align:right;">${blank(fin.income.merchandise, 'w6')}</td></tr>
                                <tr><td><strong>수입 합계</strong></td><td style="text-align:right;">${blank(fin.income.total, 'w6')}</td></tr>
                            </table>
                        </div>
                        <div class="finance-col">
                            <h4>지출</h4>
                            <table>
                                <tr><td>의연금</td><td style="text-align:right;">${blank(fin.expense.contribution, 'w6')}</td></tr>
                                <tr><td>${isRegia ? '꽃 값' : '꽃값'}</td><td style="text-align:right;">${blank(fin.expense.flowers, 'w6')}</td></tr>
                                <tr><td>${isRegia ? '초 값' : '초값'}</td><td style="text-align:right;">${blank(fin.expense.candles, 'w6')}</td></tr>
                                ${expenseOthers.map((v) => `
                                    <tr><td>${blank('', 'w6')}</td><td style="text-align:right;">${blank(v, 'w6')}</td></tr>
                                `).join('')}
                                <tr><td><strong>지출 합계</strong></td><td style="text-align:right;">${blank(fin.expense.total, 'w6')}</td></tr>
                            </table>
                        </div>
                    </div>
                    <div class="finance-balance">잔액: ${blank(fin.balance, 'w10')}</div>
                </div>

                <div class="sec">
                    <div class="sec-title">9. 기타(질의 및 건의)</div>
                    ${lineBoxHtml(data.inquiries, '48px')}
                </div>

                <div class="sec seoul-curia-sign" style="display:flex; justify-content:space-between; align-items:flex-end; gap:24px; margin-top:20px; flex-wrap:wrap;">
                    <div style="line-height:1.9;">
                        ${blank('', 'w16')} (평의회)
                        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                        직속
                    </div>
                    <div style="text-align:right; line-height:1.9; min-width:14em;">
                        ${escapeHtml(label)} 단장
                        ${blank(data.president_name || (officers.find((o) => o.role === '단장') || {}).name, 'w10')}
                        (서명)
                    </div>
                </div>

                <p class="note">※ DB에서 불러온 값은 파란색, 직접 입력할 빈칸은 빨간색으로 깜박입니다. 출력물 내용은 PDF 전에 모두 수정할 수 있으며(저장 없음), PDF에는 수정한 내용이 포함됩니다.</p>
            </div>
        `;
    }

    function buildMonthlyHtml(data, levelKey) {
        // 꼬미시움/레지아도 공식 양식 사용 — 이 함수는 더 이상 사용하지 않음(하위호환)
        return buildMonthlyFormHtml({ ...data, label: levelKey === 'comitia' ? '꼬미시움' : '레지아', council_name: data.name });
    }

    async function fetchCouncilMonthlyReport(type, name, year, month) {
        const params = new URLSearchParams({ type, name, year, month });
        const response = await fetch(`/api/council-monthly-report?${params.toString()}`);
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || '월례보고 조회에 실패했습니다.');
        }
        return data;
    }

    function showMonthlyReportView(modal, levelKey) {
        const level = getLevelMeta(levelKey);
        if (!level) return;
        const user = getLoggedInUser();
        const initialName = String(user?.[level.nameField] || '').trim();
        const now = new Date();
        const defaultYear = now.getFullYear();
        const defaultMonth = now.getMonth() + 1;

        const content = modal.querySelector('.modal-content');
        content.classList.add('wide');

        content.innerHTML = `
            <span class="close">&times;</span>
            <h2>${escapeHtml(level.label)} 월례보고</h2>
            <p class="hub-sub">공식 양식에 DB 보유 항목만 자동 기입합니다. (대구·광주 전용 양식, 그 외 세나뚜스는 서울 양식 · 집계는 소속 세나뚜스 기준)</p>
            <div class="org-toolbar">
                <input type="text" id="councilMonthlyNameInput" placeholder="${escapeHtml(level.label)} 명칭" value="${escapeHtml(initialName)}">
                <select id="councilMonthlyYear"></select>
                <select id="councilMonthlyMonth"></select>
                <button type="button" id="councilMonthlySearchBtn">조회</button>
                <button type="button" class="pdf-btn" id="councilMonthlyPdfBtn" disabled>PDF</button>
                <button type="button" class="excel-btn" id="councilMonthlyExcelBtn" disabled>Excel</button>
                <button type="button" class="hwp-btn" id="councilMonthlyHwpBtn" disabled>한글</button>
            </div>
            <p class="org-meta" id="councilMonthlyMeta">조회 버튼을 눌러주세요.</p>
            <div id="councilMonthlyResult"><div class="empty">${escapeHtml(level.label)} 명칭을 입력하고 조회하세요.</div></div>
            <div class="back-row">
                <button type="button" id="councilMonthlyBackBtn">← ${escapeHtml(level.label)} 보고 선택</button>
            </div>
        `;

        const nameInput = content.querySelector('#councilMonthlyNameInput');
        const metaEl = content.querySelector('#councilMonthlyMeta');
        const resultEl = content.querySelector('#councilMonthlyResult');
        const yearSelect = content.querySelector('#councilMonthlyYear');
        const monthSelect = content.querySelector('#councilMonthlyMonth');
        const pdfBtn = content.querySelector('#councilMonthlyPdfBtn');
        const excelBtn = content.querySelector('#councilMonthlyExcelBtn');
        const hwpBtn = content.querySelector('#councilMonthlyHwpBtn');
        let lastReportMeta = null;

        function setExportEnabled(on) {
            pdfBtn.disabled = !on;
            excelBtn.disabled = !on;
            hwpBtn.disabled = !on;
        }

        for (let y = defaultYear; y >= defaultYear - 5; y -= 1) {
            const opt = document.createElement('option');
            opt.value = String(y);
            opt.textContent = `${y}년`;
            if (y === defaultYear) opt.selected = true;
            yearSelect.appendChild(opt);
        }
        for (let m = 1; m <= 12; m += 1) {
            const opt = document.createElement('option');
            opt.value = String(m);
            opt.textContent = `${m}월`;
            if (m === defaultMonth) opt.selected = true;
            monthSelect.appendChild(opt);
        }

        async function runSearch() {
            const name = nameInput.value.trim();
            if (!name) {
                alert(`${level.label} 명칭을 입력해주세요.`);
                return;
            }
            resultEl.innerHTML = '<div class="empty">불러오는 중...</div>';
            setExportEnabled(false);
            lastReportMeta = null;
            try {
                const data = await fetchCouncilMonthlyReport(
                    levelKey,
                    name,
                    yearSelect.value,
                    monthSelect.value
                );
                const liveUser = await refreshLoggedInUser();
                metaEl.textContent = `${data.label}: ${data.council_name} · ${data.year}년 ${data.month}월 · 회원 ${data.total_members}명${(liveUser?.senatus_name || data.senatus_name) ? ` · ${liveUser?.senatus_name || data.senatus_name}세나뚜스` : ''}`;
                const senatus = resolveSenatusName(
                    liveUser?.senatus_name,
                    data.senatus_name,
                    user?.senatus_name
                );
                const formSenatus = formTemplateSenatus(senatus);
                let formHtml;
                if (formSenatus === '대구') formHtml = buildCouncilMonthlyDaeguFormHtml(data);
                else if (formSenatus === '광주') formHtml = buildCouncilMonthlyGwangjuFormHtml(data);
                else formHtml = buildMonthlyFormHtml(data);
                resultEl.innerHTML = formHtml;
                wireBlankEditables(resultEl);
                lastReportMeta = {
                    label: data.label || level.label,
                    name: data.council_name || name,
                    year: data.year,
                    month: data.month
                };
                setExportEnabled(true);
            } catch (error) {
                metaEl.textContent = '';
                resultEl.innerHTML = `<div class="empty">${escapeHtml(error.message || '조회 실패')}</div>`;
            }
        }

        function getFormEl() {
            return resultEl.querySelector('#curiaMonthlyFormPrint');
        }

        async function runPdfExport() {
            const formEl = getFormEl();
            if (!formEl || !lastReportMeta) {
                alert('먼저 월례보고를 조회한 뒤 출력을 눌러주세요.');
                return;
            }
            const prevText = pdfBtn.textContent;
            setExportEnabled(false);
            pdfBtn.textContent = 'PDF 생성 중...';
            try {
                await exportMonthlyFormToPdf(formEl, lastReportMeta);
            } catch (error) {
                console.error('월례보고 PDF 오류:', error);
                alert('PDF 생성 중 오류가 발생했습니다: ' + (error.message || error));
            } finally {
                pdfBtn.textContent = prevText;
                setExportEnabled(!!getFormEl());
            }
        }

        async function runExcelExport() {
            const formEl = getFormEl();
            if (!formEl || !lastReportMeta) {
                alert('먼저 월례보고를 조회한 뒤 출력을 눌러주세요.');
                return;
            }
            const prevText = excelBtn.textContent;
            setExportEnabled(false);
            excelBtn.textContent = 'Excel 생성 중...';
            try {
                await exportMonthlyFormToExcel(formEl, lastReportMeta);
            } catch (error) {
                console.error('월례보고 Excel 오류:', error);
                alert('Excel 생성 중 오류가 발생했습니다: ' + (error.message || error));
            } finally {
                excelBtn.textContent = prevText;
                setExportEnabled(!!getFormEl());
            }
        }

        function runHwpExport() {
            const formEl = getFormEl();
            if (!formEl || !lastReportMeta) {
                alert('먼저 월례보고를 조회한 뒤 출력을 눌러주세요.');
                return;
            }
            try {
                exportMonthlyFormToHangul(formEl, lastReportMeta);
            } catch (error) {
                console.error('월례보고 한글 오류:', error);
                alert('한글 파일 생성 중 오류가 발생했습니다: ' + (error.message || error));
            }
        }

        content.querySelector('.close').onclick = () => closeModal(modal);
        content.querySelector('#councilMonthlyBackBtn').onclick = () => showReportTypeChooser(modal, levelKey);
        content.querySelector('#councilMonthlySearchBtn').onclick = runSearch;
        pdfBtn.onclick = runPdfExport;
        excelBtn.onclick = runExcelExport;
        hwpBtn.onclick = runHwpExport;
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                runSearch();
            }
        });

        if (initialName) runSearch();
    }

    function showReportTypeChooser(modal, levelKey) {
        const level = getLevelMeta(levelKey);
        if (!level) return;
        const content = modal.querySelector('.modal-content');
        content.classList.remove('wide');
        content.innerHTML = `
            <span class="close">&times;</span>
            <h2>${escapeHtml(level.label)}보고</h2>
            <p class="hub-sub">보고 종류를 선택하세요.</p>
            <div class="hub-actions">
                <button type="button" class="hub-btn" id="councilMonthlyBtn">월례보고</button>
                <button type="button" class="hub-btn primary" id="councilSummaryBtn">종합보고</button>
            </div>
        `;
        content.querySelector('.close').onclick = () => closeModal(modal);
        content.querySelector('#councilMonthlyBtn').onclick = () => showMonthlyReportView(modal, levelKey);
        content.querySelector('#councilSummaryBtn').onclick = () => {
            window.location.href = `activity-report.html?scope=${encodeURIComponent(level.activityScope)}`;
        };
    }

    function showCouncilReportHubModal() {
        ensureStyles();
        const user = getLoggedInUser();
        if (!user || !user.id) {
            alert('로그인이 필요합니다.');
            return;
        }
        refreshLoggedInUser().catch(() => {});

        const existing = document.querySelector('.council-hub-modal');
        if (existing) closeModal(existing);

        const modal = document.createElement('div');
        modal.className = 'modal council-hub-modal';
        modal.innerHTML = '<div class="modal-content"></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
        showReportTypeChooser(modal, 'curia');
    }

    function membershipCells(row) {
        const r = row || {};
        const v = (key) => blank(r[key] === null || r[key] === undefined ? '' : r[key], 'w4');
        return `
            <td>${v('active_m')}</td><td>${v('active_f')}</td><td>${v('active_t')}</td>
            <td>${v('praetorian')}</td>
            <td>${v('aux_m')}</td><td>${v('aux_f')}</td><td>${v('aux_t')}</td>
            <td>${v('adjutorian')}</td>
        `;
    }

    function formatMemberCompositionTrait(prType) {
        const t = String(prType || '').trim();
        if (t === '소년') return '소년';
        if (t === '직속') return '직속';
        if (t === '청년') return '청년';
        if (t === '성인') return '성인';
        return '성인';
    }

    function sumActivityTotals(totals, matcher, field) {
        const key = field || 'count';
        let n = 0;
        for (const row of totals || []) {
            const name = String(row.category_name || '');
            if (typeof matcher === 'function' ? matcher(name) : matcher.test(name)) {
                n += Number(row[key]) || 0;
            }
        }
        return n > 0 ? n : '';
    }

    function formatEventLineList(text) {
        return String(text || '').trim();
    }

    function computeDaeguActivityFields(totals) {
        return {
            neighbor: sumActivityTotals(totals, (n) => /가톨릭|가두선교|외인|개종|방문|복음선교/.test(n) && !/예비|교리반/.test(n)),
            catechismLead: sumActivityTotals(totals, (n) => /교리반\s*인도|교리반인도/.test(n))
                || sumActivityTotals(totals, (n) => /교리반/.test(n), 'catechism_guide'),
            catechumen: sumActivityTotals(totals, (n) => /예비신자|예비자/.test(n)),
            baptized: sumActivityTotals(totals, (n) => /예비신자|예비자|세례/.test(n), 'baptism')
                || sumActivityTotals(totals, (n) => /세례자|영세/.test(n)),
            familyCare: sumActivityTotals(totals, (n) => /가정|교우\s*돌봄|교우방문|가정을/.test(n)),
            groupJoin: sumActivityTotals(totals, (n) => /단체\s*가입|단체가입/.test(n), 'group_join')
                || sumActivityTotals(totals, (n) => /단체\s*가입|단체가입/.test(n)),
            sacramentInvite: sumActivityTotals(totals, (n) => /성사권유|혼인장애|회두|판공/.test(n)),
            conversion: sumActivityTotals(totals, (n) => /회두|개종/.test(n)),
            confession: sumActivityTotals(totals, (n) => /판공|고해/.test(n), 'sacrament')
                || sumActivityTotals(totals, (n) => /판공|고해/.test(n)),
            confirmation: sumActivityTotals(totals, (n) => /견진/.test(n), 'confirmation')
                || sumActivityTotals(totals, (n) => /견진/.test(n)),
            infantBaptism: sumActivityTotals(totals, (n) => /유아세례/.test(n), 'baptism')
                || sumActivityTotals(totals, (n) => /유아세례/.test(n)),
            marriageFix: sumActivityTotals(totals, (n) => /혼인장애/.test(n), 'resolution')
                || sumActivityTotals(totals, (n) => /혼인장애/.test(n)),
            neighborShare: sumActivityTotals(totals, (n) => /상가|위령|장례|병자|봉성체|대세|보례|병원|복지|어려움/.test(n)),
            funeralVisit: sumActivityTotals(totals, (n) => /상가/.test(n))
                || sumActivityTotals(totals, (n) => /상가/.test(n), 'funeral_attendance'),
            memorialPrayer: sumActivityTotals(totals, (n) => /위령기도|위령미사|보미사/.test(n))
                || sumActivityTotals(totals, (n) => /위령|보미사/.test(n), 'memorial_mass'),
            funeralMass: sumActivityTotals(totals, (n) => /장례미사/.test(n), 'funeral_mass')
                || sumActivityTotals(totals, (n) => /장례미사/.test(n)),
            burialEscort: sumActivityTotals(totals, (n) => /장지|장례수행|장지수행/.test(n)),
            anointing: sumActivityTotals(totals, (n) => /병자성사/.test(n)),
            sickCommunion: sumActivityTotals(totals, (n) => /봉성체/.test(n), 'conditional_communion')
                || sumActivityTotals(totals, (n) => /봉성체/.test(n)),
            conditionalBaptism: sumActivityTotals(totals, (n) => /대세/.test(n), 'conditional_baptism')
                || sumActivityTotals(totals, (n) => /대세/.test(n)),
            baptismComplete: sumActivityTotals(totals, (n) => /보례/.test(n)),
            hospital: sumActivityTotals(totals, (n) => /병원|복지시설|복지/.test(n)),
            shareOther: sumActivityTotals(totals, (n) => /나눔|돌봄-기타/.test(n)),
            parishOps: sumActivityTotals(totals, (n) => /본당|주일학교|전례|사도직/.test(n) && !/첫\s*영성체/.test(n)),
            firstCommunionLead: sumActivityTotals(totals, (n) => /첫\s*영성체.*교리|첫영성체/.test(n)),
            firstCommunionBaptism: sumActivityTotals(totals, (n) => /첫\s*영성체/.test(n), 'baptism')
                || sumActivityTotals(totals, (n) => /첫\s*영성체/.test(n), 'first_communion'),
            legionGrow: sumActivityTotals(totals, (n) => /레지오의\s*발전을\s*위한\s*활동|행동단원\s*모집|협조단원\s*모집|Pr설립|Pr\.\s*설립|레지오활동|소년\s*Pr|유년|평의회|교본공부|활동소홀/.test(n)),
            activeRecruit: sumActivityTotals(totals, (n) => /레지오의\s*발전을\s*위한\s*활동/.test(n), 'membership')
                || sumActivityTotals(totals, (n) => /행동단원\s*모집|행동\s*단원\s*모집/.test(n), 'membership')
                || sumActivityTotals(totals, (n) => /행동단원\s*모집|행동\s*단원\s*모집/.test(n)),
            auxRecruit: sumActivityTotals(totals, (n) => /레지오의\s*발전을\s*위한\s*활동/.test(n), 'group_join')
                || sumActivityTotals(totals, (n) => /협조단원\s*모집/.test(n), 'membership')
                || sumActivityTotals(totals, (n) => /협조단원\s*모집/.test(n)),
            smallCommunity: sumActivityTotals(totals, (n) => /소공동체와\s*함께하는\s*활동|소공동체/.test(n)),
            nature: sumActivityTotals(totals, (n) => /자연보호\s*및\s*생명존중|자연보호|생태|환경|생명존중|낙태|장기기증|헌혈/.test(n)),
            higherCouncil: sumActivityTotals(totals, (n) => /상급평의회가\s*지시한\s*활동|성경|복음묵상|필사|빛잡지|성모님의\s*군단|미사|상급|기도생활/.test(n)),
            bibleRead: sumActivityTotals(totals, (n) => /상급평의회가\s*지시한\s*활동/.test(n), 'year_count')
                || sumActivityTotals(totals, (n) => /성경통독|성경\s*통독|성경읽기/.test(n)),
            gospelMed: sumActivityTotals(totals, (n) => /복음묵상|미사전도서|말씀묵상|미사전\s*독서/.test(n)),
            bibleWrite: sumActivityTotals(totals, (n) => /상급평의회가\s*지시한\s*활동/.test(n), 'catechism_guide')
                || sumActivityTotals(totals, (n) => /성경필사|성경\s*쓰기|성경쓰기|필사/.test(n)),
            magazine: sumActivityTotals(totals, (n) => /빛잡지|성모님의\s*군단|군단지/.test(n)),
            massAround: sumActivityTotals(totals, (n) => /주회.*미사|회합.*미사/.test(n)),
            weekdayMass: sumActivityTotals(totals, (n) => /평일미사/.test(n)),
            higherOther: sumActivityTotals(totals, (n) => /상급평의회|권고|기타\s*상급평의회/.test(n)),
            rosary: sumActivityTotals(totals, (n) => /상급평의회가\s*지시한\s*활동/.test(n), 'establishment')
                || sumActivityTotals(totals, (n) => /묵주기도|묵주\s*기도/.test(n)),
            otherAct: sumActivityTotals(totals, (n) => /기타\s*활동|기타활동|기타사목|특별활동/.test(n) && !/상급평의회/.test(n))
                || sumActivityTotals(totals, (n) => /^기타\s*활동-|^기타활동-/.test(n)),
        };
    }

    function daeguMonthlyActivityTableHtml(a) {
        const resultCell = (label, value, unit) =>
            `${escapeHtml(label)} ${blank(value, 'amt')}${unit ? ` ${escapeHtml(unit)}` : ''}`;
        return `
            <div class="org-table-wrap">
                <table class="form-table daegu-act-table">
                    <thead>
                        <tr>
                            <th style="width:28%;">종목</th>
                            <th style="width:14%;">활동 횟수</th>
                            <th>내용(결과)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="left">이웃에 가톨릭 알리기</td>
                            <td>${blank(a.neighbor, 'amt')}</td>
                            <td class="left">${resultCell('교리반 인도', a.catechismLead, '명')}</td>
                        </tr>
                        <tr>
                            <td class="left">예비신자와 함께하는 활동</td>
                            <td>${blank(a.catechumen, 'amt')}</td>
                            <td class="left">${resultCell('영세자', a.baptized, '명')}</td>
                        </tr>
                        <tr>
                            <td class="left">가정을 위한 활동, 교우 돌봄</td>
                            <td>${blank(a.familyCare, 'amt')}</td>
                            <td class="left">${resultCell('단체 가입', a.groupJoin, '명')}</td>
                        </tr>
                        <tr>
                            <td class="left">성사권유 및 혼인장애자를 위한 활동</td>
                            <td>${blank(a.sacramentInvite, 'amt')}</td>
                            <td class="left">
                                ${resultCell('회두', a.conversion, '명')}
                                &nbsp; ${resultCell('판공', a.confession, '명')}
                                &nbsp; ${resultCell('견진', a.confirmation, '명')}<br>
                                ${resultCell('유아세례', a.infantBaptism, '명')}
                                &nbsp; ${resultCell('혼인장애 해소', a.marriageFix, '명')}
                            </td>
                        </tr>
                        <tr>
                            <td class="left">어려움을 겪는 이웃과 나눔 활동</td>
                            <td>${blank(a.neighborShare, 'amt')}</td>
                            <td class="left">
                                ${resultCell('상가방문 및 돌봄', a.funeralVisit, '회')}
                                &nbsp; ${resultCell('위령기도', a.memorialPrayer, '회')}<br>
                                ${resultCell('장례미사', a.funeralMass, '회')}
                                &nbsp; ${resultCell('장지수행', a.burialEscort, '회')}<br>
                                ${resultCell('병자성사', a.anointing, '명')}
                                &nbsp; ${resultCell('봉성체', a.sickCommunion, '명')}<br>
                                ${resultCell('대세자', a.conditionalBaptism, '명')}
                                &nbsp; ${resultCell('보례자', a.baptismComplete, '명')}<br>
                                ${resultCell('병원 및 복지시설', a.hospital, '회')}
                                &nbsp; ${resultCell('기타', a.shareOther, '회')}
                            </td>
                        </tr>
                        <tr>
                            <td class="left">본당운영에 기여하는 활동</td>
                            <td>${blank(a.parishOps, 'amt')}</td>
                            <td class="left">
                                ${resultCell('첫 영성체 교리반 인도', a.firstCommunionLead, '명')}<br>
                                ${resultCell('첫 영성체반 유아세례 외 영세', a.firstCommunionBaptism, '명')}
                            </td>
                        </tr>
                        <tr>
                            <td class="left">레지오 발전을 위한 활동</td>
                            <td>${blank(a.legionGrow, 'amt')}</td>
                            <td class="left">
                                ${resultCell('행동단원', a.activeRecruit, '명')}
                                &nbsp; ${resultCell('협조단원', a.auxRecruit, '명')}
                            </td>
                        </tr>
                        <tr>
                            <td class="left">소공동체와 함께하는 활동</td>
                            <td>${blank(a.smallCommunity, 'amt')}</td>
                            <td class="left">${blank('', 'w20')}</td>
                        </tr>
                        <tr>
                            <td class="left">자연보호 및 생명존중 운동</td>
                            <td>${blank(a.nature, 'amt')}</td>
                            <td class="left">${blank('', 'w20')}</td>
                        </tr>
                        <tr>
                            <td class="left">상급평의회가 권고한 활동</td>
                            <td>${blank(a.higherCouncil, 'amt')}</td>
                            <td class="left">
                                ${resultCell('성경통독', a.bibleRead, '장')}
                                &nbsp; ${resultCell('미사전도서/복음묵상', a.gospelMed, '회')}<br>
                                ${resultCell('성경필사', a.bibleWrite, '장')}
                                &nbsp; ${resultCell('성모님의 군단/빛잡지 읽기', a.magazine, '회')}<br>
                                ${resultCell('주회 전후 미사', a.massAround, '회')}
                                &nbsp; ${resultCell('평일미사', a.weekdayMass, '회')}<br>
                                ${resultCell('기타', a.higherOther, '회')}<br>
                                ${resultCell('단 묵주기도(Se. 지향)', a.rosary, '단')}
                            </td>
                        </tr>
                        <tr>
                            <td class="left">기타활동</td>
                            <td>${blank(a.otherAct, 'amt')}</td>
                            <td class="left">${blank('', 'w20')}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    /** 대구 세나뚜스 Pr 월례보고서 양식 (공식 이미지 양식) */
    function buildPrMonthlyDaeguFormHtml(data) {
        const officers = data.officers || [];
        const mem = data.membership || {};
        const meeting = data.meeting || {};
        const att = data.attendance || {};
        const totals = data.activity_totals || [];
        const year = data.year || '';
        const month = data.month || '';
        const day = data.report_day || '';

        const officerRows = ['단장', '부단장', '서기', '회계'].map((role) => {
            const found = officers.find((o) => o.role === role) || {};
            return `
                <tr>
                    <td>${escapeHtml(role)}</td>
                    <td>${blank(found.name, 'w6')}</td>
                    <td>${blank(found.baptism_name, 'w6')}</td>
                    <td>${blank(found.attendance_mark, 'w4')}</td>
                    <td>${blank(found.remark, 'w6')}</td>
                </tr>
            `;
        }).join('');

        const a = computeDaeguActivityFields(totals);

        return `
            <div class="curia-monthly-form pr-monthly-daegu" id="prMonthlyFormPrint">
                <div class="form-head">
                    <div class="org-en">LEGIO MARIAE</div>
                    <div class="org-ko">레지오 마리애</div>
                    <div class="form-title">쁘레시디움 월례 보고서</div>
                    <div class="form-asof">
                        ${blank(year, 'w4')}년 ${blank(month, 'w3')}월 ${blank(day, 'w3')}일
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">1. (주)회합 일시 및 장소</div>
                    <div>
                        ${blank(meeting.weekday, 'w4')}요일
                        ${blank(meeting.hour, 'w3')}시
                        ${blank(meeting.minute, 'w3')}분
                        &nbsp; 장소: ${blank(meeting.place, 'w20')}
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">2. 단원현황</div>
                    <div class="org-table-wrap">
                        <table class="form-table">
                            <thead>
                                <tr>
                                    <th rowspan="2">구분</th>
                                    <th colspan="3">행동 단원</th>
                                    <th rowspan="2">쁘레또리움<br>단원</th>
                                    <th colspan="3">협조 단원</th>
                                    <th rowspan="2">아쥬또리움<br>단원</th>
                                </tr>
                                <tr>
                                    <th>남</th><th>여</th><th>계</th>
                                    <th>남</th><th>여</th><th>계</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td>전월</td>${membershipCells(mem.previous)}</tr>
                                <tr><td>금월</td>${membershipCells(mem.current)}</tr>
                                <tr><td>증감</td>${membershipCells(mem.delta || {})}</tr>
                            </tbody>
                        </table>
                    </div>
                    <div style="margin-top:6px; font-size:12px;">
                        단원 구성의 특성: ${blank(formatMemberCompositionTrait(data.pr_type || data.affiliation), 'w12')}
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">3. 출석현황 <span style="font-weight:400;font-size:11px;">(출석: /, 결석: ○)</span></div>
                    <div class="org-table-wrap">
                        <table class="form-table">
                            <thead>
                                <tr>
                                    <th>직책</th><th>성명</th><th>세례명</th><th>출결</th><th>비고</th>
                                </tr>
                            </thead>
                            <tbody>${officerRows}</tbody>
                        </table>
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">4. 교육 및 피정</div>
                    ${lineBoxHtml(formatEventLineList(data.edu_text), '42px')}
                </div>

                <div class="sec">
                    <div class="sec-title">5. 레지오 행사 및 기타행사</div>
                    ${lineBoxHtml(formatEventLineList(data.legion_event_text), '42px')}
                </div>

                <div class="sec">
                    <div class="sec-title">6. 출석상황</div>
                    <div>
                        월간 전체 출석의무 일수: ${blank(att.duty_days, 'amt')}일,
                        월간 출석 일수: ${blank(att.attended_days, 'amt')}일,
                        월간 출석률: ${blank(att.rate, 'amt')}%
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">7. 월례보고 (주요내용)</div>
                    ${daeguMonthlyActivityTableHtml(a)}
                </div>

                <div class="sec" style="display:flex; justify-content:space-between; gap:12px; margin-top:16px; flex-wrap:wrap;">
                    <div>
                        ${blank(data.council_name, 'w20')} 평의회 (Co. Cu.) 직속
                    </div>
                    <div style="text-align:right;">
                        Pr. 단장 ${blank(data.president_name, 'w10')} (인)
                        <div style="margin-top:6px;">
                            ${blank(data.church_name, 'w10')} · ${blank(data.pr_name, 'w10')}
                        </div>
                    </div>
                </div>
                <p class="note">※ 대구 세나뚜스 양식 · DB 자동 기입(단원현황·간부·행사·활동합계). DB 값은 파란색, 빈칸은 빨간색으로 깜박입니다. PDF 전 수정 가능(저장 없음).</p>
            </div>
        `;
    }

    /** 대구 세나뚜스 평의회(꾸리아 등) 월례보고서 양식 */
    function buildCouncilMonthlyDaeguFormHtml(data) {
        const label = data.label || '꾸리아';
        const officers = data.officers || [];
        const meeting = data.meeting || {};
        const att = data.attendance || {};
        const fin = data.finance || { income: {}, expense: {} };
        const byAge = data.membership_by_age || {};
        const org = data.organization || {};
        const orgCur = org.current || {};
        const a = computeDaeguActivityFields(data.activity_totals || []);
        const year = data.year || '';
        const month = data.month || '';
        const day = data.report_day || meeting.day || '';

        const officerRows = ['단장', '부단장', '서기', '회계'].map((role) => {
            const found = officers.find((o) => o.role === role) || {};
            return `
                <tr>
                    <td>${escapeHtml(role)}</td>
                    <td>${blank(found.name, 'w6')}</td>
                    <td>${blank(found.baptism_name, 'w6')}</td>
                    <td>${blank(found.attendance_mark, 'w4')}</td>
                    <td>${blank(found.remark, 'w6')}</td>
                </tr>
            `;
        }).join('');

        function ageRowHtml(labelText, row) {
            const r = row || {};
            return `<tr>
                <td>${escapeHtml(labelText)}</td>
                <td>${blank('', 'amt')}</td>
                <td>${blank('', 'amt')}</td>
                <td>${blank('', 'amt')}</td>
                <td>${blank('', 'amt')}</td>
                <td>${blank('', 'amt')}</td>
                <td>${blank(r.pr, 'amt')}</td>
                <td>${blank('', 'amt')}</td>
                <td>${blank(r.active_m, 'amt')}</td>
                <td>${blank(r.active_f, 'amt')}</td>
                <td>${blank(r.active_t, 'amt')}</td>
                <td>${blank('', 'amt')}</td>
                <td>${blank(r.praetorian, 'amt')}</td>
                <td>${blank(r.aux_m, 'amt')}</td>
                <td>${blank(r.aux_f, 'amt')}</td>
                <td>${blank(r.aux_t, 'amt')}</td>
                <td>${blank(r.adjutorian, 'amt')}</td>
            </tr>`;
        }

        const totalRow = byAge.total || {
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

        const coCurr = orgCur.co_count;
        const cuCurr = (Number(orgCur.cu_adult) || 0) + (Number(orgCur.cu_junior) || 0);
        const cuCurrDisplay = (orgCur.cu_adult == null && orgCur.cu_junior == null) ? '' : (cuCurr || '');

        return `
            <div class="curia-monthly-form council-monthly-daegu" id="curiaMonthlyFormPrint">
                <div class="form-head">
                    <div class="org-en">LEGIO MARIAE</div>
                    <div class="org-ko">레지오 마리애</div>
                    <div class="form-title">평의회 월례 보고서</div>
                    <div class="form-asof">
                        ${blank(year, 'w4')}년 ${blank(month, 'w3')}월 ${blank(day, 'w3')}일
                    </div>
                </div>
                <div style="text-align:center; margin-bottom:10px;">
                    천주교 ${blank(data.church_name, 'w10')} 성당
                    &nbsp; 평의회(Re. Co. Cu.) ${blank(data.council_name, 'w12')}
                </div>

                <div class="sec">
                    <div class="sec-title">1. 회합 일시 및 장소</div>
                    <div>
                        ${blank(meeting.year || year, 'w4')}년
                        ${blank(meeting.month || month, 'w3')}월
                        ${blank(meeting.day, 'w3')}일
                        (${blank(meeting.weekday, 'w3')})요일
                        ${blank(meeting.hour, 'w3')}시
                        ${blank(meeting.minute, 'w3')}분
                        &nbsp; 장소: ${blank(meeting.place, 'w16')}
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">2. 출석률</div>
                    <div>
                        전체 ${blank(att.rate_total, 'amt')} %
                        &nbsp; 간부 ${blank(att.rate_officers, 'amt')} %
                        &nbsp; 의원 ${blank(att.rate_members, 'amt')} %
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">3. 단원현황</div>
                    <div class="org-table-wrap">
                        <table class="form-table daegu-council-mem">
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
                                    <th>전월</th><th>현재</th>
                                    <th>전월</th><th>현재</th>
                                    <th>전월</th><th>현재</th><th>증감</th>
                                    <th>남</th><th>여</th><th>계</th><th>증감</th>
                                    <th>남</th><th>여</th><th>계</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${ageRowHtml('성인', byAge.adult)}
                                ${ageRowHtml('청년', byAge.youth)}
                                ${ageRowHtml('소년', byAge.junior)}
                                <tr>
                                    <td>합계</td>
                                    <td>${blank('', 'amt')}</td>
                                    <td>${blank(coCurr, 'amt')}</td>
                                    <td>${blank('', 'amt')}</td>
                                    <td>${blank(cuCurrDisplay, 'amt')}</td>
                                    <td>${blank('', 'amt')}</td>
                                    <td>${blank(totalRow.pr, 'amt')}</td>
                                    <td>${blank('', 'amt')}</td>
                                    <td>${blank(totalRow.active_m, 'amt')}</td>
                                    <td>${blank(totalRow.active_f, 'amt')}</td>
                                    <td>${blank(totalRow.active_t, 'amt')}</td>
                                    <td>${blank('', 'amt')}</td>
                                    <td>${blank(totalRow.praetorian, 'amt')}</td>
                                    <td>${blank(totalRow.aux_m, 'amt')}</td>
                                    <td>${blank(totalRow.aux_f, 'amt')}</td>
                                    <td>${blank(totalRow.aux_t, 'amt')}</td>
                                    <td>${blank(totalRow.adjutorian, 'amt')}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">4. 출석현황 <span style="font-weight:400;font-size:11px;">(출석: /, 결석: ○)</span></div>
                    <div class="org-table-wrap">
                        <table class="form-table">
                            <thead>
                                <tr>
                                    <th>직책</th><th>성명</th><th>세례명</th><th>출결</th><th>비고</th>
                                </tr>
                            </thead>
                            <tbody>${officerRows}</tbody>
                        </table>
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">5. 교육 및 피정</div>
                    ${lineBoxHtml(formatEventLineList(data.edu_text), '48px')}
                </div>

                <div class="sec">
                    <div class="sec-title">6. 레지오 행사 및 기타 행사</div>
                    ${lineBoxHtml(formatEventLineList(data.legion_event_text), '48px')}
                </div>

                <div class="sec">
                    <div class="sec-title">7. 월례보고 (주요내용)</div>
                    ${daeguMonthlyActivityTableHtml(a)}
                </div>

                <div class="sec">
                    <div class="sec-title">8. 신설 또는 해체된 Pr. 명칭과 평의회 명칭</div>
                    ${lineBoxHtml(data.new_or_dissolved, '36px')}
                </div>

                <div class="sec">
                    <div class="sec-title">9. 회계보고</div>
                    <div>
                        총수입 ${blank(fin.income?.total, 'amt')} 원
                        &nbsp; 지출 ${blank(fin.expense?.total, 'amt')} 원
                        &nbsp; 잔액 ${blank(fin.balance, 'amt')} 원
                    </div>
                </div>

                <div class="sec" style="text-align:right; margin-top:16px;">
                    ${blank(data.council_name, 'w12')} Re. Co. Cu. 단장
                    ${blank(data.president_name, 'w8')} (인)
                    <div style="margin-top:6px; font-size:11px;">
                        ${escapeHtml(label)} · ${blank(data.church_name, 'w10')}
                    </div>
                </div>
                <p class="note">※ 산하 회원 DB로 단원현황·간부·행사·활동합계 자동 기입. DB 값은 파란색, 빈칸은 빨간색으로 깜박입니다. PDF 전 수정 가능(저장 없음).</p>
            </div>
        `;
    }

    /** 광주 세나뚜스 평의회(꾸리아 등) 월례보고서 양식 */
    function buildCouncilMonthlyGwangjuFormHtml(data) {
        const label = data.label || '꾸리아';
        const type = data.type || 'curia';
        const officers = data.officers || [];
        const meeting = data.meeting || {};
        const att = data.attendance || {};
        const fin = data.finance || { income: {}, expense: {} };
        const org = data.organization || {};
        const prev = org.previous || {};
        const curr = org.current || {};
        const totals = data.activity_totals || [];
        const year = data.year || '';
        const month = data.month || '';
        const day = data.report_day || meeting.day || '';
        const yy = String(year).length === 4 ? String(year).slice(2) : String(year);

        const typeMark = (key) => (type === key ? '✓' : '');

        function orgVal(row, key) {
            const v = row && row[key];
            if (v === null || v === undefined || v === '') return '';
            return v;
        }

        function deltaVal(key) {
            const c = Number(curr[key]);
            const p = Number(prev[key]);
            if (!Number.isFinite(c) || !Number.isFinite(p)) return '';
            const d = c - p;
            return d === 0 ? '0' : d;
        }

        function statusCells(row, isDelta) {
            const v = (key) => blank(isDelta ? deltaVal(key) : orgVal(row, key), 'amt');
            return `
                <td>${v('co_adult')}</td><td>${v('co_junior')}</td>
                <td>${v('cu_adult')}</td><td>${v('cu_direct')}</td><td>${v('cu_junior')}</td>
                <td>${v('pr_adult')}</td><td>${v('pr_direct')}</td><td>${v('pr_junior')}</td>
                <td>${v('active_adult_m')}</td><td>${v('active_adult_f')}</td><td>${v('active_adult_t')}</td>
                <td>${v('active_junior_m')}</td><td>${v('active_junior_f')}</td><td>${v('active_junior_t')}</td>
                <td>${v('praetorian')}</td>
                <td>${v('aux_m')}</td><td>${v('aux_f')}</td><td>${v('aux_t')}</td>
                <td>${v('adjutorian')}</td>
            `;
        }

        const officerRoleRows = [
            { key: '__spiritual__', label: '영적 지도신부' },
            { key: '단장', label: '단장' },
            { key: '부단장', label: '부단장' },
            { key: '서기', label: '서기' },
            { key: '회계', label: '회계' }
        ].map((def) => {
            if (def.key === '__spiritual__') {
                return `<tr>
                    <td>${escapeHtml(def.label)}</td>
                    <td>${blank(data.spiritual_director, 'w6')}</td>
                    <td>${blank('', 'w6')}</td>
                    <td>${blank('', 'w6')}</td>
                    <td>${blank('', 'w6')}</td>
                    <td>${blank('', 'w10')}</td>
                    <td>${blank('', 'w8')}</td>
                </tr>`;
            }
            const found = officers.find((o) => o.role === def.key) || {};
            return `<tr>
                <td>${escapeHtml(def.label)}</td>
                <td>${blank(found.name, 'w6')}</td>
                <td>${blank(found.baptism_name, 'w6')}</td>
                <td>${blank(found.birth, 'w6')}</td>
                <td>${blank(found.elected_on, 'w6')}</td>
                <td>${blank(found.address, 'w10')}</td>
                <td>${blank(found.phone, 'w8')}</td>
            </tr>`;
        }).join('');

        const rosary = sumActivityTotals(totals, (n) => /묵주기도/.test(n));
        const evangelism = sumActivityTotals(totals, (n) => /입교권면|외인\s*입교|가두선교|복음선교/.test(n));
        const conversion = sumActivityTotals(totals, (n) => /회두권면|회두|개종권면|개종/.test(n));
        const recruit = sumActivityTotals(totals, (n) => /입단권면|행동단원\s*모집|협조단원\s*모집|회원모집/.test(n));

        const eventText = formatEventLineList(data.legion_event_text);
        const eduText = formatEventLineList(data.edu_text);
        const specialText = String(data.major_activities || data.memo || '').trim();
        const inquiryText = String(data.inquiries || '').trim();

        const prAttend = (Number(curr.pr_adult) || 0) + (Number(curr.pr_direct) || 0) + (Number(curr.pr_junior) || 0);
        const cuAttend = (Number(curr.cu_adult) || 0) + (Number(curr.cu_direct) || 0) + (Number(curr.cu_junior) || 0);
        const coAttend = (Number(curr.co_adult) || 0) + (Number(curr.co_junior) || 0) || curr.co_count;

        return `
            <div class="curia-monthly-form council-monthly-gwangju" id="curiaMonthlyFormPrint">
                <div class="form-head">
                    <div class="org-en">LEGIO MARIAE</div>
                    <div class="org-ko">레지오 마리애</div>
                    <div class="form-title">평의회 월례 보고서</div>
                    <div class="form-asof">
                        20${blank(yy, 'w3')}년 ${blank(month, 'w3')}월 ${blank(day, 'w3')}일 현재
                    </div>
                </div>

                <div style="margin-bottom:8px;">
                    ${blank(data.church_name, 'w10')}
                    &nbsp; (${typeMark('curia')} 꾸리아 / ${typeMark('comitia')} 꼬미씨움 / ${typeMark('regia')} 레지아)
                    ${blank(data.council_name, 'w12')}
                </div>
                <div style="margin-bottom:10px;">
                    ${blank('', 'w12')} 세나뚜스 / 레지아 / 꼬미씨움 단장 귀하
                </div>

                <div class="sec">
                    <div class="sec-title">1. 회합 일시 및 장소</div>
                    <div>
                        매월 ${blank(meeting.weekday, 'w4')}요일
                        ${blank(meeting.hour, 'w3')}시
                        ${blank(meeting.minute, 'w3')}분
                        &nbsp; ${blank(meeting.place, 'w12')} 회의실
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">2. 출석률</div>
                    <div>
                        전체 ${blank(att.rate_total, 'amt')} %
                        ( 간부 ${blank(att.rate_officers, 'amt')} %
                        &nbsp; 의원 ${blank(att.rate_members, 'amt')} % )
                        &nbsp; Pr. ${blank(prAttend || '', 'amt')}
                        &nbsp; Cu. ${blank(cuAttend || '', 'amt')}
                        &nbsp; Co. ${blank(coAttend || '', 'amt')}
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">3. 현황</div>
                    <div class="org-table-wrap">
                        <table class="form-table gj-council-status">
                            <thead>
                                <tr>
                                    <th rowspan="3">구분</th>
                                    <th colspan="2">Co. 수</th>
                                    <th colspan="3">Cu. 수</th>
                                    <th colspan="3">Pr. 수</th>
                                    <th colspan="6">행동단원</th>
                                    <th rowspan="3">쁘레또리움<br>단원</th>
                                    <th colspan="3">협조단원</th>
                                    <th rowspan="3">아쥬또리움<br>단원</th>
                                </tr>
                                <tr>
                                    <th rowspan="2">성인</th><th rowspan="2">소년</th>
                                    <th rowspan="2">성인</th><th rowspan="2">직속</th><th rowspan="2">소년</th>
                                    <th rowspan="2">성인</th><th rowspan="2">직속</th><th rowspan="2">소년</th>
                                    <th colspan="3">성인</th>
                                    <th colspan="3">소년</th>
                                    <th rowspan="2">남</th><th rowspan="2">여</th><th rowspan="2">계</th>
                                </tr>
                                <tr>
                                    <th>남</th><th>여</th><th>계</th>
                                    <th>남</th><th>여</th><th>계</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td>전월</td>${statusCells(prev, false)}</tr>
                                <tr><td>현재</td>${statusCells(curr, false)}</tr>
                                <tr><td>증감</td>${statusCells(curr, true)}</tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">4. 신설 또는 해체된 Pr. 및 평의회 명칭</div>
                    ${lineBoxHtml(data.new_or_dissolved, '36px')}
                </div>

                <div class="sec">
                    <div class="sec-title">5. 간부 이동</div>
                    ${lineBoxHtml('', '36px')}
                </div>

                <div class="sec">
                    <div class="sec-title">6. 간부 명단</div>
                    <div class="org-table-wrap">
                        <table class="form-table">
                            <thead>
                                <tr>
                                    <th>직책</th><th>성명</th><th>세례명</th><th>생년월일</th>
                                    <th>인준일</th><th>주소</th><th>전화</th>
                                </tr>
                            </thead>
                            <tbody>${officerRoleRows}</tbody>
                        </table>
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">7. 주요 사항</div>
                    <div style="margin:4px 0;"><strong>가. 행사</strong></div>
                    ${lineBoxHtml(eventText, '40px')}
                    <div style="margin:8px 0 4px;"><strong>나. 계획</strong></div>
                    ${lineBoxHtml('', '36px')}
                    <div style="margin:8px 0 4px;"><strong>다. 방문</strong></div>
                    ${lineBoxHtml('', '36px')}
                    <div style="margin:8px 0 4px;"><strong>라. 회계</strong></div>
                    <div>
                        이월금 ${blank(fin.income?.brought_forward, 'amt')} 원
                        &nbsp; 수입 ${blank(fin.income?.total || fin.income?.contribution, 'amt')} 원
                        &nbsp; 지출 ${blank(fin.expense?.total, 'amt')} 원
                        &nbsp; 잔액 ${blank(fin.balance, 'amt')} 원
                    </div>
                    <div style="margin:8px 0 4px;"><strong>마. 교육 및 피정</strong></div>
                    ${lineBoxHtml(eduText, '40px')}
                    <div style="margin:8px 0 4px;"><strong>바. 특기 사항</strong></div>
                    ${lineBoxHtml(specialText, '48px')}
                </div>

                <div class="sec">
                    <div class="sec-title">8. 주회 시간 및 장소 변경</div>
                    ${lineBoxHtml('', '36px')}
                </div>

                <div class="sec">
                    <div class="sec-title">9. 기타(질의 및 건의)</div>
                    ${lineBoxHtml(inquiryText, '48px')}
                </div>

                <div class="sec">
                    <div class="sec-title">10. 활동 사항</div>
                    <div style="line-height:1.9;">
                        가. 묵주기도 ${blank(rosary, 'amt')} 단<br>
                        나. 입교권면 ${blank(evangelism, 'amt')} 회<br>
                        다. 회두권면 ${blank(conversion, 'amt')} 회<br>
                        라. 입단권면 ${blank(recruit, 'amt')} 회
                    </div>
                </div>

                <div class="sec" style="text-align:right; margin-top:16px;">
                    단장 ${blank(data.president_name, 'w10')} 서명
                    <div style="margin-top:6px; font-size:11px;">
                        ${escapeHtml(label)} · ${blank(data.church_name, 'w10')} · ${blank(data.council_name, 'w10')}
                    </div>
                </div>
                <p class="note">※ 산하 회원 DB로 현황·간부·행사·활동횟수 자동 기입. DB 값은 파란색, 빈칸은 빨간색으로 깜박입니다. PDF 전 수정 가능(저장 없음).</p>
            </div>
        `;
    }

    /** 광주 세나뚜스 Pr 월례보고서 양식 (공식 이미지 양식) */
    function buildPrMonthlyGwangjuFormHtml(data) {
        const officers = data.officers || [];
        const mem = data.membership || {};
        const meeting = data.meeting || {};
        const att = data.attendance || {};
        const fin = data.finance || {};
        const totals = data.activity_totals || [];
        const year = data.year || '';
        const month = data.month || '';
        const day = data.report_day || '';
        const yy = String(year).length === 4 ? String(year).slice(2) : String(year);

        const officerRows = ['단장', '부단장', '서기', '회계'].map((role) => {
            const found = officers.find((o) => o.role === role) || {};
            return `
                <tr>
                    <td>${escapeHtml(role)}</td>
                    <td>${blank(found.name, 'w6')}</td>
                    <td>${blank(found.baptism_name, 'w6')}</td>
                    <td>${blank(found.appointed_on, 'w6')}</td>
                    <td>${blank(found.address, 'w10')}</td>
                    <td>${blank(found.phone, 'w8')}</td>
                </tr>
            `;
        }).join('');

        const rosary = sumActivityTotals(totals, (n) => /묵주기도/.test(n));
        const evangelism = sumActivityTotals(totals, (n) => /입교권면|외인\s*입교|가두선교|복음선교/.test(n));
        const conversion = sumActivityTotals(totals, (n) => /회두권면|회두|개종권면|개종/.test(n));
        const recruit = sumActivityTotals(totals, (n) => /입단권면|행동단원\s*모집|협조단원\s*모집|회원모집/.test(n));

        const eventText = formatEventLineList(data.legion_event_text);
        const eduText = formatEventLineList(data.edu_text);
        const specialText = String(data.major_activities || data.memo || '').trim();
        const inquiryText = String(data.inquiries || '').trim();

        function pct(present, total) {
            const p = Number(present);
            const t = Number(total);
            if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return '';
            return Math.round((p / t) * 100);
        }

        return `
            <div class="curia-monthly-form pr-monthly-gwangju" id="prMonthlyFormPrint">
                <div class="form-head">
                    <div class="org-en">LEGIO MARIAE</div>
                    <div class="org-ko">레지오 마리애</div>
                    <div class="form-title">쁘레시디움 월례 보고서</div>
                </div>

                <div class="form-curia-name" style="text-align:left;">
                    직속 평의회 명칭 :
                    ${blank(data.council_name, 'w12')} 꾸리아 / 꼬미씨움
                </div>
                <div style="margin:6px 0 10px;">
                    ${blank(data.pr_name, 'w12')} 쁘레시디움
                    &nbsp; 제 ${blank(data.meeting_from, 'w4')} 차 ~ 제 ${blank(data.meeting_to, 'w4')} 차
                    &nbsp; ${blank(month, 'w3')} 월분
                </div>

                <div class="sec">
                    <div class="sec-title">1. 주회 일시 및 장소</div>
                    <div>
                        매주 ${blank(meeting.weekday, 'w4')}요일
                        ${blank(meeting.hour, 'w3')}시
                        ${blank(meeting.minute, 'w3')}분
                        &nbsp; ${blank(meeting.place, 'w12')} 회의실
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">
                        2. 간부 명단
                        (영적 지도신부 : ${blank(data.spiritual_director, 'w8')})
                        &nbsp; 20${blank(yy, 'w3')}년 ${blank(month, 'w3')}월 ${blank(day, 'w3')}일 현재
                    </div>
                    <div class="org-table-wrap">
                        <table class="form-table">
                            <thead>
                                <tr>
                                    <th>직책</th><th>성명</th><th>세례명</th><th>임명일</th><th>주소</th><th>전화</th>
                                </tr>
                            </thead>
                            <tbody>${officerRows}</tbody>
                        </table>
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">3. 단원 현황</div>
                    <div class="org-table-wrap">
                        <table class="form-table">
                            <thead>
                                <tr>
                                    <th rowspan="2">구분</th>
                                    <th colspan="3">행동단원</th>
                                    <th rowspan="2">쁘레또리움<br>단원</th>
                                    <th colspan="3">협조단원</th>
                                    <th rowspan="2">아쥬또리움<br>단원</th>
                                </tr>
                                <tr>
                                    <th>남</th><th>여</th><th>계</th>
                                    <th>남</th><th>여</th><th>계</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td>전월</td>${membershipCells(mem.previous)}</tr>
                                <tr><td>현재</td>${membershipCells(mem.current)}</tr>
                                <tr><td>증감</td>${membershipCells(mem.delta || {})}</tr>
                            </tbody>
                        </table>
                    </div>
                    <div style="margin-top:6px; font-size:12px;">
                        단원 구성의 특성: ${blank(formatMemberCompositionTrait(data.pr_type || data.affiliation), 'w12')}
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">4. 출석률</div>
                    <div>
                        간부 ${blank(att.officers_present, 'amt')} / ${blank(att.officers_total, 'amt')}
                        ( ${blank(pct(att.officers_present, att.officers_total), 'amt')} % )
                        &nbsp;&nbsp;
                        단원 ${blank(att.members_present, 'amt')} / ${blank(att.members_total, 'amt')}
                        ( ${blank(pct(att.members_present, att.members_total), 'amt')} % )
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">5. 주요 사항</div>
                    <div style="margin:4px 0;"><strong>가. 행사</strong></div>
                    ${lineBoxHtml(eventText, '40px')}
                    <div style="margin:8px 0 4px;"><strong>나. 계획</strong></div>
                    ${lineBoxHtml('', '36px')}
                    <div style="margin:8px 0 4px;"><strong>다. 순방</strong></div>
                    ${lineBoxHtml('', '36px')}
                    <div style="margin:8px 0 4px;"><strong>라. 회계</strong></div>
                    <div>
                        이월금 ${blank(fin.brought_forward, 'amt')} 원
                        &nbsp; 수입 ${blank(fin.income, 'amt')} 원
                        &nbsp; 지출 ${blank(fin.expense, 'amt')} 원
                        &nbsp; 잔액 ${blank(fin.balance, 'amt')} 원
                    </div>
                    <div style="margin:8px 0 4px;"><strong>마. 교육 및 피정</strong></div>
                    ${lineBoxHtml(eduText, '40px')}
                    <div style="margin:8px 0 4px;"><strong>바. 특기 사항</strong></div>
                    ${lineBoxHtml(specialText, '48px')}
                </div>

                <div class="sec">
                    <div class="sec-title">6. 주회 시간 및 장소 변경</div>
                    ${lineBoxHtml('', '36px')}
                </div>

                <div class="sec">
                    <div class="sec-title">7. 기타(질의 및 건의)</div>
                    ${lineBoxHtml(inquiryText, '48px')}
                </div>

                <div class="sec">
                    <div class="sec-title">8. 활동 사항</div>
                    <div style="line-height:1.9;">
                        가. 묵주기도 ${blank(rosary, 'amt')} 단<br>
                        나. 입교권면 ${blank(evangelism, 'amt')} 회<br>
                        다. 회두권면 ${blank(conversion, 'amt')} 회<br>
                        라. 입단권면 ${blank(recruit, 'amt')} 회
                    </div>
                </div>

                <div class="sec" style="text-align:right; margin-top:16px;">
                    단장 ${blank(data.president_name, 'w10')} 서명
                    <div style="margin-top:6px;">
                        ${blank(data.church_name, 'w10')} · ${blank(data.pr_name, 'w10')}
                    </div>
                </div>
                <p class="note">※ DB 자동 기입(직속평의회·Pr·주회합·간부·단원현황·행사·교육·활동횟수). DB 값은 파란색, 빈칸은 빨간색으로 깜박입니다. PDF 전 수정 가능(저장 없음).</p>
            </div>
        `;
    }

    function buildPrMonthlyFormHtml(data) {
        const events = data.events || [];
        const eventRows = (events.length ? events : [{ kind: '', title: '', organizer: '', datetime: '', place: '', attendance: '' }])
            .concat(Array(Math.max(0, 3 - Math.max(events.length, 1))).fill({
                kind: '', title: '', organizer: '', datetime: '', place: '', attendance: ''
            }))
            .slice(0, Math.max(3, events.length));
        const officers = data.officers || [];
        const mem = data.membership || {};
        const meeting = data.meeting || {};
        const att = data.attendance || {};
        const fin = data.finance || {};
        const expenseDetail = fin.expense_detail || {};
        const majorText = String(data.major_activities || '').trim();
        const inquiryText = String(data.inquiries || '').trim();

        return `
            <div class="curia-monthly-form" id="prMonthlyFormPrint">
                <div class="form-head">
                    <div class="org-en">LEGIO MARIAE</div>
                    <div class="org-ko">레지오 마리애</div>
                    <div class="form-title">쁘레시디움 월례 보고서</div>
                    <div class="form-asof">
                        ${blank(data.year, 'w6')}년
                        ${blank(data.month, 'w4')}월말 현재
                        &nbsp;&nbsp;제 ${blank(data.meeting_from, 'w4')}차
                        ~ 제 ${blank(data.meeting_to, 'w4')}차
                    </div>
                </div>
                <div class="form-curia-name">
                    성당: ${blank(data.church_name, 'w10')}
                    &nbsp;&nbsp;Pr: ${blank(data.pr_name, 'w20')}
                </div>

                <div class="sec">
                    <div class="sec-title">1. 주회합 일시 :</div>
                    <div>
                        매주 ${blank(meeting.weekday, 'w4')}요일
                        ${blank(meeting.hour, 'w4')}시
                        ${blank(meeting.minute, 'w4')}분
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">2. 장소 :</div>
                    <div>${blank(meeting.place, 'w20')}</div>
                </div>

                <div class="sec">
                    <div class="sec-title">3. 출석 상황 :</div>
                    <div>
                        간부 ${blank(att.officers_present, 'w4')} /
                        ${blank(att.officers_total, 'w4')}
                        &nbsp;&nbsp;단원 ${blank(att.members_present, 'w4')} /
                        ${blank(att.members_total, 'w4')}
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">
                        4. 간부 명단 (영적지도자: ${blank(data.spiritual_director, 'w10')})
                    </div>
                    <div class="org-table-wrap">
                        <table class="form-table">
                            <thead>
                                <tr>
                                    <th>직책</th><th>성명</th><th>세례명</th><th>임명일</th><th>참고 사항</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${officers.map((o) => `
                                    <tr>
                                        <td>${blank(o.role, 'w6')}</td>
                                        <td>${blank(o.name, 'w6')}</td>
                                        <td>${blank(o.baptism_name, 'w6')}</td>
                                        <td>${blank(o.appointed_on, 'w6')}</td>
                                        <td>${blank(o.remark, 'w6')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">5. 단원 현황</div>
                    <div class="org-table-wrap">
                        <table class="form-table">
                            <thead>
                                <tr>
                                    <th rowspan="2">구분</th>
                                    <th colspan="3">행동 단원</th>
                                    <th rowspan="2">쁘레또리움<br>단원</th>
                                    <th colspan="3">협조 단원</th>
                                    <th rowspan="2">아듀또리움<br>단원</th>
                                </tr>
                                <tr>
                                    <th>남</th><th>여</th><th>계</th>
                                    <th>남</th><th>여</th><th>계</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td>전월</td>${membershipCells(mem.previous)}</tr>
                                <tr><td>금월</td>${membershipCells(mem.current)}</tr>
                                <tr><td>증(증가)</td>${membershipCells(mem.increase)}</tr>
                                <tr><td>감(감소)</td>${membershipCells(mem.decrease)}</tr>
                            </tbody>
                        </table>
                    </div>
                    <div style="margin-top:6px; font-size:12px;">
                        단원 구성의 특성: ${blank(formatMemberCompositionTrait(data.pr_type || data.affiliation), 'w12')}
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">6. 주요사항 (행사/교육/피정) &lt;구분 : 실시 또는 계획&gt;</div>
                    <div class="org-table-wrap">
                        <table class="form-table">
                            <thead>
                                <tr>
                                    <th>구분</th><th>제목</th><th>주관</th><th>일시</th><th>장소</th><th>참석</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${eventRows.map((e) => `
                                    <tr>
                                        <td>${blank(e.kind, 'w4')}</td>
                                        <td class="left">${blank(e.title, 'w10')}</td>
                                        <td>${blank(e.organizer, 'w6')}</td>
                                        <td>${blank(e.datetime, 'w6')}</td>
                                        <td>${blank(e.place, 'w6')}</td>
                                        <td>${blank(e.attendance, 'w4')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">7. 회계 보고</div>
                    <div>
                        이월금 ${blank(fin.brought_forward, 'amt')}
                        &nbsp; 수입 ${blank(fin.income, 'amt')}
                        &nbsp; 지출 ${blank(fin.expense, 'amt')}
                        &nbsp; 잔액 ${blank(fin.balance, 'amt')}
                    </div>
                    <div style="margin-top:6px;">
                        중요 지출 내역
                        (의연금 ${blank(expenseDetail.contribution, 'amt')}
                        &nbsp; 꽃값 ${blank(expenseDetail.flowers, 'amt')}
                        &nbsp; 기타 ${blank(expenseDetail.others, 'amt')})
                    </div>
                </div>

                <div class="sec">
                    <div class="sec-title">8. 주요 활동 내역</div>
                    ${lineBoxHtml(majorText, '90px')}
                </div>

                <div class="sec">
                    <div class="sec-title">9. 기타(질의 및 건의)</div>
                    ${lineBoxHtml(inquiryText, '48px')}
                </div>

                <div class="sec" style="display:flex; justify-content:space-between; gap:12px; margin-top:16px; flex-wrap:wrap;">
                    <div>
                        ${blank(data.council_name, 'w20')} 평의회
                    </div>
                    <div style="text-align:right;">
                        쁘레시디움 단장 ${blank(data.president_name, 'w10')} (서명)
                        <div style="margin-top:6px;">${blank(data.affiliation, 'w10')}</div>
                    </div>
                </div>
                <p class="note">※ DB 자동 기입: Pr명, 간부(G1~G4), 단원현황, 행사, 주요활동·질의·건의. DB 값은 파란색, 빈칸은 빨간색으로 깜박입니다. 출력물 내용은 PDF 전에 모두 수정할 수 있으며(저장 없음), PDF에는 수정한 내용이 포함됩니다.</p>
            </div>
        `;
    }

    async function fetchPrMonthlyReport(churchName, prName, year, month) {
        const params = new URLSearchParams({
            church_name: churchName,
            pr_name: prName,
            year,
            month
        });
        const response = await fetch(`/api/pr-monthly-report?${params.toString()}`);
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Pr 월례보고 조회에 실패했습니다.');
        }
        return data;
    }

    function showPrMonthlyReportView(modal, dioceseName) {
        ensureStyles();
        const user = getLoggedInUser();
        const useDiocese = isGwangjuSenatusUser(user);
        const diocese = useDiocese ? (normalizePrDiocese(dioceseName) || getSelectedPrDiocese()) : '';
        if (useDiocese && !diocese) {
            showPrDioceseChooser(modal);
            return;
        }
        if (useDiocese) setSelectedPrDiocese(diocese);
        const userDiocese = normalizePrDiocese(user?.diocese_name);
        const sameDiocese = !useDiocese || !userDiocese || userDiocese === diocese;
        const initialChurch = sameDiocese ? String(user?.church_name || '').trim() : '';
        const initialPr = sameDiocese ? String(user?.pr_name || '').trim() : '';
        const now = new Date();
        const defaultYear = now.getFullYear();
        const defaultMonth = now.getMonth() + 1;
        const dioceseLabel = useDiocese ? `${escapeHtml(diocese)} · ` : '';

        const content = modal.querySelector('.modal-content');
        content.classList.add('wide');
        content.innerHTML = `
            <span class="close">&times;</span>
            <h2>Pr 월례보고</h2>
            <p class="hub-sub">${dioceseLabel}쁘레시디움 월례 보고서 양식에 DB 보유 항목만 자동 기입합니다. (대구·광주 전용 양식, 그 외 세나뚜스는 서울 양식 · 집계는 소속 세나뚜스 기준)</p>
            <div class="org-toolbar">
                ${useDiocese ? `<select id="prMonthlyPrSelect" aria-label="교구 Pr 선택">
                    <option value="">${escapeHtml(diocese)} Pr 선택</option>
                </select>` : ''}
                <input type="text" id="prMonthlyChurchInput" placeholder="성당 명칭" value="${escapeHtml(initialChurch)}">
                <input type="text" id="prMonthlyNameInput" placeholder="Pr 명칭" value="${escapeHtml(initialPr)}">
                <select id="prMonthlyYear"></select>
                <select id="prMonthlyMonth"></select>
                <button type="button" id="prMonthlySearchBtn">조회</button>
                <button type="button" class="pdf-btn" id="prMonthlyPdfBtn" disabled>PDF</button>
                <button type="button" class="excel-btn" id="prMonthlyExcelBtn" disabled>Excel</button>
                <button type="button" class="hwp-btn" id="prMonthlyHwpBtn" disabled>한글</button>
            </div>
            <p class="org-meta" id="prMonthlyMeta">조회 버튼을 눌러주세요.</p>
            <div id="prMonthlyResult"><div class="empty">성당·Pr 명칭을 입력하고 조회하세요.</div></div>
            <div class="back-row">
                <button type="button" id="prMonthlyBackBtn">← 보고 종류 선택</button>
            </div>
        `;

        const churchInput = content.querySelector('#prMonthlyChurchInput');
        const nameInput = content.querySelector('#prMonthlyNameInput');
        const prSelect = content.querySelector('#prMonthlyPrSelect');
        const metaEl = content.querySelector('#prMonthlyMeta');
        const resultEl = content.querySelector('#prMonthlyResult');
        const yearSelect = content.querySelector('#prMonthlyYear');
        const monthSelect = content.querySelector('#prMonthlyMonth');
        const pdfBtn = content.querySelector('#prMonthlyPdfBtn');
        const excelBtn = content.querySelector('#prMonthlyExcelBtn');
        const hwpBtn = content.querySelector('#prMonthlyHwpBtn');
        let lastReportMeta = null;
        let diocesePrList = [];

        function encodePrOption(church, pr) {
            return `${church}\u0001${pr}`;
        }

        function applyPrSelection(church, pr) {
            churchInput.value = church || '';
            nameInput.value = pr || '';
        }

        async function loadDiocesePrOptions() {
            if (!useDiocese || !prSelect) return;
            try {
                diocesePrList = await fetchDiocesePrs(diocese);
            } catch (error) {
                console.warn(error);
                diocesePrList = [];
            }
            while (prSelect.options.length > 1) prSelect.remove(1);
            diocesePrList.forEach((row) => {
                const church = String(row.church_name || '').trim();
                const pr = String(row.pr_name || '').trim();
                if (!church || !pr) return;
                const prType = String(row.pr_type || '').trim();
                const opt = document.createElement('option');
                opt.value = encodePrOption(church, pr);
                opt.textContent = prType ? `[${prType}] ${church} · ${pr}` : `${church} · ${pr}`;
                if (church === initialChurch && pr === initialPr) opt.selected = true;
                prSelect.appendChild(opt);
            });
            if (!prSelect.value && initialChurch && initialPr) {
                const opt = document.createElement('option');
                opt.value = encodePrOption(initialChurch, initialPr);
                opt.textContent = `${initialChurch} · ${initialPr}`;
                opt.selected = true;
                prSelect.appendChild(opt);
            }
        }

        if (prSelect) {
            prSelect.addEventListener('change', () => {
                const raw = prSelect.value || '';
                if (!raw) return;
                const parts = raw.split('\u0001');
                applyPrSelection(parts[0] || '', parts[1] || '');
            });
        }

        function setExportEnabled(on) {
            pdfBtn.disabled = !on;
            excelBtn.disabled = !on;
            hwpBtn.disabled = !on;
        }

        for (let y = defaultYear; y >= defaultYear - 5; y -= 1) {
            const opt = document.createElement('option');
            opt.value = String(y);
            opt.textContent = `${y}년`;
            if (y === defaultYear) opt.selected = true;
            yearSelect.appendChild(opt);
        }
        for (let m = 1; m <= 12; m += 1) {
            const opt = document.createElement('option');
            opt.value = String(m);
            opt.textContent = `${m}월`;
            if (m === defaultMonth) opt.selected = true;
            monthSelect.appendChild(opt);
        }

        async function runSearch() {
            const churchName = churchInput.value.trim();
            const prName = nameInput.value.trim();
            if (!churchName) {
                alert('성당 명칭을 입력해주세요.');
                churchInput.focus();
                return;
            }
            if (!prName) {
                alert('Pr 명칭을 입력해주세요.');
                nameInput.focus();
                return;
            }
            resultEl.innerHTML = '<div class="empty">불러오는 중...</div>';
            setExportEnabled(false);
            lastReportMeta = null;
            try {
                const data = await fetchPrMonthlyReport(
                    churchName,
                    prName,
                    yearSelect.value,
                    monthSelect.value
                );
                const liveUser = await refreshLoggedInUser();
                metaEl.textContent = `${useDiocese ? diocese + ' · ' : ''}${data.church_name} · ${data.pr_name} · ${data.year}년 ${data.month}월 · 회원 ${data.total_members}명${(liveUser?.senatus_name || data.senatus_name) ? ` · ${liveUser?.senatus_name || data.senatus_name}세나뚜스` : ''}`;
                const senatus = resolveSenatusName(
                    liveUser?.senatus_name,
                    data.senatus_name,
                    user?.senatus_name
                );
                const formSenatus = formTemplateSenatus(senatus);
                let formHtml;
                if (formSenatus === '대구') formHtml = buildPrMonthlyDaeguFormHtml(data);
                else if (formSenatus === '광주') formHtml = buildPrMonthlyGwangjuFormHtml(data);
                else formHtml = buildPrMonthlyFormHtml(data);
                resultEl.innerHTML = formHtml;
                wireBlankEditables(resultEl);
                lastReportMeta = {
                    label: 'Pr',
                    name: data.pr_name,
                    year: data.year,
                    month: data.month
                };
                setExportEnabled(true);
            } catch (error) {
                metaEl.textContent = '';
                resultEl.innerHTML = `<div class="empty">${escapeHtml(error.message || '조회 실패')}</div>`;
            }
        }

        function getFormEl() {
            return resultEl.querySelector('#prMonthlyFormPrint');
        }

        async function runPdfExport() {
            const formEl = getFormEl();
            if (!formEl || !lastReportMeta) {
                alert('먼저 월례보고를 조회한 뒤 출력을 눌러주세요.');
                return;
            }
            const prevText = pdfBtn.textContent;
            setExportEnabled(false);
            pdfBtn.textContent = 'PDF 생성 중...';
            try {
                await exportMonthlyFormToPdf(formEl, lastReportMeta);
            } catch (error) {
                console.error('Pr 월례보고 PDF 오류:', error);
                alert('PDF 생성 중 오류가 발생했습니다: ' + (error.message || error));
            } finally {
                pdfBtn.textContent = prevText;
                setExportEnabled(!!getFormEl());
            }
        }

        async function runExcelExport() {
            const formEl = getFormEl();
            if (!formEl || !lastReportMeta) {
                alert('먼저 월례보고를 조회한 뒤 출력을 눌러주세요.');
                return;
            }
            const prevText = excelBtn.textContent;
            setExportEnabled(false);
            excelBtn.textContent = 'Excel 생성 중...';
            try {
                await exportMonthlyFormToExcel(formEl, lastReportMeta);
            } catch (error) {
                console.error('Pr 월례보고 Excel 오류:', error);
                alert('Excel 생성 중 오류가 발생했습니다: ' + (error.message || error));
            } finally {
                excelBtn.textContent = prevText;
                setExportEnabled(!!getFormEl());
            }
        }

        function runHwpExport() {
            const formEl = getFormEl();
            if (!formEl || !lastReportMeta) {
                alert('먼저 월례보고를 조회한 뒤 출력을 눌러주세요.');
                return;
            }
            try {
                exportMonthlyFormToHangul(formEl, lastReportMeta);
            } catch (error) {
                console.error('Pr 월례보고 한글 오류:', error);
                alert('한글 파일 생성 중 오류가 발생했습니다: ' + (error.message || error));
            }
        }

        content.querySelector('.close').onclick = () => closeModal(modal);
        content.querySelector('#prMonthlyBackBtn').onclick = () => showPrReportTypeChooser(modal, useDiocese ? diocese : '');
        content.querySelector('#prMonthlySearchBtn').onclick = runSearch;
        pdfBtn.onclick = runPdfExport;
        excelBtn.onclick = runExcelExport;
        hwpBtn.onclick = runHwpExport;
        [churchInput, nameInput].forEach((input) => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    runSearch();
                }
            });
        });

        const afterReady = () => {
            if (initialChurch && initialPr) runSearch();
        };
        if (useDiocese) loadDiocesePrOptions().then(afterReady);
        else afterReady();
    }

    function showPrBusinessTypeChooser(modal, dioceseName) {
        const user = getLoggedInUser();
        const useDiocese = isGwangjuSenatusUser(user);
        const diocese = useDiocese ? (normalizePrDiocese(dioceseName) || getSelectedPrDiocese()) : '';
        const content = modal.querySelector('.modal-content');
        content.classList.remove('wide');
        const typeOptions = [
            { value: '', label: '전체' },
            { value: '성인', label: '성인 Pr' },
            { value: '직속', label: '직속 Pr' },
            { value: '소년', label: '소년 Pr' },
            { value: '청년', label: '청년 Pr' }
        ];
        content.innerHTML = `
            <span class="close">&times;</span>
            <h2>Pr 사업보고</h2>
            <p class="hub-sub">${useDiocese ? escapeHtml(diocese) + ' · ' : ''}Pr 구분을 선택하세요.</p>
            <div class="hub-actions">
                ${typeOptions.map((opt, idx) => `
                    <button type="button" class="hub-btn${idx === 0 ? ' primary' : ''}" data-pr-type="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</button>
                `).join('')}
            </div>
            <div class="back-row">
                <button type="button" id="prBizTypeBackBtn">← 보고 종류</button>
            </div>
        `;
        content.querySelector('.close').onclick = () => closeModal(modal);
        content.querySelector('#prBizTypeBackBtn').onclick = () => showPrReportTypeChooser(modal, diocese);
        content.querySelectorAll('[data-pr-type]').forEach((btn) => {
            btn.onclick = () => {
                const prType = btn.getAttribute('data-pr-type') || '';
                const params = new URLSearchParams({ scope: 'pr' });
                if (useDiocese && diocese) params.set('diocese', diocese);
                if (prType) params.set('pr_type', prType);
                window.location.href = `activity-report.html?${params.toString()}`;
            };
        });
    }

    function showPrReportTypeChooser(modal, dioceseName) {
        const user = getLoggedInUser();
        const useDiocese = isGwangjuSenatusUser(user);
        const diocese = useDiocese ? (normalizePrDiocese(dioceseName) || getSelectedPrDiocese()) : '';
        if (useDiocese && !diocese) {
            showPrDioceseChooser(modal);
            return;
        }
        if (useDiocese) setSelectedPrDiocese(diocese);
        const content = modal.querySelector('.modal-content');
        content.classList.remove('wide');
        content.innerHTML = `
            <span class="close">&times;</span>
            <h2>Pr 보고</h2>
            <p class="hub-sub">${useDiocese ? escapeHtml(diocese) + ' · ' : ''}보고 종류를 선택하세요.</p>
            <div class="hub-actions">
                <button type="button" class="hub-btn" id="prMonthlyBtn">월례보고</button>
                <button type="button" class="hub-btn primary" id="prSummaryBtn">사업보고</button>
            </div>
            ${useDiocese ? `<div class="back-row">
                <button type="button" id="prTypeBackBtn">← 교구 선택</button>
            </div>` : ''}
        `;
        content.querySelector('.close').onclick = () => closeModal(modal);
        const backBtn = content.querySelector('#prTypeBackBtn');
        if (backBtn) backBtn.onclick = () => showPrDioceseChooser(modal);
        content.querySelector('#prMonthlyBtn').onclick = () => showPrMonthlyReportView(modal, diocese);
        content.querySelector('#prSummaryBtn').onclick = () => showPrBusinessTypeChooser(modal, diocese);
    }

    function showPrDioceseChooser(modal) {
        const user = getLoggedInUser();
        if (!isGwangjuSenatusUser(user)) {
            showPrReportTypeChooser(modal, '');
            return;
        }
        const preferred = normalizePrDiocese(user?.diocese_name) || getSelectedPrDiocese();
        const content = modal.querySelector('.modal-content');
        content.classList.remove('wide');
        content.innerHTML = `
            <span class="close">&times;</span>
            <h2>Pr 보고</h2>
            <p class="hub-sub">광주 세나뚜스 · 교구(지역)를 선택하세요.</p>
            <div class="hub-actions">
                ${PR_DIOCESE_OPTIONS.map((name) => `
                    <button type="button" class="hub-btn${preferred === name ? ' primary' : ''}" data-diocese="${escapeHtml(name)}">${escapeHtml(name)}</button>
                `).join('')}
            </div>
        `;
        content.querySelector('.close').onclick = () => closeModal(modal);
        content.querySelectorAll('[data-diocese]').forEach((btn) => {
            btn.onclick = () => {
                const diocese = setSelectedPrDiocese(btn.getAttribute('data-diocese'));
                showPrReportTypeChooser(modal, diocese);
            };
        });
    }

    function showPrReportHubModal() {
        ensureStyles();
        const user = getLoggedInUser();
        if (!user || !user.id) {
            alert('로그인이 필요합니다.');
            return;
        }
        refreshLoggedInUser().then((live) => {
            const existing = document.querySelector('.council-hub-modal');
            if (existing) closeModal(existing);

            const modal = document.createElement('div');
            modal.className = 'modal council-hub-modal';
            modal.innerHTML = '<div class="modal-content"></div>';
            document.body.appendChild(modal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal(modal);
            });
            if (isGwangjuSenatusUser(live || user)) showPrDioceseChooser(modal);
            else showPrReportTypeChooser(modal, '');
        }).catch(() => {
            const existing = document.querySelector('.council-hub-modal');
            if (existing) closeModal(existing);

            const modal = document.createElement('div');
            modal.className = 'modal council-hub-modal';
            modal.innerHTML = '<div class="modal-content"></div>';
            document.body.appendChild(modal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal(modal);
            });
            if (isGwangjuSenatusUser(user)) showPrDioceseChooser(modal);
            else showPrReportTypeChooser(modal, '');
        });
    }

    global.showCouncilReportHubModal = showCouncilReportHubModal;
    global.showCuriaHubModal = showCouncilReportHubModal;
    global.showPrReportHubModal = showPrReportHubModal;
})(typeof window !== 'undefined' ? window : global);
