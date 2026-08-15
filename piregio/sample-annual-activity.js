(function (global) {
    'use strict';

    const REPORT_YEAR = 2025;
    const MEMBER_ID_MIN = 3;
    const MEMBER_ID_MAX = 103;
    const MEMBERS_PER_PDF_PAGE = 12;

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    }

    function buildActivityText(activities) {
        const seen = new Set();
        const labels = [];
        (activities || []).forEach((record) => {
            const cat = record.category_name || '';
            const parts = cat.split('-');
            const label = (parts.length > 1 ? parts.slice(1).join('-') : cat).trim();
            if (label && !seen.has(label)) {
                seen.add(label);
                labels.push(label);
            }
        });
        return labels.join(', ') || '-';
    }

    function buildAssignmentText(assignments) {
        const seen = new Set();
        const labels = [];
        (assignments || []).forEach((record) => {
            const activity = (record['활동배당'] || record.활동배당 || '').trim();
            if (!activity) return;
            const target = (record['활동대상자'] || record.활동대상자 || '').trim();
            const parts = activity.split('-');
            const label = (parts.length > 1 ? parts.slice(1).join('-') : activity).trim();
            const text = target ? `${label} (${target})` : label;
            if (text && !seen.has(text)) {
                seen.add(text);
                labels.push(text);
            }
        });
        return labels.join(', ') || '-';
    }

    function mapMembersForDisplay(members) {
        return (members || []).map((member) => ({
            id: member.id,
            display_name: member.display_name || member.name,
            password: member.passno || member.password || '-',
            assignmentText: buildAssignmentText(member.assignments),
            activityText: buildActivityText(member.activities)
        }));
    }

    function buildScreenTableHtml(rows) {
        const body = rows.map((row) => `
            <tr>
                <td style="padding:8px 10px;border:1px solid #ddd;text-align:center;width:48px;">${row.id}</td>
                <td style="padding:8px 10px;border:1px solid #ddd;width:90px;">${escapeHtml(row.display_name)}</td>
                <td style="padding:8px 10px;border:1px solid #ddd;text-align:center;width:90px;font-family:monospace;">${escapeHtml(row.password)}</td>
                <td style="padding:8px 10px;border:1px solid #ddd;font-size:12px;line-height:1.45;">${escapeHtml(row.activityText)}</td>
            </tr>
        `).join('');

        return `
            <table style="width:100%;border-collapse:collapse;font-size: 12px;table-layout:fixed;">
                <thead>
                    <tr style="background:#4A90E2;color:#fff;">
                        <th style="padding:8px 10px;border:1px solid #ccc;">번호</th>
                        <th style="padding:8px 10px;border:1px solid #ccc;">성명</th>
                        <th style="padding:8px 10px;border:1px solid #ccc;">비번</th>
                        <th style="padding:8px 10px;border:1px solid #ccc;">활동내역</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        `;
    }

    async function parseJsonResponse(response) {
        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (error) {
            if (/^\s*</.test(text)) {
                throw new Error('API를 찾을 수 없습니다. 서버를 재시작(서버끄기.bat → 서버켜기.bat) 후 다시 시도해주세요.');
            }
            throw new Error('서버 응답 형식 오류');
        }
    }

    async function fetchAnnualActivity(year) {
        const params = new URLSearchParams({ year: String(year || REPORT_YEAR) });
        const response = await fetch(`/api/sample-annual-activity?${params.toString()}`);
        const data = await parseJsonResponse(response);
        if (!response.ok || !data.success) {
            throw new Error(data.error || '1연간 샘플 활동 조회에 실패했습니다.');
        }
        return data;
    }

    function closeAnnualModal() {
        const modal = document.getElementById('sampleAnnualActivityModal');
        if (modal) modal.remove();
    }

    function downscaleCanvasIfNeeded(canvas, maxPx = 3500) {
        if (canvas.width <= maxPx && canvas.height <= maxPx) return canvas;
        const scale = Math.min(maxPx / canvas.width, maxPx / canvas.height);
        const scaled = document.createElement('canvas');
        scaled.width = Math.max(1, Math.floor(canvas.width * scale));
        scaled.height = Math.max(1, Math.floor(canvas.height * scale));
        const ctx = scaled.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, scaled.width, scaled.height);
        ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
        return scaled;
    }

    function canvasToJpegDataUrl(canvas) {
        let quality = 0.82;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 1_800_000 && quality > 0.35) {
            quality -= 0.12;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (!dataUrl.startsWith('data:image/jpeg')) {
            throw new Error('JPEG 변환에 실패했습니다.');
        }
        return dataUrl;
    }

    function addJpegPageToPdf(pdf, canvas, isNewPage) {
        const PAGE_W = 297;
        const PAGE_H = 210;
        const workCanvas = downscaleCanvasIfNeeded(canvas);
        const jpegDataUrl = canvasToJpegDataUrl(workCanvas);
        const ratio = workCanvas.width / workCanvas.height;
        let drawW = PAGE_W;
        let drawH = drawW / ratio;
        let offsetX = 0;

        if (drawH > PAGE_H) {
            drawH = PAGE_H;
            drawW = drawH * ratio;
            offsetX = (PAGE_W - drawW) / 2;
        }

        if (isNewPage) pdf.addPage('a4', 'landscape');
        pdf.addImage(jpegDataUrl, 'JPEG', offsetX, 0, drawW, drawH);
    }

    function buildPdfPageHtml(pageRows, reportMeta, pageNum, totalPages, startNo) {
        const rows = pageRows.map((row) => `
            <tr style="height:34px;">
                <td style="padding:4px 6px;border:1px solid #ccc;vertical-align:top;font-size:11px;">${escapeHtml(row.display_name)}</td>
                <td style="padding:4px 6px;border:1px solid #ccc;vertical-align:top;font-size:10px;text-align:center;font-family:monospace;">${escapeHtml(row.password)}</td>
                <td style="padding:4px 6px;border:1px solid #ccc;vertical-align:top;font-size:9px;line-height:1.35;word-break:break-all;">${escapeHtml(row.activityText)}</td>
            </tr>
        `).join('');

        return `
            <div data-annual-pdf-page style="font-family:Malgun Gothic, Arial, sans-serif;padding:12px 16px;background:#fff;width:1000px;box-sizing:border-box;color:#000;">
                <div style="text-align:center;margin-bottom:10px;">
                    <h1 style="font-size: 12px;color:#333;margin:0 0 4px;">Regio 모의 회원 성명·비번·활동내역</h1>
                    <p style="font-size: 12px;color:#4A90E2;margin:0;font-weight:bold;">${reportMeta.year}년 (${escapeHtml(reportMeta.start)} ~ ${escapeHtml(reportMeta.end)})</p>
                    <p style="font-size:11px;color:#888;margin:4px 0 0;">회원 ${MEMBER_ID_MIN}~${MEMBER_ID_MAX}번 · ${pageNum} / ${totalPages} 페이지 · ${startNo}~${startNo + pageRows.length - 1}번</p>
                </div>
                <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
                    <thead>
                        <tr style="background:#4A90E2;color:#fff;height:28px;">
                            <th style="padding:5px;border:1px solid #357ABD;width:14%;font-size:11px;">성명</th>
                            <th style="padding:5px;border:1px solid #357ABD;width:14%;font-size:11px;">비번</th>
                            <th style="padding:5px;border:1px solid #357ABD;width:72%;font-size:11px;">활동내역</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    async function renderPdfPage(pdf, pageHtml, pageIndex, isNewPage) {
        const area = document.getElementById('sampleAnnualPdfCaptureArea');
        if (!area) throw new Error('PDF 캡처 영역을 찾을 수 없습니다.');
        area.innerHTML = pageHtml;

        const statusEl = document.getElementById('sampleAnnualPdfCaptureStatus');
        if (statusEl) statusEl.textContent = `PDF 생성 중... (${pageIndex} 페이지)`;

        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));

        const target = area.querySelector('[data-annual-pdf-page]') || area;
        const canvas = await html2canvas(target, {
            scale: 1,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
            allowTaint: true
        });
        addJpegPageToPdf(pdf, canvas, isNewPage);
    }

    function showPdfCaptureOverlay() {
        const existing = document.getElementById('sampleAnnualPdfCaptureOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'sampleAnnualPdfCaptureOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:100001;display:flex;flex-direction:column;align-items:center;padding:20px;overflow:auto;';
        overlay.innerHTML = `
            <p id="sampleAnnualPdfCaptureStatus" style="font-size: 12px;color:#333;margin:0 0 14px;font-family:Malgun Gothic,Arial,sans-serif;">PDF 생성 중...</p>
            <div id="sampleAnnualPdfCaptureArea"></div>
        `;
        document.body.appendChild(overlay);
    }

    function hidePdfCaptureOverlay() {
        const overlay = document.getElementById('sampleAnnualPdfCaptureOverlay');
        if (overlay) overlay.remove();
    }

    async function exportAnnualActivityToPdf(reportData) {
        await ensurePdfLibraries();

        const rows = mapMembersForDisplay(reportData.members);
        const totalPages = Math.max(1, Math.ceil(rows.length / MEMBERS_PER_PDF_PAGE));
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        showPdfCaptureOverlay();

        try {
            for (let page = 0; page < totalPages; page++) {
                const pageRows = rows.slice(page * MEMBERS_PER_PDF_PAGE, (page + 1) * MEMBERS_PER_PDF_PAGE);
                const pageHtml = buildPdfPageHtml(
                    pageRows,
                    reportData,
                    page + 1,
                    totalPages,
                    page * MEMBERS_PER_PDF_PAGE + 1
                );
                await renderPdfPage(pdf, pageHtml, page + 1, page > 0);
            }

            const timestamp = new Date().toISOString().slice(0, 10);
            pdf.save(`Regio_모의회원_성명비번활동_${reportData.year}_${MEMBER_ID_MIN}-${MEMBER_ID_MAX}_${timestamp}.pdf`);
        } finally {
            hidePdfCaptureOverlay();
        }
    }

    function showAnnualActivityModal(reportData) {
        closeAnnualModal();

        const rows = mapMembersForDisplay(reportData.members);
        const overlay = document.createElement('div');
        overlay.id = 'sampleAnnualActivityModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:stretch;justify-content:center;z-index:10000;padding:max(8px,env(safe-area-inset-top)) 8px max(8px,env(safe-area-inset-bottom));box-sizing:border-box;';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:12px;width:min(1200px,calc(100vw - 16px));max-width:100%;max-height:min(92vh,calc(100dvh - 16px));display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.25);box-sizing:border-box;margin:0 auto;">
                <div style="padding:18px 22px 12px;border-bottom:1px solid #eee;">
                    <h3 style="margin:0 0 6px;font-size: 12px;color:#333;">모의 회원 성명·비번·활동내역</h3>
                    <p style="margin:0;color:#666;font-size: 12px;">${reportData.year}년 (${reportData.start} ~ ${reportData.end}) · 회원 ${MEMBER_ID_MIN}~${MEMBER_ID_MAX}번 · 총 ${rows.length}명</p>
                </div>
                <div style="padding:16px 22px;overflow:auto;flex:1;">
                    ${buildScreenTableHtml(rows)}
                </div>
                <div style="padding:14px 22px 18px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
                    <button type="button" id="sampleAnnualPdfBtn" style="background:#28a745;color:#fff;border:none;padding:10px 18px;border-radius:6px;font-size: 12px;cursor:pointer;">PDF 출력</button>
                    <button type="button" id="sampleAnnualCloseBtn" style="background:#6c757d;color:#fff;border:none;padding:10px 18px;border-radius:6px;font-size: 12px;cursor:pointer;">닫기</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeAnnualModal();
        });
        document.getElementById('sampleAnnualCloseBtn').addEventListener('click', closeAnnualModal);
        document.getElementById('sampleAnnualPdfBtn').addEventListener('click', async () => {
            const btn = document.getElementById('sampleAnnualPdfBtn');
            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'PDF 생성 중...';
            try {
                await exportAnnualActivityToPdf(reportData);
            } catch (error) {
                console.error('1연간 샘플 활동 PDF 오류:', error);
                alert('PDF 생성 중 오류가 발생했습니다: ' + error.message);
            } finally {
                btn.disabled = false;
                btn.textContent = original;
            }
        });
    }

    function assertLocalSampleUi(actionLabel) {
        if (global.RegioAppMode && typeof global.RegioAppMode.isLocal === 'function' && !global.RegioAppMode.isLocal()) {
            alert(`${actionLabel || '샘플 기능'}은 로컬 모의 환경 전용입니다. Deploy(실서비스)에서는 사용할 수 없습니다.`);
            return false;
        }
        return true;
    }

    async function showSampleAnnualActivity() {
        if (!assertLocalSampleUi('1연간샘플활동출력')) return;
        let loadingModal = document.getElementById('sampleAnnualActivityLoading');
        if (!loadingModal) {
            loadingModal = document.createElement('div');
            loadingModal.id = 'sampleAnnualActivityLoading';
            loadingModal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:9999;color:#fff;font-size: 12px;';
            loadingModal.textContent = `${REPORT_YEAR}년 샘플 활동을 불러오는 중...`;
            document.body.appendChild(loadingModal);
        }

        try {
            const reportData = await fetchAnnualActivity(REPORT_YEAR);
            if (!reportData.members || !reportData.members.length) {
                alert('표시할 샘플 활동 자료가 없습니다.');
                return;
            }
            showAnnualActivityModal(reportData);
        } catch (error) {
            console.error('1연간 샘플 활동 조회 오류:', error);
            alert(error.message || '1연간 샘플 활동 조회 중 오류가 발생했습니다.');
        } finally {
            if (loadingModal && loadingModal.parentNode) {
                loadingModal.parentNode.removeChild(loadingModal);
            }
        }
    }

    document.addEventListener('click', function (e) {
        const item = e.target.closest('[data-action="sample-annual-activity"]');
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll('.dropdown-menu.show').forEach((menu) => menu.classList.remove('show'));
        showSampleAnnualActivity();
    }, true);

    global.RegioSampleAnnualActivity = {
        showSampleAnnualActivity,
        exportAnnualActivityToPdf,
        fetchAnnualActivity
    };
})(typeof window !== 'undefined' ? window : global);
