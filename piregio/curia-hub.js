(function (global) {
    'use strict';

    const COUNCIL_LEVELS = [
        { key: 'curia', label: '꾸리아', nameField: 'curia_name', activityScope: 'curia' },
        { key: 'comitia', label: '꼬미시움', nameField: 'comitia_name', activityScope: 'comitia' },
        { key: 'regia', label: '레지아', nameField: 'regia_name', activityScope: 'regia' }
    ];

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
        const styleParts = [];
        if (minHeight) styleParts.push(`min-height:${minHeight}`);
        styleParts.push('white-space:pre-wrap');
        const styleAttr = ` style="${styleParts.join(';')}"`;
        const has = t ? ' has-value' : '';
        return `<div class="line-box blank-editable${has}"${styleAttr} contenteditable="true" data-placeholder="입력">${escapeHtml(t)}</div>`;
    }

    function fitBlankInputWidth(inp) {
        if (!inp || !inp.classList.contains('amt')) return;
        const cs = window.getComputedStyle(inp);
        const minPx = parseFloat(cs.minWidth) || 26;
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
        const w = Math.ceil(probe.getBoundingClientRect().width) + 10;
        document.body.removeChild(probe);
        inp.style.width = `${Math.max(minPx, w)}px`;
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
            /* Pr 월례 7.회계 금액칸: 기본 ~1/3, 내용에 따라 늘어남 */
            .curia-monthly-form .blank.amt,
            .council-hub-modal .curia-monthly-form input.blank.amt.blank-editable {
                min-width:1.6em !important;
                width:1.6em;
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
                width:auto !important;
                min-width:2.2em !important;
                max-width:100% !important;
                margin:0 1px !important;
                padding:1px 4px !important;
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
            }
            .curia-monthly-form .blank.w4.blank-editable,
            .council-hub-modal .curia-monthly-form input.blank.w4.blank-editable { min-width:3.5em !important; }
            .curia-monthly-form .blank.w6.blank-editable,
            .council-hub-modal .curia-monthly-form input.blank.w6.blank-editable { min-width:5em !important; }
            .curia-monthly-form .blank.w10.blank-editable,
            .council-hub-modal .curia-monthly-form input.blank.w10.blank-editable { min-width:8em !important; }
            .curia-monthly-form .blank.w20.blank-editable,
            .council-hub-modal .curia-monthly-form input.blank.w20.blank-editable { min-width:14em !important; }
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
            .curia-monthly-form .finance-wrap { display:grid; grid-template-columns:1fr 1fr; gap:0; border:1px solid #333; }
            .curia-monthly-form .finance-col { border-right:1px solid #333; }
            .curia-monthly-form .finance-col:last-child { border-right:none; }
            .curia-monthly-form .finance-col h4 { margin:0; padding:6px; text-align:center; border-bottom:1px solid #333; background:#f3f4f6; font-size:12px; }
            .curia-monthly-form .finance-col table { width:100%; border-collapse:collapse; font-size:11px; }
            .curia-monthly-form .finance-col td { border-bottom:1px solid #ddd; padding:5px 8px; }
            .curia-monthly-form .finance-col tr:last-child td { border-bottom:none; }
            .curia-monthly-form .finance-balance { border:1px solid #333; border-top:none; padding:6px 10px; text-align:right; }
            .curia-monthly-form .note { margin-top:8px; font-size:11px; color:#666; }
            @media (max-width: 700px) {
                .curia-monthly-form .finance-wrap { grid-template-columns:1fr; }
                .curia-monthly-form .finance-col { border-right:none; border-bottom:1px solid #333; }
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
                    <div class="sec-title">9. 주요 활동 내역</div>
                    ${lineBoxHtml(data.major_activities, '72px')}
                </div>

                <div class="sec">
                    <div class="sec-title">10. 기타(질의 및 건의)</div>
                    ${lineBoxHtml(data.inquiries, '48px')}
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
            <p class="hub-sub">공식 양식에 DB 보유 항목만 자동 기입합니다.</p>
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
                metaEl.textContent = `${data.label}: ${data.council_name} · ${data.year}년 ${data.month}월 · 회원 ${data.total_members}명`;
                resultEl.innerHTML = buildMonthlyFormHtml(data);
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

    function showPrMonthlyReportView(modal) {
        ensureStyles();
        const user = getLoggedInUser();
        const initialChurch = String(user?.church_name || '').trim();
        const initialPr = String(user?.pr_name || '').trim();
        const now = new Date();
        const defaultYear = now.getFullYear();
        const defaultMonth = now.getMonth() + 1;

        const content = modal.querySelector('.modal-content');
        content.classList.add('wide');
        content.innerHTML = `
            <span class="close">&times;</span>
            <h2>Pr 월례보고</h2>
            <p class="hub-sub">쁘레시디움 월례 보고서 양식에 DB 보유 항목만 자동 기입합니다.</p>
            <div class="org-toolbar">
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
                <button type="button" id="prMonthlyBackBtn">← Pr 보고 선택</button>
            </div>
        `;

        const churchInput = content.querySelector('#prMonthlyChurchInput');
        const nameInput = content.querySelector('#prMonthlyNameInput');
        const metaEl = content.querySelector('#prMonthlyMeta');
        const resultEl = content.querySelector('#prMonthlyResult');
        const yearSelect = content.querySelector('#prMonthlyYear');
        const monthSelect = content.querySelector('#prMonthlyMonth');
        const pdfBtn = content.querySelector('#prMonthlyPdfBtn');
        const excelBtn = content.querySelector('#prMonthlyExcelBtn');
        const hwpBtn = content.querySelector('#prMonthlyHwpBtn');
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
                metaEl.textContent = `${data.church_name} · ${data.pr_name} · ${data.year}년 ${data.month}월 · 회원 ${data.total_members}명`;
                resultEl.innerHTML = buildPrMonthlyFormHtml(data);
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
        content.querySelector('#prMonthlyBackBtn').onclick = () => showPrReportTypeChooser(modal);
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

        if (initialChurch && initialPr) runSearch();
    }

    function showPrReportTypeChooser(modal) {
        const content = modal.querySelector('.modal-content');
        content.classList.remove('wide');
        content.innerHTML = `
            <span class="close">&times;</span>
            <h2>Pr 보고</h2>
            <p class="hub-sub">보고 종류를 선택하세요.</p>
            <div class="hub-actions">
                <button type="button" class="hub-btn" id="prMonthlyBtn">월례보고</button>
                <button type="button" class="hub-btn primary" id="prSummaryBtn">사업보고</button>
            </div>
        `;
        content.querySelector('.close').onclick = () => closeModal(modal);
        content.querySelector('#prMonthlyBtn').onclick = () => showPrMonthlyReportView(modal);
        content.querySelector('#prSummaryBtn').onclick = () => {
            window.location.href = 'activity-report.html?scope=pr';
        };
    }

    function showPrReportHubModal() {
        ensureStyles();
        const user = getLoggedInUser();
        if (!user || !user.id) {
            alert('로그인이 필요합니다.');
            return;
        }

        const existing = document.querySelector('.council-hub-modal');
        if (existing) closeModal(existing);

        const modal = document.createElement('div');
        modal.className = 'modal council-hub-modal';
        modal.innerHTML = '<div class="modal-content"></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
        showPrReportTypeChooser(modal);
    }

    global.showCouncilReportHubModal = showCouncilReportHubModal;
    global.showCuriaHubModal = showCouncilReportHubModal;
    global.showPrReportHubModal = showPrReportHubModal;
})(typeof window !== 'undefined' ? window : global);
