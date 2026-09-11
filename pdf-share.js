/**
 * PDF 생성 후 시스템 공유(카톡 등) 또는 파일 저장
 * - 파일 Web Share가 WebView에서 막히면 → 임시 URL 업로드 후 URL 공유(SNS 시트)
 * - 그래도 안 되면 앱 내 SNS 대상 선택 시트 표시
 */
(function (global) {
    'use strict';

    function isAndroidWebView() {
        try {
            const ua = String(global.navigator && global.navigator.userAgent || '');
            if (/Android/i.test(ua) && /; wv\)/i.test(ua)) return true;
            const cap = global.Capacitor;
            if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) return true;
            if (cap && String(cap.getPlatform && cap.getPlatform() || '').toLowerCase() === 'android') return true;
            return false;
        } catch (_) {
            return false;
        }
    }

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
            if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
            if (typeof navigator.canShare === 'function') {
                return !!navigator.canShare({ files: [file] });
            }
            // canShare 없는 WebView: share() 시도는 호출부에서 처리
            return false;
        } catch (e) {
            return false;
        }
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || '');
                const idx = result.indexOf(',');
                resolve(idx >= 0 ? result.slice(idx + 1) : result);
            };
            reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
            reader.readAsDataURL(blob);
        });
    }

    async function uploadSharePdf(blob, filename) {
        const pdfBase64 = await blobToBase64(blob);
        const res = await fetch('/api/share-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: filename || 'Regio_report.pdf',
                pdfBase64
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success || !data.shareUrl) {
            throw new Error(data.error || `공유 링크 생성 실패 (${res.status})`);
        }
        return data;
    }

    async function tryNavigatorShare(payload) {
        if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
            return { ok: false, reason: 'no-share' };
        }
        try {
            if (payload.files && typeof navigator.canShare === 'function') {
                try {
                    if (!navigator.canShare({ files: payload.files })) {
                        return { ok: false, reason: 'cannot-share-files' };
                    }
                } catch (_) {
                    return { ok: false, reason: 'cannot-share-files' };
                }
            }
            await navigator.share(payload);
            return { ok: true };
        } catch (err) {
            if (err && err.name === 'AbortError') {
                return { ok: false, reason: 'abort', error: err };
            }
            return { ok: false, reason: 'error', error: err };
        }
    }

    function injectShareSheetStyles() {
        if (document.getElementById('regio-pdf-share-sheet-styles')) return;
        const style = document.createElement('style');
        style.id = 'regio-pdf-share-sheet-styles';
        style.textContent = `
            .regio-share-sheet-backdrop {
                position: fixed; inset: 0; z-index: 100200;
                background: rgba(15, 23, 42, 0.45);
                display: flex; align-items: flex-end; justify-content: center;
            }
            .regio-share-sheet {
                width: 100%; max-width: 480px;
                background: #fff; border-radius: 16px 16px 0 0;
                padding: 14px 14px calc(16px + env(safe-area-inset-bottom, 0px));
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif;
            }
            .regio-share-sheet h3 {
                margin: 0 0 6px; font-size: 15px; color: #0f172a;
            }
            .regio-share-sheet p {
                margin: 0 0 12px; font-size: 12px; color: #64748b; line-height: 1.45;
                word-break: break-all;
            }
            .regio-share-grid {
                display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
            }
            .regio-share-grid button {
                border: 1px solid #e2e8f0; background: #f8fafc; color: #1e293b;
                border-radius: 10px; padding: 12px 10px; font-size: 13px; font-weight: 700;
                min-height: 48px; cursor: pointer;
            }
            .regio-share-grid button.primary {
                background: #4A90E2; border-color: #4A90E2; color: #fff;
                grid-column: 1 / -1;
            }
            .regio-share-grid button.cancel {
                grid-column: 1 / -1; background: #fff; color: #64748b;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * WebView에서 시스템 SNS 시트가 안 뜰 때 앱 내 대상 선택 UI
     */
    function openShareTargetSheet(options) {
        injectShareSheetStyles();
        const opts = options || {};
        const existing = document.getElementById('regioShareSheet');
        if (existing) existing.remove();

        const shareUrl = opts.shareUrl || '';
        const title = opts.title || 'Regio 보고서';
        const text = opts.text || opts.filename || '';
        const filename = opts.filename || 'Regio_report.pdf';

        const backdrop = document.createElement('div');
        backdrop.id = 'regioShareSheet';
        backdrop.className = 'regio-share-sheet-backdrop';
        backdrop.innerHTML = `
            <div class="regio-share-sheet" role="dialog" aria-label="공유 대상 선택">
                <h3>공유 대상 선택</h3>
                <p>카카오톡·메시지 등 앱으로 보낼 PDF 링크입니다.<br>${shareUrl.replace(/</g, '&lt;')}</p>
                <div class="regio-share-grid">
                    <button type="button" class="primary" data-act="system">시스템 공유 (카톡 등)</button>
                    <button type="button" data-act="kakao">카카오톡</button>
                    <button type="button" data-act="sms">메시지</button>
                    <button type="button" data-act="mail">이메일</button>
                    <button type="button" data-act="copy">링크 복사</button>
                    <button type="button" data-act="open">PDF 열기</button>
                    <button type="button" class="cancel" data-act="cancel">닫기</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        return new Promise((resolve) => {
            let done = false;
            const finish = (result) => {
                if (done) return;
                done = true;
                backdrop.remove();
                resolve(result);
            };

            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) finish({ shared: false, cancelled: true });
            });

            backdrop.querySelectorAll('button[data-act]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const act = btn.getAttribute('data-act');
                    const shareText = `${title}\n${text}\n${shareUrl}`.trim();
                    try {
                        if (act === 'cancel') {
                            finish({ shared: false, cancelled: true });
                            return;
                        }
                        if (act === 'system') {
                            const r = await tryNavigatorShare({
                                title,
                                text: `${text}\n${shareUrl}`.trim(),
                                url: shareUrl
                            });
                            if (r.ok) {
                                finish({ shared: true, downloaded: false, via: 'system-url' });
                                return;
                            }
                            if (r.reason === 'abort') {
                                finish({ shared: false, cancelled: true });
                                return;
                            }
                            alert('이 기기에서 시스템 공유 시트를 열 수 없습니다. 다른 버튼을 이용해 주세요.');
                            return;
                        }
                        if (act === 'kakao') {
                            // 카카오톡 앱 공유 인텐트 (링크 텍스트)
                            const intent = 'intent://send?' +
                                `text=${encodeURIComponent(shareText)}` +
                                '#Intent;scheme=kakaotalk;package=com.kakao.talk;end';
                            global.location.href = intent;
                            finish({ shared: true, downloaded: false, via: 'kakao-intent' });
                            return;
                        }
                        if (act === 'sms') {
                            global.location.href = `sms:?body=${encodeURIComponent(shareText)}`;
                            finish({ shared: true, downloaded: false, via: 'sms' });
                            return;
                        }
                        if (act === 'mail') {
                            global.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(shareText)}`;
                            finish({ shared: true, downloaded: false, via: 'mail' });
                            return;
                        }
                        if (act === 'copy') {
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                await navigator.clipboard.writeText(shareUrl);
                            } else {
                                const ta = document.createElement('textarea');
                                ta.value = shareUrl;
                                document.body.appendChild(ta);
                                ta.select();
                                document.execCommand('copy');
                                ta.remove();
                            }
                            alert('공유 링크를 복사했습니다.');
                            finish({ shared: true, downloaded: false, via: 'copy' });
                            return;
                        }
                        if (act === 'open') {
                            global.open(shareUrl, '_blank');
                            finish({ shared: true, downloaded: false, via: 'open' });
                        }
                    } catch (err) {
                        console.warn('share target failed:', act, err);
                        alert('공유 실행 중 오류: ' + (err && err.message ? err.message : err));
                    }
                });
            });
        });
    }

    /**
     * @param {Blob} blob
     * @param {string} filename
     * @param {{ title?: string, text?: string, downloadOnCancel?: boolean }} [options]
     * @returns {Promise<{ shared: boolean, downloaded: boolean, cancelled?: boolean, via?: string }>}
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

        // 1) 네이티브 브리지(앱에서 주입 시)
        try {
            const native = global.RegioNativeShare || global.RegioAndroid;
            if (native && typeof native.sharePdf === 'function') {
                const b64 = await blobToBase64(pdfBlob);
                await native.sharePdf(b64, name);
                return { shared: true, downloaded: false, via: 'native' };
            }
            if (native && typeof native.sharePdfBase64 === 'function') {
                const b64 = await blobToBase64(pdfBlob);
                await native.sharePdfBase64(b64, name);
                return { shared: true, downloaded: false, via: 'native' };
            }
        } catch (err) {
            console.warn('네이티브 PDF 공유 실패:', err);
        }

        // 2) Capacitor Share (플러그인 있을 때)
        try {
            const cap = global.Capacitor;
            const Share = cap && ((cap.Plugins && cap.Plugins.Share) || (cap.PluginRegistry && cap.PluginRegistry.Share));
            if (Share && typeof Share.share === 'function') {
                // 파일 없이 URL 경로를 선호 — 아래에서 URL 생성 후 재시도
            }
        } catch (_) { /* ignore */ }

        // 3) Web Share Level 2 (파일) — Chrome 등
        if (canSharePdfFile(file)) {
            const fileShare = await tryNavigatorShare({
                files: [file],
                title,
                text
            });
            if (fileShare.ok) return { shared: true, downloaded: false, via: 'web-share-file' };
            if (fileShare.reason === 'abort') {
                if (downloadOnCancel) {
                    downloadBlob(pdfBlob, name);
                    return { shared: false, downloaded: true, cancelled: true };
                }
                return { shared: false, downloaded: false, cancelled: true };
            }
        } else if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            // canShare 미지원 WebView에서도 파일 공유 한 번 시도
            const fileShare = await tryNavigatorShare({
                files: [file],
                title,
                text
            });
            if (fileShare.ok) return { shared: true, downloaded: false, via: 'web-share-file-try' };
            if (fileShare.reason === 'abort') {
                return { shared: false, downloaded: false, cancelled: true };
            }
        }

        // 4) 임시 HTTPS 링크 생성 → URL 공유 (Android WebView에서 SNS 시트가 뜨는 경로)
        try {
            const uploaded = await uploadSharePdf(pdfBlob, name);
            const shareUrl = uploaded.shareUrl;
            const shareText = `${text}\n${shareUrl}`.trim();

            const urlShare = await tryNavigatorShare({
                title,
                text: shareText,
                url: shareUrl
            });
            if (urlShare.ok) {
                return { shared: true, downloaded: false, via: 'web-share-url' };
            }
            if (urlShare.reason === 'abort') {
                return { shared: false, downloaded: false, cancelled: true };
            }

            // Capacitor Share with URL
            try {
                const cap = global.Capacitor;
                const Share = cap && ((cap.Plugins && cap.Plugins.Share) || (cap.PluginRegistry && cap.PluginRegistry.Share));
                if (Share && typeof Share.share === 'function') {
                    await Share.share({ title, text: shareText, url: shareUrl, dialogTitle: 'PDF 공유' });
                    return { shared: true, downloaded: false, via: 'capacitor-share' };
                }
            } catch (err) {
                console.warn('Capacitor Share 실패:', err);
            }

            // 5) 앱 내 SNS 대상 시트 (카톡/메시지/메일/시스템공유)
            const sheetResult = await openShareTargetSheet({
                shareUrl,
                title,
                text,
                filename: name
            });
            return sheetResult;
        } catch (err) {
            console.warn('PDF URL 공유 경로 실패, 다운로드 폴백:', err);
        }

        // 6) 최후: 다운로드 (WebView에선 UI가 없을 수 있음 → 안내)
        downloadBlob(pdfBlob, name);
        if (isAndroidWebView()) {
            alert('이 앱 WebView에서는 시스템 다운로드/공유 창이 제한될 수 있습니다.\n잠시 후 다시 시도하거나, 공유 시 네트워크 상태를 확인해 주세요.');
        }
        return { shared: false, downloaded: true, via: 'download' };
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
                const result = await deliverJsPdf(pdfRef, fileName, shareOpts);
                if (result && result.cancelled) {
                    statusEl.textContent = '공유 취소됨';
                } else if (result && result.shared) {
                    statusEl.textContent = '공유 완료';
                } else if (result && result.downloaded) {
                    statusEl.textContent = '저장 시도 완료';
                } else {
                    statusEl.textContent = '공유/저장 완료';
                }
            } catch (err) {
                console.warn('PDF 공유 실패:', err);
                statusEl.textContent = '공유 실패 — 다시 시도';
                alert('공유 실패: ' + (err && err.message ? err.message : err));
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
