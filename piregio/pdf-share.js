/**
 * PDF 생성 후 시스템 공유(카톡 등) 또는 파일 저장
 * - Android/Chrome/WebView: navigator.share(files) → 카카오톡 선택 가능
 * - 미지원·실패 시: 다운로드로 폴백
 */
(function (global) {
    'use strict';

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'report.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    function canSharePdfFile(file) {
        try {
            return !!(
                typeof navigator !== 'undefined'
                && typeof navigator.share === 'function'
                && typeof navigator.canShare === 'function'
                && navigator.canShare({ files: [file] })
            );
        } catch (e) {
            return false;
        }
    }

    /**
     * @param {Blob} blob
     * @param {string} filename
     * @param {{ title?: string, text?: string, downloadOnCancel?: boolean }} [options]
     * @returns {Promise<{ shared: boolean, downloaded: boolean, cancelled?: boolean }>}
     */
    async function shareOrDownloadPdf(blob, filename, options) {
        const opts = options || {};
        const title = opts.title || 'Regio 보고서';
        const text = opts.text || filename || '';
        const downloadOnCancel = opts.downloadOnCancel !== false;
        const name = filename || 'Regio_report.pdf';
        const pdfBlob = blob instanceof Blob
            ? blob
            : new Blob([blob], { type: 'application/pdf' });
        const file = new File([pdfBlob], name, { type: 'application/pdf' });

        if (canSharePdfFile(file)) {
            try {
                await navigator.share({
                    files: [file],
                    title,
                    text
                });
                return { shared: true, downloaded: false };
            } catch (err) {
                const nameErr = err && err.name;
                // 사용자가 공유창을 닫은 경우
                if (nameErr === 'AbortError') {
                    if (downloadOnCancel) {
                        downloadBlob(pdfBlob, name);
                        return { shared: false, downloaded: true, cancelled: true };
                    }
                    return { shared: false, downloaded: false, cancelled: true };
                }
                console.warn('PDF 공유 실패, 파일 저장으로 전환:', err);
            }
        }

        downloadBlob(pdfBlob, name);
        return { shared: false, downloaded: true };
    }

    /** jsPDF 인스턴스 → 공유/저장 */
    async function deliverJsPdf(pdf, filename, options) {
        if (!pdf || typeof pdf.output !== 'function') {
            throw new Error('PDF 객체가 올바르지 않습니다.');
        }
        const blob = pdf.output('blob');
        return shareOrDownloadPdf(blob, filename, options);
    }

    /** A4 portrait @ 96dpi — phone viewport와 무관하게 PDF 캡처 */
    const PDF_FORM_CAPTURE_WIDTH = 794;

    function injectCaptureStyles() {
        if (document.getElementById('regio-pdf-capture-styles')) return;
        const style = document.createElement('style');
        style.id = 'regio-pdf-capture-styles';
        style.textContent = `
            /* WebView(body 스크롤포트)에서 left:-9999px 캡처는 잘리거나 빈 PDF가 됨 → 뷰포트 안 고정 */
            .regio-pdf-capture-root {
                position: fixed !important;
                left: 0 !important;
                top: 0 !important;
                opacity: 0 !important;
                pointer-events: none !important;
                background: #fff !important;
                box-sizing: border-box !important;
                overflow: visible !important;
                z-index: -1 !important;
            }
            .regio-pdf-capture-root .org-table-wrap,
            .regio-pdf-capture-root .biz-scroll,
            .regio-pdf-capture-root .biz-table-wrap,
            .regio-pdf-capture-root .event-report-scroll {
                overflow: visible !important;
                max-width: none !important;
            }
            .regio-pdf-capture-root .curia-monthly-form,
            .regio-pdf-capture-root .curia-comp-form,
            .regio-pdf-capture-root .pr-biz-form {
                overflow: visible !important;
                max-width: none !important;
            }
            .regio-pdf-form-overlay {
                position: fixed !important;
                inset: 0 !important;
                z-index: 100100 !important;
                background: #eef2f7 !important;
                display: flex !important;
                flex-direction: column !important;
                font-family: -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif !important;
            }
            .regio-pdf-form-toolbar {
                flex: 0 0 auto !important;
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                padding: 10px 12px !important;
                padding-top: calc(10px + env(safe-area-inset-top, 0px)) !important;
                background: #4A90E2 !important;
                color: #fff !important;
            }
            .regio-pdf-form-toolbar .regio-pdf-form-title {
                flex: 1 !important;
                font-size: 13px !important;
                font-weight: 700 !important;
                min-width: 0 !important;
            }
            .regio-pdf-form-toolbar .regio-pdf-form-status {
                font-size: 11px !important;
                opacity: 0.95 !important;
                white-space: nowrap !important;
            }
            .regio-pdf-form-toolbar button {
                border: none !important;
                border-radius: 8px !important;
                padding: 8px 12px !important;
                font-size: 12px !important;
                font-weight: 700 !important;
                cursor: pointer !important;
                min-height: 40px !important;
            }
            .regio-pdf-form-toolbar button.share {
                background: #fff !important;
                color: #2c5282 !important;
            }
            .regio-pdf-form-toolbar button.share:disabled {
                opacity: 0.55 !important;
                cursor: not-allowed !important;
            }
            .regio-pdf-form-toolbar button.close {
                background: rgba(255,255,255,0.2) !important;
                color: #fff !important;
            }
            .regio-pdf-form-scroll {
                flex: 1 1 auto !important;
                min-height: 0 !important;
                overflow: auto !important;
                -webkit-overflow-scrolling: touch !important;
                touch-action: pan-y !important;
                padding: 12px !important;
                padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)) !important;
            }
            .regio-pdf-form-sheet {
                background: #fff !important;
                border-radius: 10px !important;
                box-shadow: 0 2px 10px rgba(0,0,0,0.08) !important;
                padding: 16px 14px !important;
                width: min(100%, ${PDF_FORM_CAPTURE_WIDTH}px) !important;
                margin: 0 auto !important;
                box-sizing: border-box !important;
                color: #111 !important;
            }
        `;
        document.head.appendChild(style);
    }

    function escapeUi(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * 화면에 보이는 PDF 출력 폼 오버레이 (WebView에서 캡처·공유용)
     * @returns {{ overlay: HTMLElement, sheet: HTMLElement, setStatus: Function, setShareEnabled: Function, close: Function, waitClosed: Promise }}
     */
    function openPdfFormOverlay(options) {
        injectCaptureStyles();
        const opts = options || {};
        const existing = document.getElementById('regioPdfFormOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'regioPdfFormOverlay';
        overlay.className = 'regio-pdf-form-overlay';
        overlay.innerHTML = `
            <div class="regio-pdf-form-toolbar">
                <div class="regio-pdf-form-title">${escapeUi(opts.title || 'PDF 출력')}</div>
                <div class="regio-pdf-form-status" data-role="status">${escapeUi(opts.status || '준비 중...')}</div>
                <button type="button" class="share" data-role="share" disabled>공유</button>
                <button type="button" class="close" data-role="close">닫기</button>
            </div>
            <div class="regio-pdf-form-scroll">
                <div class="regio-pdf-form-sheet" data-role="sheet"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        const sheet = overlay.querySelector('[data-role="sheet"]');
        const statusEl = overlay.querySelector('[data-role="status"]');
        const shareBtn = overlay.querySelector('[data-role="share"]');
        const closeBtn = overlay.querySelector('[data-role="close"]');

        let resolveClosed;
        const waitClosed = new Promise((resolve) => { resolveClosed = resolve; });
        let pdfRef = null;
        let fileName = opts.filename || 'Regio_report.pdf';
        let shareOpts = opts.shareOptions || {};

        function close() {
            overlay.remove();
            if (resolveClosed) resolveClosed();
        }

        closeBtn.addEventListener('click', close);
        shareBtn.addEventListener('click', async () => {
            if (!pdfRef) return;
            shareBtn.disabled = true;
            statusEl.textContent = '공유 창 여는 중...';
            try {
                await deliverJsPdf(pdfRef, fileName, shareOpts);
                statusEl.textContent = '공유/저장 완료';
            } catch (err) {
                console.warn('PDF 공유 실패:', err);
                statusEl.textContent = '공유 실패 — 다시 시도';
            } finally {
                shareBtn.disabled = false;
            }
        });

        return {
            overlay,
            sheet,
            setStatus(text) {
                if (statusEl) statusEl.textContent = text || '';
            },
            setShareEnabled(enabled) {
                shareBtn.disabled = !enabled;
            },
            setPdf(pdf, name, options) {
                pdfRef = pdf;
                if (name) fileName = name;
                if (options) shareOpts = options;
                shareBtn.disabled = !pdf;
            },
            close,
            waitClosed
        };
    }

    /**
     * HTML 문자열을 보이는 폼으로 띄운 뒤 캡처→PDF 생성.
     * WebView에서는 화면 밖 캡처가 실패하므로 이 경로를 사용.
     */
    async function buildPdfFromHtml(html, options) {
        const opts = options || {};
        const h2c = global.html2canvas;
        const jspdfNs = global.jspdf;
        if (!h2c) throw new Error('html2canvas 라이브러리가 필요합니다.');
        if (!jspdfNs || !jspdfNs.jsPDF) throw new Error('jsPDF 라이브러리가 필요합니다.');

        const ui = openPdfFormOverlay({
            title: opts.title || 'PDF 출력',
            status: '폼 표시 중...',
            filename: opts.filename,
            shareOptions: opts.shareOptions
        });
        ui.sheet.innerHTML = html;
        ui.setStatus('PDF 생성 중...');

        try {
            if (global.document.fonts && global.document.fonts.ready) {
                await global.document.fonts.ready;
            }
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            await new Promise((r) => setTimeout(r, 80));

            const canvas = await h2c(ui.sheet, {
                scale: opts.scale || 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false
            });

            const { jsPDF } = jspdfNs;
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const pdf = new jsPDF('portrait', 'mm', 'a4');
            const pageWidth = 210;
            const pageHeight = 297;
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            ui.setPdf(pdf, opts.filename, opts.shareOptions);
            ui.setStatus('완료 — 공유를 누르거나 내용을 확인하세요');
            ui.setShareEnabled(true);

            if (opts.autoShare) {
                try {
                    await deliverJsPdf(pdf, opts.filename, opts.shareOptions);
                    ui.setStatus('공유/저장 완료');
                } catch (err) {
                    console.warn('자동 공유 실패:', err);
                    ui.setStatus('공유 실패 — 공유 버튼을 다시 눌러주세요');
                }
            }

            return { pdf, ui };
        } catch (err) {
            ui.setStatus('생성 실패: ' + (err && err.message ? err.message : err));
            throw err;
        }
    }

    function syncFormControlValues(sourceEl, cloneEl) {
        const srcControls = sourceEl.querySelectorAll('input, textarea, select');
        const cloneControls = cloneEl.querySelectorAll('input, textarea, select');
        const len = Math.min(srcControls.length, cloneControls.length);
        for (let i = 0; i < len; i += 1) {
            const src = srcControls[i];
            const clone = cloneControls[i];
            if (src.tagName === 'SELECT') {
                clone.value = src.value;
                [...clone.options].forEach((opt, idx) => {
                    opt.selected = !!src.options[idx]?.selected;
                });
            } else if (src.type === 'checkbox' || src.type === 'radio') {
                clone.checked = src.checked;
            } else {
                clone.value = src.value;
            }
        }
    }

    /**
     * 공식 양식을 데스크톱 너비로 클론 (withFrozenBlanks 이후 호출).
     * @returns {{ root: HTMLElement, cleanup: () => void }}
     */
    function prepareFormClone(formEl, options) {
        injectCaptureStyles();
        const opts = options || {};
        const baseWidth = opts.width || PDF_FORM_CAPTURE_WIDTH;
        const root = document.createElement('div');
        root.className = 'regio-pdf-capture-root';
        root.style.width = `${baseWidth}px`;
        root.style.padding = opts.padding || '12px 14px';
        root.style.fontFamily = "'Malgun Gothic', '맑은 고딕', sans-serif";
        /* WebView body 스크롤포트에서 화면 밖(-9999) 캡처 방지 */
        root.style.position = 'fixed';
        root.style.left = '0';
        root.style.top = '0';
        root.style.opacity = '0';
        root.style.pointerEvents = 'none';
        root.style.zIndex = '-1';

        const clone = formEl.cloneNode(true);
        if (clone.id) clone.removeAttribute('id');
        clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
        clone.style.width = '100%';
        clone.style.maxWidth = 'none';
        clone.style.overflow = 'visible';
        syncFormControlValues(formEl, clone);

        root.appendChild(clone);
        document.body.appendChild(root);

        const contentWidth = Math.max(clone.scrollWidth, clone.offsetWidth, baseWidth);
        if (contentWidth > baseWidth) {
            root.style.width = `${contentWidth}px`;
        }

        return {
            root,
            cleanup() {
                root.remove();
            }
        };
    }

    /**
     * @param {HTMLElement} formEl
     * @param {object} [html2canvasOptions]
     * @returns {Promise<HTMLCanvasElement>}
     */
    async function captureFormToCanvas(formEl, html2canvasOptions) {
        const h2c = global.html2canvas;
        if (!h2c) throw new Error('html2canvas 라이브러리가 필요합니다.');
        const prep = prepareFormClone(formEl);
        try {
            if (global.document.fonts && global.document.fonts.ready) {
                await global.document.fonts.ready;
            }
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            return await h2c(prep.root, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                ...(html2canvasOptions || {})
            });
        } finally {
            prep.cleanup();
        }
    }

    global.RegioPdfShare = {
        downloadBlob,
        canSharePdfFile,
        shareOrDownloadPdf,
        deliverJsPdf,
        PDF_FORM_CAPTURE_WIDTH,
        prepareFormClone,
        captureFormToCanvas,
        openPdfFormOverlay,
        buildPdfFromHtml
    };
})(typeof window !== 'undefined' ? window : global);
