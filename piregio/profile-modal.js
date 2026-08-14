(function (global) {
    'use strict';

    const Form = () => global.RegioMemberForm;

    function getLoggedInUser() {
        const raw = sessionStorage.getItem('userInfo') || localStorage.getItem('userInfo');
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (error) {
            return null;
        }
    }

    function ensureModalStyles() {
        if (Form()) Form().ensureSharedFormStyles();

        let style = document.getElementById('profile-modal-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'profile-modal-styles';
            document.head.appendChild(style);
        }
        style.textContent = `
            .modal.profile-edit-modal { display: block; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); overflow-y: auto; }
            .profile-edit-modal .modal-content { background-color: white; margin: 5% auto 40px; padding: 30px; border-radius: 10px; width: 90%; max-width: 440px; position: relative; box-sizing: border-box; }
            @media (max-width: 767.98px) {
                .profile-edit-modal { padding: 8px; }
                .profile-edit-modal .modal-content {
                    width: calc(100vw - 16px) !important;
                    max-width: calc(100vw - 16px) !important;
                    margin: 8px auto 16px !important;
                    padding: 16px 14px !important;
                    max-height: calc(100dvh - 24px);
                    overflow-y: auto;
                }
            }
            .profile-edit-modal .modal-content .close { color: #aaa; float: right; font-size: 28px; font-weight: bold; position: absolute; right: 20px; top: 15px; cursor: pointer; }
            .profile-edit-modal .modal-content .close:hover { color: #000; }
            .profile-edit-modal .modal-content h2 { text-align: center; margin-bottom: 20px; color: #333; }
            .profile-edit-modal .modal-content input,
            .profile-edit-modal .modal-content select { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
            .profile-edit-modal .modal-content input:focus,
            .profile-edit-modal .modal-content select:focus { outline: none; border-color: #4A90E2; }
            .profile-edit-modal .modal-content input[readonly] { background: #f8f9fa; color: #555; }
            .profile-edit-modal .id-field-wrap { position: relative; margin-bottom: 0; flex: 1; min-width: 0; }
            .profile-edit-modal .id-hint { margin: 6px 0 0; padding: 8px 10px; background: #f8f9fa; border-radius: 6px; font-size: 11px; line-height: 1.45; color: #666; }
            .profile-edit-modal .id-input-box { display: flex; align-items: stretch; border: 1px solid #ddd; border-radius: 6px; overflow: hidden; background: #fff; }
            .profile-edit-modal .id-input-box:focus-within { border-color: #4A90E2; }
            .profile-edit-modal .id-prefix-label { display: flex; align-items: center; padding: 0 12px; background: #f8f9fa; border-right: 1px solid #ddd; font-size: 14px; font-weight: 600; color: #333; white-space: nowrap; }
            .profile-edit-modal .id-input-box .input-field,
            .profile-edit-modal .id-input-box input[type="text"] { border: none; border-radius: 0; margin-bottom: 0; flex: 1; padding: 12px; min-width: 0; width: auto; }
            .profile-edit-modal .position-picker { display: none; position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: #fff; border: 1px solid #ddd; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); list-style: none; margin: 0; padding: 6px 0; z-index: 1100; max-height: 200px; overflow-y: auto; }
            .profile-edit-modal .position-picker.open { display: block; }
            .profile-edit-modal .position-picker li { padding: 8px 12px; font-size: 13px; color: #333; cursor: pointer; }
            .profile-edit-modal .position-picker li:hover,
            .profile-edit-modal .position-picker li.selected { background: #eef5fc; color: #4A90E2; }
            .profile-edit-modal .position-picker .pos-code { display: inline-block; width: 28px; font-weight: bold; color: #4A90E2; }
            .profile-edit-modal .selected-position-text { display: block; margin-bottom: 6px; font-size: 12px; color: #4A90E2; font-weight: 600; }
            .profile-edit-modal .selected-position-text.empty { color: #999; font-weight: normal; }
            .profile-edit-modal .profile-field-row { display: flex; align-items: stretch; gap: 6px; margin-bottom: 14px; }
            .profile-edit-modal .profile-field-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
            .profile-edit-modal .profile-field-main > input,
            .profile-edit-modal .profile-field-main > select { margin: 0; }
            .profile-edit-modal .profile-field-actions { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
            .profile-edit-modal .field-confirm-btn,
            .profile-edit-modal .field-save-btn {
                width: 64px !important; min-height: 36px; padding: 0 8px !important; border: none; border-radius: 6px;
                font-size: 13px !important; font-weight: 600; cursor: pointer; color: #fff;
            }
            .profile-edit-modal .field-confirm-btn { background: #6c757d !important; }
            .profile-edit-modal .field-confirm-btn:hover { background: #5a6268 !important; }
            .profile-edit-modal .field-confirm-btn.confirmed { background: #28a745 !important; cursor: default; }
            .profile-edit-modal .field-save-btn { background: #4A90E2 !important; }
            .profile-edit-modal .field-save-btn:hover:not(:disabled) { background: #357ABD !important; }
            .profile-edit-modal .field-save-btn:disabled { opacity: 0.55; cursor: not-allowed; background: #adb5bd !important; }
            .profile-edit-modal .profile-field-row.confirmed .profile-field-main > input,
            .profile-edit-modal .profile-field-row.confirmed .profile-field-main > select,
            .profile-edit-modal .profile-field-row.confirmed .id-input-box { border-color: #28a745; }
            .profile-edit-modal .profile-field-row.field-error .profile-field-main > input,
            .profile-edit-modal .profile-field-row.field-error .profile-field-main > select,
            .profile-edit-modal .profile-field-row.field-error .id-input-box { border-color: #dc3545; }
            .profile-edit-modal .profile-cancel-wrap { margin-top: 8px; padding-top: 12px; border-top: 1px solid #eee; }
            .profile-edit-modal .profile-cancel-btn {
                width: 100% !important; padding: 12px !important; background: #6c757d !important; color: #fff !important;
                border: none; border-radius: 6px; font-size: 15px !important; font-weight: 600; cursor: pointer;
            }
            .profile-edit-modal .profile-cancel-btn:hover { background: #5a6268 !important; }
            .profile-edit-modal .id-g-prefix-btn {
                flex-shrink: 0; width: auto !important; min-width: 42px; padding: 0 10px !important; border: none;
                border-right: 1px solid #ddd; border-radius: 0 !important;
                background: #f8f9fa !important; color: #222 !important; font-size: 14px !important; font-weight: 700; cursor: pointer;
            }
            .profile-edit-modal .id-g-prefix-btn.is-empty { color: #999 !important; }
            .profile-edit-modal .id-g-prefix-btn:hover { background: #eef2f6 !important; }
            .profile-edit-modal .id-position-change-btn {
                flex-shrink: 0; width: auto !important; min-width: 44px; padding: 0 10px !important; border: none;
                border-right: 1px solid #f5c2c7; border-radius: 0 !important;
                background: #dc3545 !important; color: #fff !important; font-size: 12px !important; font-weight: 700; cursor: pointer;
            }
            .profile-edit-modal .id-position-change-btn:hover { background: #c82333 !important; }
        `;
    }

    function getFieldContainer(modal, fieldKey) {
        return modal.querySelector(`.profile-field-row[data-field="${fieldKey}"]`);
    }

    function setFieldConfirmed(modal, fieldKey, confirmed) {
        const container = getFieldContainer(modal, fieldKey);
        const confirmBtn = modal.querySelector(`.field-confirm-btn[data-field="${fieldKey}"]`);
        const saveBtn = modal.querySelector(`.field-save-btn[data-field="${fieldKey}"]`);
        if (!container || !confirmBtn || !saveBtn) return;
        container.classList.toggle('confirmed', confirmed);
        container.classList.remove('field-error');
        confirmBtn.classList.toggle('confirmed', confirmed);
        confirmBtn.textContent = confirmed ? '완료' : '확인';
        saveBtn.disabled = !confirmed;
    }

    function resetFieldConfirmed(modal, fieldKey) {
        setFieldConfirmed(modal, fieldKey, false);
    }

    function setupFieldConfirmAndSave(modal, idField, getProfileUser, setProfileUser) {
        const MF = Form();
        const editableKeys = MF.PROFILE_EDITABLE_KEYS.slice();
        const confirmed = {};
        editableKeys.forEach((key) => {
            confirmed[key] = false;
        });

        function markError(fieldKey) {
            const container = getFieldContainer(modal, fieldKey);
            if (container) container.classList.add('field-error');
        }

        function resetOne(fieldKey) {
            if (!(fieldKey in confirmed)) return;
            confirmed[fieldKey] = false;
            resetFieldConfirmed(modal, fieldKey);
        }

        modal.querySelectorAll('.field-confirm-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const fieldKey = btn.dataset.field;
                const result = MF.validateField(fieldKey, modal, idField, 'profile');
                if (!result.ok) {
                    confirmed[fieldKey] = false;
                    resetFieldConfirmed(modal, fieldKey);
                    markError(fieldKey);
                    alert(result.message);
                    return;
                }
                confirmed[fieldKey] = true;
                setFieldConfirmed(modal, fieldKey, true);
            });
        });

        modal.querySelectorAll('.field-save-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const fieldKey = btn.dataset.field;
                if (!confirmed[fieldKey]) {
                    alert(`${MF.FIELD_LABELS[fieldKey] || '해당 항목'}을(를) 먼저 확인해 주세요.`);
                    return;
                }

                const validate = MF.validateField(fieldKey, modal, idField, 'profile');
                if (!validate.ok) {
                    confirmed[fieldKey] = false;
                    resetFieldConfirmed(modal, fieldKey);
                    markError(fieldKey);
                    alert(validate.message);
                    return;
                }

                const profileUser = getProfileUser();
                const formData = MF.collectMemberFormData(modal, idField, profileUser, fieldKey);
                formData.profile_field = fieldKey;
                const originalText = btn.textContent;
                btn.disabled = true;
                btn.textContent = '저장중';

                try {
                    const response = await fetch(`/api/user/${profileUser.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(formData)
                    });
                    const data = await response.json();
                    if (!response.ok || !data.success) {
                        throw new Error(data.error || '프로필 수정에 실패했습니다.');
                    }

                    const updated = Object.assign({}, profileUser, data.user, {
                        phone_last4: formData.phone_last4,
                        resident_id_front6: formData.resident_id_front6,
                        phone_full: formData.phone_full,
                        resident_id_full: formData.resident_id_full
                    });
                    setProfileUser(updated);

                    const sessionUser = getLoggedInUser() || {};
                    const userInfoString = JSON.stringify(Object.assign({}, sessionUser, data.user));
                    sessionStorage.setItem('userInfo', userInfoString);
                    localStorage.setItem('userInfo', userInfoString);

                    if (fieldKey === 'password') {
                        modal.querySelector('#regPassword').value = '';
                    }

                    confirmed[fieldKey] = false;
                    resetFieldConfirmed(modal, fieldKey);
                    alert(`${MF.FIELD_LABELS[fieldKey] || '항목'}이(가) 저장되었습니다.`);
                } catch (error) {
                    alert(error.message || '프로필 저장 중 오류가 발생했습니다.');
                } finally {
                    if (btn.parentNode) {
                        btn.textContent = originalText || '저장';
                        btn.disabled = !confirmed[fieldKey];
                    }
                }
            });
        });

        const bindReset = (selector, fieldKey, eventName) => {
            const els = modal.querySelectorAll(selector);
            els.forEach((el) => {
                el.addEventListener(eventName || 'input', () => resetOne(fieldKey));
            });
        };

        bindReset('#regUsername', 'id');
        const picker = modal.querySelector('#regPositionPicker');
        if (picker) {
            picker.addEventListener('mousedown', () => {
                setTimeout(() => {
                    resetOne('id');
                    resetOne('curia');
                    resetOne('council');
                    resetOne('officerAppointed');
                }, 0);
            });
        }
        bindReset('#regBaptismName', 'baptism');
        bindReset('input[name="regGender"]', 'baptism', 'change');
        bindReset('#regChurchName', 'church');
        bindReset('#regCuriaName', 'curia');
        bindReset('#regComitiaName', 'curia');
        bindReset('#regRegiaName', 'council');
        bindReset('#regSenatusName', 'council', 'change');
        bindReset('#regPrName', 'pr');
        bindReset('input[name="regPrType"]', 'pr', 'change');
        bindReset('#regPassword', 'password');
        bindReset('#regOfficerAppointedOn', 'officerAppointed', 'change');
        bindReset('#regOfficerAppointedOn', 'officerAppointed', 'input');
        bindReset('#regPrMeetingWeekday', 'prMeeting', 'change');
        bindReset('#regPrMeetingHour', 'prMeeting', 'change');
        bindReset('#regPrMeetingMinute', 'prMeeting', 'change');
    }

    function closeModal(modal) {
        if (modal && modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
    }

    async function showProfileEditModal() {
        const MF = Form();
        if (!MF) {
            alert('회원 폼 모듈(member-form-fields.js)을 불러오지 못했습니다.');
            return;
        }

        ensureModalStyles();

        const sessionUser = getLoggedInUser();
        if (!sessionUser || !sessionUser.id) {
            alert('로그인이 필요합니다.');
            return;
        }

        if (global.RegioAdminMenu) {
            const user = RegioAdminMenu.getLoggedInUser && RegioAdminMenu.getLoggedInUser();
            if (!user || !user.name) {
                alert('로그인이 필요합니다.');
                return;
            }
        }

        let profileUser;
        try {
            const response = await fetch(`/api/user/${sessionUser.id}`);
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || '개인정보를 불러올 수 없습니다.');
            }
            profileUser = data.user;
        } catch (error) {
            alert(error.message || '개인정보를 불러오는 중 오류가 발생했습니다.');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal profile-edit-modal';
        modal.innerHTML = MF.buildProfileModalHtml({ title: '프로필 수정' });
        document.body.appendChild(modal);

        const idField = MF.setupMemberIdField(modal, { mode: 'profile' });
        MF.fillMemberForm(modal, profileUser, idField, sessionUser);

        let initialSnapshot = MF.captureFormSnapshot(modal, idField);

        setupFieldConfirmAndSave(
            modal,
            idField,
            () => profileUser,
            (next) => {
                profileUser = next;
                initialSnapshot = MF.captureFormSnapshot(modal, idField);
            }
        );

        function requestCloseProfileModal() {
            if (MF.isFormDirty(modal, idField, initialSnapshot)) {
                const ok = window.confirm('저장하지 않은 수정 내용이 있습니다.\n취소하고 원래 화면으로 돌아갈까요?');
                if (!ok) return;
            }
            closeModal(modal);
        }

        modal.querySelector('#profileCancelBtn').addEventListener('click', requestCloseProfileModal);
        modal.querySelector('.close').onclick = requestCloseProfileModal;
        modal.onclick = (e) => {
            if (e.target === modal) requestCloseProfileModal();
        };

        const form = modal.querySelector('#memberProfileForm');
        form.addEventListener('submit', (e) => e.preventDefault());
    }

    global.showProfileEditModal = showProfileEditModal;
})(typeof window !== 'undefined' ? window : global);
