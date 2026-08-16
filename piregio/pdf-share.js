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

    global.RegioPdfShare = {
        downloadBlob,
        canSharePdfFile,
        shareOrDownloadPdf,
        deliverJsPdf
    };
})(typeof window !== 'undefined' ? window : global);
