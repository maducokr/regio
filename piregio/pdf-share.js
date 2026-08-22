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
            .regio-pdf-capture-root {
                position: absolute !important;
                left: -9999px !important;
                top: 0 !important;
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
        `;
        document.head.appendChild(style);
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
        captureFormToCanvas
    };
})(typeof window !== 'undefined' ? window : global);
