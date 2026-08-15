(function (global) {
    'use strict';

    const MEMBERS_PER_PDF_PAGE = 20;

    function escHtml(value) {
        return String(value ?? '-')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getLoggedInUser() {
        if (global.RegioAdminMenu && RegioAdminMenu.getLoggedInUser) {
            return RegioAdminMenu.getLoggedInUser();
        }
        const raw = sessionStorage.getItem('userInfo') || localStorage.getItem('userInfo');
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
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

    function buildMemberCategoryNames(activities) {
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

    function buildMemberAssignmentText(assignments) {
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

    function mapSectionMembers(section, includeAssignmentsOverride) {
        const includeAssignments = includeAssignmentsOverride !== null
            ? includeAssignmentsOverride
            : section.include_assignments === true;
        return (section.members || []).map((member) => ({
            name: member.name,
            passno: member.passno || '',
            assignmentText: includeAssignments ? buildMemberAssignmentText(member.assignments) : '',
            categoryText: buildMemberCategoryNames(member.activities)
        }));
    }

    async function fetchTestExportReport(user) {
        const params = new URLSearchParams({
            member_id: String(user.id),
            church_name: user.church_name || '',
            pr_name: user.pr_name || '',
            curia_name: user.curia_name || ''
        });
        const response = await fetch(`/api/test-export/report?${params.toString()}`);
        const data = await parseJsonResponse(response);
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'DB 조회에 실패했습니다.');
        }
        return data;
    }

    function buildScreenSectionHtml(section, includeAssignmentsOverride) {
        const members = mapSectionMembers(section, includeAssignmentsOverride);
        const includeAssignments = includeAssignmentsOverride !== null
            ? includeAssignmentsOverride
            : section.include_assignments === true;
        const title = section.title || '활동 자료';
        const assignmentHeader = includeAssignments
            ? '<th style="padding:8px 10px;border:1px solid #ccc;width:28%;">활동배당</th>'
            : '';

        if (!members.length) {
            return `
                <section style="margin-bottom:24px;">
                    <h4 style="margin:0 0 6px;color:#4A90E2;font-size: 12px;">${escHtml(title)}</h4>
                    <p style="margin:0 0 8px;color:#666;font-size: 12px;">${escHtml(section.start)} ~ ${escHtml(section.end)} · 0명</p>
                    <p style="color:#888;font-size: 12px;padding:12px;background:#f8f9fa;border-radius:6px;">해당 기간 자료 없음</p>
                </section>
            `;
        }

        const rows = members.map((member, index) => {
            const assignmentCell = includeAssignments
                ? `<td style="padding:8px 10px;border:1px solid #ddd;font-size:12px;line-height:1.45;">${escHtml(member.assignmentText)}</td>`
                : '';
            return `
                <tr>
                    <td style="padding:8px 10px;border:1px solid #ddd;text-align:center;width:40px;">${index + 1}</td>
                    <td style="padding:8px 10px;border:1px solid #ddd;width:100px;">${escHtml(member.name)}</td>
                    <td style="padding:8px 10px;border:1px solid #ddd;text-align:center;width:90px;font-family:monospace;">${escHtml(member.passno)}</td>
                    ${assignmentCell}
                    <td style="padding:8px 10px;border:1px solid #ddd;font-size:12px;line-height:1.45;">${escHtml(member.categoryText)}</td>
                </tr>
            `;
        }).join('');

        return `
            <section style="margin-bottom:28px;">
                <h4 style="margin:0 0 6px;color:#4A90E2;font-size: 12px;">${escHtml(title)}</h4>
                <p style="margin:0 0 10px;color:#666;font-size: 12px;">${escHtml(section.start)} ~ ${escHtml(section.end)} · ${members.length}명</p>
                <table style="width:100%;border-collapse:collapse;font-size: 12px;table-layout:fixed;">
                    <thead>
                        <tr style="background:#4A90E2;color:#fff;">
                            <th style="padding:8px 10px;border:1px solid #ccc;">No</th>
                            <th style="padding:8px 10px;border:1px solid #ccc;">성명</th>
                            <th style="padding:8px 10px;border:1px solid #ccc;">비번</th>
                            ${assignmentHeader}
                            <th style="padding:8px 10px;border:1px solid #ccc;">활동</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>
        `;
    }

    function buildScreenHtml(reportData) {
        return [
            buildScreenSectionHtml(reportData.personal_week, true),
            buildScreenSectionHtml(reportData.pr_month, false),
            buildScreenSectionHtml(reportData.curia_month, false)
        ].join('');
    }

    function closeTestExportModal() {
        const modal = document.getElementById('testExportViewModal');
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

    function showPdfCaptureOverlay(message) {
        const existing = document.getElementById('pdfCaptureOverlay');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.id = 'pdfCaptureOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:100001;display:flex;flex-direction:column;align-items:center;padding:20px;overflow:auto;';
        overlay.innerHTML = `
            <p id="pdfCaptureStatus" style="font-size: 12px;color:#333;margin:0 0 14px;font-family:Malgun Gothic,Arial,sans-serif;">${escHtml(message)}</p>
            <div id="pdfCaptureArea"></div>
        `;
        document.body.appendChild(overlay);
    }

    function hidePdfCaptureOverlay() {
        const overlay = document.getElementById('pdfCaptureOverlay');
        if (overlay) overlay.remove();
    }

    async function renderVisiblePageToPdf(pdf, pageHtml, pageIndex, isNewPage) {
        let area = document.getElementById('pdfCaptureArea');
        if (!area) {
            showPdfCaptureOverlay(`PDF 생성 중... (${pageIndex} 페이지)`);
            area = document.getElementById('pdfCaptureArea');
        }
        area.innerHTML = pageHtml;
        const statusEl = document.getElementById('pdfCaptureStatus');
        if (statusEl) statusEl.textContent = `PDF 생성 중... (${pageIndex} 페이지)`;
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        await new Promise((resolve) => setTimeout(resolve, 250));
        const target = area.querySelector('[data-test-pdf-page]') || area;
        const canvas = await html2canvas(target, {
            scale: 1,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
            allowTaint: true
        });
        addJpegPageToPdf(pdf, canvas, isNewPage);
    }

    function buildTestPdfPageHtml(pageMembers, sectionTitle, startDate, endDate, pageNum, totalPages, startNo, includeAssignments) {
        let rows = '';
        pageMembers.forEach((member) => {
            const assignmentCell = includeAssignments
                ? `<td style="padding:4px 6px;border:1px solid #ccc;font-size:9px;line-height:1.3;vertical-align:middle;word-break:break-all;">${escHtml(member.assignmentText)}</td>`
                : '';
            rows += `
                <tr style="height:30px;">
                    <td style="padding:4px 6px;border:1px solid #ccc;vertical-align:middle;font-size:11px;">${escHtml(member.name)}</td>
                    <td style="padding:4px 6px;border:1px solid #ccc;vertical-align:middle;text-align:center;font-size:11px;">${escHtml(member.passno || '')}</td>
                    ${assignmentCell}
                    <td style="padding:4px 6px;border:1px solid #ccc;font-size:9px;line-height:1.3;vertical-align:middle;word-break:break-all;">${escHtml(member.categoryText)}</td>
                </tr>
            `;
        });
        const assignmentHeader = includeAssignments
            ? '<th style="padding:5px;border:1px solid #357ABD;width:28%;font-size:11px;">활동배당</th>'
            : '';
        const nameWidth = includeAssignments ? '16%' : '22%';
        const passWidth = includeAssignments ? '12%' : '16%';
        return `
            <div data-test-pdf-page style="font-family:Malgun Gothic, Arial, sans-serif;padding:12px 16px;background:#fff;width:1000px;box-sizing:border-box;color:#000;">
                <div style="text-align:center;margin-bottom:10px;">
                    <h1 style="font-size: 12px;color:#333;margin:0 0 4px;">Regio TEST 자료 출력</h1>
                    <p style="font-size: 12px;color:#4A90E2;margin:0;font-weight:bold;">${escHtml(sectionTitle)}</p>
                    <p style="font-size:12px;color:#666;margin:4px 0 0;">조회기간: ${escHtml(startDate)} ~ ${escHtml(endDate)}</p>
                    <p style="font-size:11px;color:#888;margin:2px 0 0;">${pageNum} / ${totalPages} 페이지 · ${startNo}~${startNo + pageMembers.length - 1}번 (${pageMembers.length}명)</p>
                </div>
                <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
                    <thead>
                        <tr style="background:#4A90E2;color:#fff;height:28px;">
                            <th style="padding:5px;border:1px solid #357ABD;width:${nameWidth};font-size:11px;">성명</th>
                            <th style="padding:5px;border:1px solid #357ABD;width:${passWidth};font-size:11px;">비번</th>
                            ${assignmentHeader}
                            <th style="padding:5px;border:1px solid #357ABD;font-size:11px;">활동</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    function buildTestPdfEmptyPageHtml(sectionTitle, startDate, endDate, includeAssignments) {
        const assignmentHeader = includeAssignments
            ? '<th style="padding:5px;border:1px solid #357ABD;width:28%;font-size:11px;">활동배당</th>'
            : '';
        const nameWidth = includeAssignments ? '16%' : '22%';
        const passWidth = includeAssignments ? '12%' : '16%';
        return `
            <div data-test-pdf-page style="font-family:Malgun Gothic, Arial, sans-serif;padding:12px 16px;background:#fff;width:1000px;box-sizing:border-box;color:#000;">
                <div style="text-align:center;margin-bottom:10px;">
                    <h1 style="font-size: 12px;color:#333;margin:0 0 4px;">Regio TEST 자료 출력</h1>
                    <p style="font-size: 12px;color:#4A90E2;margin:0;font-weight:bold;">${escHtml(sectionTitle)}</p>
                    <p style="font-size:12px;color:#666;margin:4px 0 0;">조회기간: ${escHtml(startDate)} ~ ${escHtml(endDate)}</p>
                </div>
                <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:12px;">
                    <thead>
                        <tr style="background:#4A90E2;color:#fff;height:28px;">
                            <th style="padding:5px;border:1px solid #357ABD;width:${nameWidth};font-size:11px;">성명</th>
                            <th style="padding:5px;border:1px solid #357ABD;width:${passWidth};font-size:11px;">비번</th>
                            ${assignmentHeader}
                            <th style="padding:5px;border:1px solid #357ABD;font-size:11px;">활동</th>
                        </tr>
                    </thead>
                </table>
                <p style="text-align:center;color:#888;font-size: 12px;padding:24px 0;">해당 기간에 출력할 ${includeAssignments ? '활동·활동배당' : '활동'} 자료가 없습니다.</p>
            </div>
        `;
    }

    async function appendSectionToPdf(pdf, section, pageCounter, includeAssignmentsOverride) {
        const members = mapSectionMembers(section, includeAssignmentsOverride);
        const sectionTitle = section.title || '활동 자료';
        const startDate = section.start;
        const endDate = section.end;
        const includeAssignments = includeAssignmentsOverride !== null
            ? includeAssignmentsOverride
            : section.include_assignments === true;

        if (!members.length) {
            const pageHtml = buildTestPdfEmptyPageHtml(sectionTitle, startDate, endDate, includeAssignments);
            await renderVisiblePageToPdf(pdf, pageHtml, pageCounter.value, pageCounter.value > 1);
            pageCounter.value += 1;
            return 0;
        }

        const totalPages = Math.ceil(members.length / MEMBERS_PER_PDF_PAGE);
        for (let page = 0; page < totalPages; page++) {
            const pageMembers = members.slice(page * MEMBERS_PER_PDF_PAGE, (page + 1) * MEMBERS_PER_PDF_PAGE);
            const pageHtml = buildTestPdfPageHtml(
                pageMembers,
                sectionTitle,
                startDate,
                endDate,
                page + 1,
                totalPages,
                page * MEMBERS_PER_PDF_PAGE + 1,
                includeAssignments
            );
            await renderVisiblePageToPdf(pdf, pageHtml, pageCounter.value, pageCounter.value > 1);
            pageCounter.value += 1;
        }
        return members.length;
    }

    async function exportTestDataToPDF(reportData, user) {
        if (!global.jspdf || !global.html2canvas) {
            throw new Error('PDF 라이브러리가 로드되지 않았습니다.');
        }
        const { jsPDF } = global.jspdf;
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageCounter = { value: 1 };

        showPdfCaptureOverlay('TEST PDF 생성 중...');
        try {
            await appendSectionToPdf(pdf, reportData.personal_week, pageCounter, true);
            await appendSectionToPdf(pdf, reportData.pr_month, pageCounter, false);
            await appendSectionToPdf(pdf, reportData.curia_month, pageCounter, false);
        } finally {
            hidePdfCaptureOverlay();
        }

        const timestamp = new Date().toISOString().slice(0, 10);
        const week = reportData.personal_week;
        pdf.save(`Regio_TEST자료_${user.name}_${week.start}_${week.end}_${timestamp}.pdf`);
    }

    function showTestExportModal(reportData, user) {
        closeTestExportModal();
        const week = reportData.personal_week;

        const overlay = document.createElement('div');
        overlay.id = 'testExportViewModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:stretch;justify-content:center;z-index:10000;padding:max(8px,env(safe-area-inset-top)) 8px max(8px,env(safe-area-inset-bottom));box-sizing:border-box;';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:12px;width:min(1200px,calc(100vw - 16px));max-width:100%;max-height:min(92vh,calc(100dvh - 16px));display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.25);box-sizing:border-box;margin:0 auto;">
                <div style="padding:18px 22px 12px;border-bottom:1px solid #eee;">
                    <h3 style="margin:0 0 6px;font-size: 12px;color:#333;">TEST 자료 출력</h3>
                    <p style="margin:0;color:#666;font-size: 12px;">
                        ${escHtml(user.name)} · 개인 1주 ${escHtml(week.start)}~${escHtml(week.end)} ·
                        Pr 1개월 · 꾸리아 1개월
                    </p>
                </div>
                <div id="testExportScreenWrap" style="padding:16px 22px;overflow:auto;flex:1;"></div>
                <div style="padding:14px 22px 18px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
                    <button type="button" id="testExportPdfBtn" style="background:#28a745;color:#fff;border:none;padding:10px 18px;border-radius:6px;font-size: 12px;cursor:pointer;">PDF 출력</button>
                    <button type="button" id="testExportCloseBtn" style="background:#6c757d;color:#fff;border:none;padding:10px 18px;border-radius:6px;font-size: 12px;cursor:pointer;">닫기</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.getElementById('testExportScreenWrap').innerHTML = buildScreenHtml(reportData);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeTestExportModal();
        });
        document.getElementById('testExportCloseBtn').addEventListener('click', closeTestExportModal);
        document.getElementById('testExportPdfBtn').addEventListener('click', async () => {
            const btn = document.getElementById('testExportPdfBtn');
            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'PDF 생성 중...';
            try {
                await exportTestDataToPDF(reportData, user);
            } catch (error) {
                console.error('TEST PDF 오류:', error);
                alert('PDF 생성 중 오류가 발생했습니다: ' + error.message);
            } finally {
                btn.disabled = false;
                btn.textContent = original;
            }
        });
    }

    function assertLocalSampleUi(actionLabel) {
        if (global.RegioAppMode && typeof global.RegioAppMode.isLocal === 'function' && !global.RegioAppMode.isLocal()) {
            alert(`${actionLabel || 'TEST 기능'}은 로컬 모의 환경 전용입니다. Deploy(실서비스)에서는 사용할 수 없습니다.`);
            return false;
        }
        return true;
    }

    async function showTestExportView() {
        if (!assertLocalSampleUi('TEST 자료 PDF 출력')) return;
        const user = getLoggedInUser();
        if (!user || !user.id) {
            alert('로그인이 필요합니다. 로그인 후 TEST 자료 PDF를 출력해주세요.');
            return;
        }

        let loading = document.getElementById('testExportLoading');
        if (!loading) {
            loading = document.createElement('div');
            loading.id = 'testExportLoading';
            loading.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:9999;color:#fff;font-size: 12px;';
            loading.textContent = 'TEST 자료를 불러오는 중...';
            document.body.appendChild(loading);
        }

        try {
            const reportData = await fetchTestExportReport(user);
            showTestExportModal(reportData, user);
        } catch (error) {
            console.error('TEST 자료 조회 오류:', error);
            alert(error.message || 'TEST 자료 조회 중 오류가 발생했습니다.');
        } finally {
            if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
        }
    }

    document.addEventListener('click', (e) => {
        const item = e.target.closest('[data-action="test-activity-pdf"]');
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll('.dropdown-menu.show').forEach((menu) => menu.classList.remove('show'));
        if (global.RegioAdminMenu && !RegioAdminMenu.guardLoggedInAction('TEST 자료 PDF 출력')) return;
        showTestExportView();
    }, true);

    global.showTestExportView = showTestExportView;
    global.exportTestDataToPDF = showTestExportView;
})(typeof window !== 'undefined' ? window : global);
