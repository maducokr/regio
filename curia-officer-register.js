(function (global) {
    'use strict';

    const COUNCIL_TYPE = { key: '꾸리아', letter: 'K', nameField: 'curia_name' };

    const POSITION_ROLES = [
        { key: '단장', num: '1' },
        { key: '부단장', num: '2' },
        { key: '서기', num: '3' },
        { key: '회계', num: '4' }
    ];

    const ALLOWED_OFFICER_CODES = new Set(
        POSITION_ROLES.map((p) => `${COUNCIL_TYPE.letter}${p.num}`)
    );

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

    function findRoleByNum(num) {
        return POSITION_ROLES.find((p) => p.num === String(num || '')) || null;
    }

    function parseOfficerCode(code) {
        const match = String(code || '').trim().match(/^K([1-4])$/i);
        if (!match) return null;
        const role = findRoleByNum(match[1]);
        if (!role) return null;
        return { role, code: `K${role.num}` };
    }

    function buildOfficerCode(roleKey) {
        const role = POSITION_ROLES.find((p) => p.key === roleKey);
        if (!role) return '';
        return `${COUNCIL_TYPE.letter}${role.num}`;
    }

    function ensureStyles() {
        let style = document.getElementById('curia-officer-register-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'curia-officer-register-styles';
            document.head.appendChild(style);
        }
        style.textContent = `
            .curia-officer-modal.modal { display: block; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); overflow-y: auto; }
            .curia-officer-modal .modal-content { background-color: white; margin: 5% auto 40px; padding: 30px; border-radius: 10px; width: 90%; max-width: 480px; position: relative; }
            .curia-officer-modal .close { color: #aaa; float: right; font-size: 28px; font-weight: bold; position: absolute; right: 20px; top: 15px; cursor: pointer; }
            .curia-officer-modal .close:hover { color: #000; }
            .curia-officer-modal h2 { text-align: center; margin-bottom: 12px; color: #333; }
            .curia-officer-modal .hint { margin: 0 0 16px; padding: 8px 10px; background: #f8f9fa; border-radius: 6px; font-size: 11px; line-height: 1.45; color: #666; }
            .curia-officer-modal .member-summary { margin: 0 0 14px; font-size: 13px; color: #555; line-height: 1.5; }
            .curia-officer-modal .member-summary strong { color: #333; }
            .curia-officer-modal .section-label { display: block; margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #333; }
            .curia-officer-modal .meta-fields { margin: 0 0 14px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
            .curia-officer-modal .meta-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
            .curia-officer-modal .meta-item { display: flex; flex-direction: column; gap: 4px; }
            .curia-officer-modal .meta-item.full { grid-column: 1 / -1; }
            .curia-officer-modal .meta-item span { font-size: 12px; color: #475569; font-weight: 600; }
            .curia-officer-modal .meta-item input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
            .curia-officer-modal .meta-item input:focus { outline: none; border-color: #4A90E2; }
            .curia-officer-modal .choice-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
            .curia-officer-modal .choice-tab { flex: 1 1 calc(50% - 6px); min-width: 0; }
            .curia-officer-modal .choice-tab input { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; }
            .curia-officer-modal .choice-tab span { display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%; min-height: 40px; padding: 8px 6px; border: 1px solid #dbe3ee; border-radius: 8px; background: #f8fafc; color: #64748b; font-size: 13px; font-weight: 600; cursor: pointer; box-sizing: border-box; }
            .curia-officer-modal .choice-tab .tab-code { color: #4A90E2; font-weight: 700; }
            .curia-officer-modal .choice-tab input:checked + span { background: #4A90E2; border-color: #4A90E2; color: #fff; }
            .curia-officer-modal .choice-tab input:checked + span .tab-code { color: #fff; }
            .curia-officer-modal .choice-tab:hover span { color: #334155; border-color: #94a3b8; }
            .curia-officer-modal .choice-tab input:checked:hover + span { color: #fff; border-color: #4A90E2; }
            .curia-officer-modal .name-field { margin-bottom: 14px; }
            .curia-officer-modal .id-input-box { display: flex; align-items: stretch; border: 1px solid #ddd; border-radius: 6px; overflow: hidden; background: #fff; }
            .curia-officer-modal .id-input-box:focus-within { border-color: #4A90E2; }
            .curia-officer-modal .id-prefix-label { display: flex; align-items: center; padding: 0 12px; background: #f8f9fa; border-right: 1px solid #ddd; font-size: 13px; font-weight: 600; color: #333; white-space: nowrap; min-width: 64px; justify-content: center; }
            .curia-officer-modal .id-input-box input { border: none; border-radius: 0; margin: 0; flex: 1; padding: 12px; min-width: 0; font-size: 14px; width: 100%; }
            .curia-officer-modal .id-input-box input:focus { outline: none; }
            .curia-officer-modal .code-preview { margin: 0 0 14px; padding: 10px 12px; border-radius: 8px; background: #eef5fc; color: #357ABD; font-size: 14px; font-weight: 600; text-align: center; }
            .curia-officer-modal .code-preview.empty { background: #f8f9fa; color: #999; font-weight: 500; }
            .curia-officer-modal .submit-btn { width: 100%; padding: 12px; background-color: #4A90E2; color: white; border: none; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 4px; }
            .curia-officer-modal .submit-btn:hover { background-color: #357ABD; }
            .curia-officer-modal .submit-btn:disabled { opacity: 0.7; cursor: not-allowed; background-color: #adb5bd; }
        `;
    }

    function closeModal(modal) {
        if (modal && modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
    }

    function buildRoleTabsHtml() {
        return POSITION_ROLES.map((item) => `
            <label class="choice-tab">
                <input type="radio" name="councilRole" value="${item.key}" data-num="${item.num}">
                <span><span class="tab-code role-num">${item.num}</span>${item.key}</span>
            </label>
        `).join('');
    }

    async function showCuriaOfficerRegisterModal() {
        ensureStyles();

        const sessionUser = getLoggedInUser();
        if (!sessionUser || !sessionUser.id) {
            alert('로그인이 필요합니다.');
            return;
        }

        if (global.RegioAdminMenu && !RegioAdminMenu.guardActivityAssignmentAction('꾸리아직급등록')) {
            return;
        }

        let profileUser;
        try {
            const response = await fetch(`/api/user/${sessionUser.id}`);
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || '회원 정보를 불러올 수 없습니다.');
            }
            profileUser = data.user;
        } catch (error) {
            alert(error.message || '회원 정보를 불러오는 중 오류가 발생했습니다.');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal curia-officer-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h2>꾸리아직급등록</h2>
                <p class="hint">꾸리아 이름을 입력하고 직급을 선택하세요.<br>
                    단장 <strong>K1</strong> · 부단장 <strong>K2</strong> · 서기 <strong>K3</strong> · 회계 <strong>K4</strong>
                </p>
                <p class="member-summary">
                    <strong>${profileUser.name || ''}</strong><br>
                    성당: ${profileUser.church_name || '-'} · Pr: ${profileUser.pr_name || '-'}
                </p>
                <span class="section-label">1. 꾸리아 이름</span>
                <div class="name-field">
                    <div class="id-input-box">
                        <span class="id-prefix-label">꾸리아</span>
                        <input type="text" placeholder="꾸리아 이름 입력" id="councilNameInput">
                    </div>
                </div>
                <span class="section-label">2. 꾸리아 승인·회합 정보</span>
                <div class="meta-fields">
                    <div class="meta-row">
                        <label class="meta-item" for="curiaApprovedOnInput">
                            <span>소속 꾸리아 승인일자</span>
                            <input type="date" id="curiaApprovedOnInput">
                        </label>
                        <label class="meta-item" for="curiaMeetingOnInput">
                            <span>회합일자</span>
                            <input type="date" id="curiaMeetingOnInput">
                        </label>
                    </div>
                    <label class="meta-item full" for="curiaMeetingPlaceInput">
                        <span>회합장소</span>
                        <input type="text" id="curiaMeetingPlaceInput" placeholder="예: 성당 교육관 2층" maxlength="100">
                    </label>
                </div>
                <span class="section-label">3. 직급 선택</span>
                <div class="choice-tabs" id="councilRoleTabs">${buildRoleTabsHtml()}</div>
                <div class="code-preview empty" id="officerCodePreview">분류번호: -</div>
                <button type="button" class="submit-btn" id="councilOfficerSaveBtn">저장</button>
            </div>
        `;
        document.body.appendChild(modal);

        const nameInput = modal.querySelector('#councilNameInput');
        const approvedOnInput = modal.querySelector('#curiaApprovedOnInput');
        const meetingOnInput = modal.querySelector('#curiaMeetingOnInput');
        const meetingPlaceInput = modal.querySelector('#curiaMeetingPlaceInput');
        const codePreview = modal.querySelector('#officerCodePreview');
        const saveBtn = modal.querySelector('#councilOfficerSaveBtn');

        function toDateInput(value) {
            if (!value) return '';
            const m = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
            return m ? m[1] : '';
        }

        function getSelectedRole() {
            const checked = modal.querySelector('input[name="councilRole"]:checked');
            return checked ? checked.value : '';
        }

        function updateCodePreview() {
            const role = getSelectedRole();
            const code = buildOfficerCode(role);
            if (!code) {
                codePreview.textContent = '분류번호: -';
                codePreview.classList.add('empty');
                return;
            }
            codePreview.textContent = `분류번호: ${code} (꾸리아 ${role})`;
            codePreview.classList.remove('empty');
        }

        function applyRole(key) {
            const radio = modal.querySelector(`input[name="councilRole"][value="${key}"]`);
            if (radio) radio.checked = true;
            updateCodePreview();
        }

        modal.querySelectorAll('input[name="councilRole"]').forEach((input) => {
            input.addEventListener('change', updateCodePreview);
        });

        nameInput.value = String(profileUser.curia_name || '').trim();
        approvedOnInput.value = toDateInput(profileUser.curia_approved_on);
        meetingOnInput.value = toDateInput(profileUser.curia_meeting_on);
        meetingPlaceInput.value = String(profileUser.curia_meeting_place || '').trim();
        const parsed = parseOfficerCode(profileUser.curia_officer);
        if (parsed) applyRole(parsed.role.key);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
        modal.querySelector('.close').onclick = () => closeModal(modal);

        saveBtn.addEventListener('click', async () => {
            const role = getSelectedRole();
            const councilName = nameInput.value.trim();
            const officerCode = buildOfficerCode(role);
            const approvedOn = String(approvedOnInput.value || '').trim();
            const meetingOn = String(meetingOnInput.value || '').trim();
            const meetingPlace = String(meetingPlaceInput.value || '').trim();

            if (!councilName) {
                alert('꾸리아 이름을 입력해주세요.');
                return;
            }
            if (!role || !ALLOWED_OFFICER_CODES.has(officerCode)) {
                alert('직급(단장/부단장/서기/회계)을 선택해주세요.');
                return;
            }
            if (!approvedOn) {
                alert('소속 꾸리아 승인일자를 입력해주세요.');
                approvedOnInput.focus();
                return;
            }
            if (!meetingOn) {
                alert('회합일자를 입력해주세요.');
                meetingOnInput.focus();
                return;
            }
            if (!meetingPlace) {
                alert('회합장소를 입력해주세요.');
                meetingPlaceInput.focus();
                return;
            }

            saveBtn.disabled = true;
            const originalText = saveBtn.textContent;
            saveBtn.textContent = '저장 중...';

            try {
                const response = await fetch(`/api/user/${profileUser.id}/curia-officer`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        council_type: COUNCIL_TYPE.key,
                        council_name: councilName,
                        position_role: role,
                        curia_officer: officerCode,
                        curia_approved_on: approvedOn,
                        curia_meeting_on: meetingOn,
                        curia_meeting_place: meetingPlace
                    })
                });
                const data = await response.json();
                if (!response.ok || !data.success) {
                    throw new Error(data.error || '꾸리아직급등록에 실패했습니다.');
                }

                const updated = Object.assign({}, sessionUser, data.user);
                const userInfoString = JSON.stringify(updated);
                sessionStorage.setItem('userInfo', userInfoString);
                localStorage.setItem('userInfo', userInfoString);

                alert(`꾸리아 직급이 등록되었습니다. (${officerCode})`);
                closeModal(modal);
            } catch (error) {
                alert(error.message || '저장 중 오류가 발생했습니다.');
                saveBtn.disabled = false;
            } finally {
                if (saveBtn.parentNode) {
                    saveBtn.textContent = originalText;
                }
            }
        });
    }

    global.showCuriaOfficerRegisterModal = showCuriaOfficerRegisterModal;
})(typeof window !== 'undefined' ? window : global);
