(function (global) {
    'use strict';

    const STORAGE_PREFIX = 'regioSensitiveAuth_';
    const TOKEN_TTL_MS = 30 * 60 * 1000;

    const PURPOSE_META = {
        withdraw: {
            title: '탈단 — Gmail 인증',
            description: '탈단 시 소속 Pr 명칭만 삭제됩니다. 등록된 Gmail로 인증코드를 받아 확인해주세요.',
            confirmMessage: '탈단 시 소속 Pr 명칭만 삭제됩니다. 계속하시겠습니까?'
        },
        delete_member: {
            title: '회원 삭제 — Gmail 인증',
            description: '회원 삭제 전 등록된 Gmail로 인증코드를 받아 확인해주세요.',
            confirmMessage: '정말로 회원 삭제 화면으로 이동하시겠습니까?'
        }
    };

    function getLoggedInUser() {
        const raw = sessionStorage.getItem('userInfo') || localStorage.getItem('userInfo');
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function storageKey(purpose) {
        return `${STORAGE_PREFIX}${purpose}`;
    }

    function storeSensitiveAuth(purpose, payload) {
        sessionStorage.setItem(storageKey(purpose), JSON.stringify({
            ...payload,
            purpose,
            expiresAt: Date.now() + TOKEN_TTL_MS
        }));
    }

    function getStoredSensitiveAuth(purpose) {
        const raw = sessionStorage.getItem(storageKey(purpose));
        if (!raw) return null;
        try {
            const data = JSON.parse(raw);
            if (!data.expiresAt || Date.now() > data.expiresAt) {
                clearSensitiveAuth(purpose);
                return null;
            }
            return data;
        } catch {
            clearSensitiveAuth(purpose);
            return null;
        }
    }

    function clearSensitiveAuth(purpose) {
        sessionStorage.removeItem(storageKey(purpose));
    }

    function maskEmail(email) {
        const normalized = String(email || '').trim().toLowerCase();
        const [local, domain] = normalized.split('@');
        if (!local || !domain) return '***';
        return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
    }

    async function sendSensitiveActionCode(memberId, purpose) {
        const response = await fetch('/api/auth/sensitive-action/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ member_id: memberId, purpose })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || '인증코드 발송에 실패했습니다.');
        }
        return data;
    }

    async function verifySensitiveActionCode(email, code, purpose) {
        const response = await fetch('/api/auth/email/verify-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ email, code, purpose })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || '인증코드 확인에 실패했습니다.');
        }
        return data;
    }

    function ensureStyles() {
        let style = document.getElementById('sensitive-action-auth-styles');
        if (style) return;
        style = document.createElement('style');
        style.id = 'sensitive-action-auth-styles';
        style.textContent = `
            .sensitive-auth-modal {
                position: fixed; inset: 0; z-index: 10050;
                background: rgba(0,0,0,0.5);
                display: flex; align-items: flex-end; justify-content: center;
                padding: 0;
            }
            @media (min-width: 768px) {
                .sensitive-auth-modal { align-items: center; padding: 16px; }
            }
            .sensitive-auth-card {
                width: 100%; max-width: 420px; background: #fff;
                border-radius: 16px 16px 0 0; padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
                box-shadow: 0 -4px 24px rgba(0,0,0,0.15);
            }
            @media (min-width: 768px) {
                .sensitive-auth-card { border-radius: 12px; }
            }
            .sensitive-auth-card h3 { margin: 0 0 8px; font-size: 18px; color: #333; text-align: center; }
            .sensitive-auth-card p { margin: 0 0 16px; font-size: 14px; color: #555; line-height: 1.5; }
            .sensitive-auth-email {
                margin-bottom: 12px; padding: 10px 12px; background: #f8f9fa;
                border-radius: 8px; font-size: 14px; color: #333;
            }
            .sensitive-auth-row { display: flex; gap: 8px; margin-bottom: 12px; }
            .sensitive-auth-row input {
                flex: 1; min-height: 48px; padding: 12px; border: 1px solid #ddd;
                border-radius: 8px; font-size: 16px;
            }
            .sensitive-auth-btn {
                min-height: 48px; padding: 0 14px; border: none; border-radius: 8px;
                background: #6c757d; color: #fff; font-size: 14px; font-weight: 600;
                cursor: pointer; white-space: nowrap;
            }
            .sensitive-auth-btn.sent,
            .sensitive-auth-btn.verified { background: #28a745; }
            .sensitive-auth-btn.primary { background: #4A90E2; width: 100%; margin-top: 8px; }
            .sensitive-auth-btn.primary:disabled { background: #adb5bd; cursor: not-allowed; }
            .sensitive-auth-btn.ghost { background: #e9ecef; color: #333; width: 100%; margin-top: 8px; }
            .sensitive-auth-status { min-height: 18px; margin-bottom: 8px; font-size: 13px; color: #666; }
            .sensitive-auth-status.ok { color: #28a745; }
        `;
        document.head.appendChild(style);
    }

    function closeModal(overlay) {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }

    function promptSensitiveAction(options) {
        const purpose = options.purpose;
        const meta = PURPOSE_META[purpose] || {
            title: 'Gmail 인증',
            description: '등록된 Gmail로 인증코드를 받아 확인해주세요.',
            confirmMessage: '계속하시겠습니까?'
        };
        const user = getLoggedInUser();

        if (!user || !user.id || !user.name) {
            alert('로그인이 필요합니다.');
            return Promise.resolve(false);
        }

        if (purpose === 'delete_member' && global.RegioAdminMenu && !RegioAdminMenu.guardDeleteMemberAccess('회원 삭제')) {
            return Promise.resolve(false);
        }

        if (purpose === 'withdraw' && global.RegioAdminMenu && !RegioAdminMenu.guardSampleMemberRestrictedAction('탈단')) {
            return Promise.resolve(false);
        }

        if (!user.email) {
            alert('등록된 Gmail이 없습니다. 프로필수정에서 Gmail을 등록한 후 다시 시도해주세요.');
            return Promise.resolve(false);
        }

        ensureStyles();

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'sensitive-auth-modal';
            overlay.innerHTML = `
                <div class="sensitive-auth-card" role="dialog" aria-modal="true">
                    <h3>${meta.title}</h3>
                    <p>${meta.description}</p>
                    <div class="sensitive-auth-email">등록 Gmail: <strong id="sensitiveAuthEmailHint"></strong></div>
                    <div class="sensitive-auth-row">
                        <input type="text" id="sensitiveAuthCode" placeholder="인증코드 6자리" maxlength="6" inputmode="numeric" autocomplete="one-time-code">
                        <button type="button" class="sensitive-auth-btn" id="sensitiveAuthSendBtn">인증발송</button>
                    </div>
                    <div class="sensitive-auth-row">
                        <button type="button" class="sensitive-auth-btn" id="sensitiveAuthVerifyBtn" style="width:100%;">인증확인</button>
                    </div>
                    <p class="sensitive-auth-status" id="sensitiveAuthStatus"></p>
                    <button type="button" class="sensitive-auth-btn primary" id="sensitiveAuthContinueBtn" disabled>인증 후 계속</button>
                    <button type="button" class="sensitive-auth-btn ghost" id="sensitiveAuthCancelBtn">취소</button>
                </div>
            `;
            document.body.appendChild(overlay);

            const emailHint = overlay.querySelector('#sensitiveAuthEmailHint');
            const codeInput = overlay.querySelector('#sensitiveAuthCode');
            const sendBtn = overlay.querySelector('#sensitiveAuthSendBtn');
            const verifyBtn = overlay.querySelector('#sensitiveAuthVerifyBtn');
            const statusEl = overlay.querySelector('#sensitiveAuthStatus');
            const continueBtn = overlay.querySelector('#sensitiveAuthContinueBtn');
            const cancelBtn = overlay.querySelector('#sensitiveAuthCancelBtn');

            let memberEmail = String(user.email).trim().toLowerCase();
            let verificationToken = '';

            emailHint.textContent = maskEmail(memberEmail);

            sendBtn.addEventListener('click', async () => {
                sendBtn.disabled = true;
                try {
                    const data = await sendSensitiveActionCode(user.id, purpose);
                    if (data.email) {
                        memberEmail = String(data.email).trim().toLowerCase();
                        emailHint.textContent = data.emailHint || maskEmail(memberEmail);
                    }
                    verificationToken = '';
                    continueBtn.disabled = true;
                    verifyBtn.textContent = '인증확인';
                    verifyBtn.classList.remove('verified');
                    statusEl.classList.remove('ok');
                    statusEl.textContent = `${data.emailHint || maskEmail(memberEmail)}(으)로 인증코드를 발송했습니다.`;
                    if (data.devMode && data.devCode) {
                        statusEl.textContent += ` [개발모드 코드: ${data.devCode}]`;
                    }
                    sendBtn.textContent = '발송완료';
                    sendBtn.classList.add('sent');
                } catch (error) {
                    sendBtn.textContent = '인증발송';
                    sendBtn.classList.remove('sent');
                    alert(error.message);
                } finally {
                    sendBtn.disabled = false;
                }
            });

            verifyBtn.addEventListener('click', async () => {
                const code = codeInput.value.trim();
                if (!code) {
                    alert('인증코드를 입력해주세요.');
                    return;
                }
                verifyBtn.disabled = true;
                try {
                    const data = await verifySensitiveActionCode(memberEmail, code, purpose);
                    verificationToken = data.verification_token;
                    statusEl.textContent = 'Gmail 인증이 완료되었습니다.';
                    statusEl.classList.add('ok');
                    verifyBtn.textContent = '인증완료';
                    verifyBtn.classList.add('verified');
                    continueBtn.disabled = false;
                } catch (error) {
                    alert(error.message);
                } finally {
                    verifyBtn.disabled = false;
                }
            });

            continueBtn.addEventListener('click', () => {
                if (!verificationToken) {
                    alert('Gmail 인증을 먼저 완료해주세요.');
                    return;
                }
                storeSensitiveAuth(purpose, {
                    verification_token: verificationToken,
                    member_id: user.id,
                    email: memberEmail
                });
                closeModal(overlay);
                const confirmMessage = options.confirmMessage || meta.confirmMessage;
                if (confirmMessage && !confirm(confirmMessage)) {
                    clearSensitiveAuth(purpose);
                    resolve(false);
                    return;
                }
                if (typeof options.onVerified === 'function') {
                    options.onVerified(getStoredSensitiveAuth(purpose));
                }
                resolve(true);
            });

            cancelBtn.addEventListener('click', () => {
                closeModal(overlay);
                resolve(false);
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    closeModal(overlay);
                    resolve(false);
                }
            });
        });
    }

    function guardSensitiveActionPage(purpose, options) {
        const opts = options || {};
        const auth = getStoredSensitiveAuth(purpose);
        if (auth && auth.verification_token) {
            return auth;
        }
        alert(opts.message || 'Gmail 인증이 필요합니다. 메뉴에서 다시 시도해주세요.');
        window.location.href = opts.redirectUrl || 'index.html';
        return null;
    }

    function getAuthPayloadForApi(purpose) {
        const auth = getStoredSensitiveAuth(purpose);
        if (!auth) return null;
        return {
            email_verification_token: auth.verification_token,
            requester_member_id: auth.member_id
        };
    }

    async function executeWithdraw(auth) {
        const user = getLoggedInUser();
        const payload = auth || getStoredSensitiveAuth('withdraw');
        if (!user || !user.id) {
            alert('로그인이 필요합니다.');
            return false;
        }
        if (!payload || !payload.verification_token) {
            alert('Gmail 인증이 필요합니다.');
            return false;
        }

        try {
            const response = await fetch('/api/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: JSON.stringify({
                    member_id: user.id,
                    email_verification_token: payload.verification_token
                })
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || '탈단 처리에 실패했습니다.');
            }

            clearSensitiveAuth('withdraw');

            const updatedUser = { ...user, ...(data.user || {}), pr_name: null };
            const userInfoString = JSON.stringify(updatedUser);
            sessionStorage.setItem('userInfo', userInfoString);
            localStorage.setItem('userInfo', userInfoString);

            alert(data.message || '소속 Pr 명칭이 삭제되었습니다.');
            return true;
        } catch (error) {
            alert(error.message);
            return false;
        }
    }

    global.RegioSensitiveAuth = {
        PURPOSE_META,
        getLoggedInUser,
        getStoredSensitiveAuth,
        clearSensitiveAuth,
        promptSensitiveAction,
        guardSensitiveActionPage,
        getAuthPayloadForApi,
        executeWithdraw
    };
})(typeof window !== 'undefined' ? window : global);
