(function (global) {
    'use strict';

    const ROSTER_ID_MIN = 3;
    const ROSTER_ID_MAX = 103;

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

    function cellText(value) {
        const text = String(value ?? '').trim();
        return text ? escapeHtml(text) : '-';
    }

    function buildLoginIdDisplay(member) {
        if (member.login_id) return String(member.login_id);
        const name = String(member.display_name || member.name || '').trim();
        const phone = String(member.phone_last4 || '').replace(/\D/g, '').slice(-4);
        if (name && phone.length === 4) return `${name}${phone}`;
        return name || '-';
    }

    function buildTableRows(members) {
        return members.map((member) => `
            <tr>
                <td style="padding:6px 8px;border:1px solid #ddd;text-align:center;">${member.id}</td>
                <td style="padding:6px 8px;border:1px solid #ddd;white-space:nowrap;font-family:monospace;">${cellText(buildLoginIdDisplay(member))}</td>
                <td style="padding:6px 8px;border:1px solid #ddd;">${cellText(member.church_name)}</td>
                <td style="padding:6px 8px;border:1px solid #ddd;">${cellText(member.pr_name)}</td>
                <td style="padding:6px 8px;border:1px solid #ddd;text-align:center;font-family:monospace;">${cellText(member.password)}</td>
            </tr>`).join('');
    }

    function buildRosterTableHtml(members) {
        return `
            <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;">
                <thead>
                    <tr style="background:#4A90E2;color:#fff;">
                        <th style="padding:8px 6px;border:1px solid #ccc;width:48px;">번호</th>
                        <th style="padding:8px 6px;border:1px solid #ccc;width:140px;">ID(성명+숫자)</th>
                        <th style="padding:8px 6px;border:1px solid #ccc;">소속성당</th>
                        <th style="padding:8px 6px;border:1px solid #ccc;width:120px;">Pr명</th>
                        <th style="padding:8px 6px;border:1px solid #ccc;width:100px;">비번</th>
                    </tr>
                </thead>
                <tbody>${buildTableRows(members)}</tbody>
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

    async function fetchSampleRoster() {
        const response = await fetch('/api/sample-member-roster');
        const data = await parseJsonResponse(response);
        if (!response.ok || !data.success) {
            throw new Error(data.error || '명단 조회에 실패했습니다.');
        }
        return data.members || [];
    }

    function closeRosterModal() {
        const modal = document.getElementById('sampleMemberRosterModal');
        if (modal) modal.remove();
    }

    async function exportRosterToPdf(members) {
        await ensurePdfLibraries();

        const timestamp = new Date().toISOString().slice(0, 10);
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '0';
        tempContainer.style.width = '900px';
        tempContainer.style.backgroundColor = '#ffffff';
        tempContainer.style.padding = '20px';
        tempContainer.style.fontFamily = "'Malgun Gothic', '맑은 고딕', sans-serif";
        tempContainer.innerHTML = `
            <h1 style="font-size:20px;margin:0 0 6px;">Regio 모의 회원 명단</h1>
            <p style="margin:0 0 14px;color:#555;font-size:13px;">회원 ${ROSTER_ID_MIN}번 ~ ${ROSTER_ID_MAX}번 / 총 ${members.length}명 / ${timestamp} · ID·소속성당·Pr명·비번</p>
            ${buildRosterTableHtml(members)}
        `;
        document.body.appendChild(tempContainer);

        try {
            const canvas = await html2canvas(tempContainer, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff'
            });

            const { jsPDF } = window.jspdf;
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

            pdf.save(`Regio_모의회원명단_${ROSTER_ID_MIN}-${ROSTER_ID_MAX}_${timestamp}.pdf`);
        } finally {
            document.body.removeChild(tempContainer);
        }
    }

    function showRosterModal(members) {
        closeRosterModal();

        const overlay = document.createElement('div');
        overlay.id = 'sampleMemberRosterModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:stretch;justify-content:center;z-index:10000;padding:max(8px,env(safe-area-inset-top)) 8px max(8px,env(safe-area-inset-bottom));box-sizing:border-box;';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:12px;width:min(900px,calc(100vw - 16px));max-width:100%;max-height:min(92vh,calc(100dvh - 16px));display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.25);box-sizing:border-box;margin:0 auto;">
                <div style="padding:18px 22px 12px;border-bottom:1px solid #eee;">
                    <h3 style="margin:0 0 6px;font-size:20px;color:#333;">모의 회원 명단 출력</h3>
                    <p style="margin:0 0 4px;color:#666;font-size:14px;">회원 ${ROSTER_ID_MIN}번 ~ ${ROSTER_ID_MAX}번 · 총 ${members.length}명</p>
                    <p style="margin:0;color:#555;font-size:13px;line-height:1.5;">ID(성명+숫자)·소속성당·Pr명·비번을 PDF로 저장해 로그인 테스트에 사용할 수 있습니다.</p>
                </div>
                <div id="sampleRosterTableWrap" style="padding:16px 22px;overflow:auto;flex:1;">
                    ${buildRosterTableHtml(members)}
                </div>
                <div style="padding:14px 22px 18px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
                    <button type="button" id="sampleRosterPdfBtn" style="background:#28a745;color:#fff;border:none;padding:10px 18px;border-radius:6px;font-size:14px;cursor:pointer;">PDF 출력</button>
                    <button type="button" id="sampleRosterCloseBtn" style="background:#6c757d;color:#fff;border:none;padding:10px 18px;border-radius:6px;font-size:14px;cursor:pointer;">닫기</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeRosterModal();
        });
        document.getElementById('sampleRosterCloseBtn').addEventListener('click', closeRosterModal);
        document.getElementById('sampleRosterPdfBtn').addEventListener('click', async () => {
            const btn = document.getElementById('sampleRosterPdfBtn');
            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'PDF 생성 중...';
            try {
                await exportRosterToPdf(members);
            } catch (error) {
                console.error('샘플 명단 PDF 오류:', error);
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

    async function showSampleMemberRoster() {
        if (!assertLocalSampleUi('샘플명단출력')) return;
        let loadingModal = document.getElementById('sampleMemberRosterLoading');
        if (!loadingModal) {
            loadingModal = document.createElement('div');
            loadingModal.id = 'sampleMemberRosterLoading';
            loadingModal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:9999;color:#fff;font-size:16px;';
            loadingModal.textContent = '샘플 명단을 불러오는 중...';
            document.body.appendChild(loadingModal);
        }

        try {
            const members = await fetchSampleRoster();
            if (!members.length) {
                alert('표시할 샘플 명단이 없습니다.');
                return;
            }
            showRosterModal(members);
        } catch (error) {
            console.error('샘플 명단 조회 오류:', error);
            alert(error.message || '샘플 명단 조회 중 오류가 발생했습니다.');
        } finally {
            if (loadingModal && loadingModal.parentNode) {
                loadingModal.parentNode.removeChild(loadingModal);
            }
        }
    }

    document.addEventListener('click', function (e) {
        const item = e.target.closest('[data-action="sample-member-roster"]');
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll('.dropdown-menu.show').forEach((menu) => menu.classList.remove('show'));
        showSampleMemberRoster();
    }, true);

    global.RegioSampleMemberRoster = {
        showSampleMemberRoster,
        exportRosterToPdf,
        fetchSampleRoster
    };
})(typeof window !== 'undefined' ? window : global);
