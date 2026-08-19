(function (global) {
    'use strict';

    let authConfig = null;
    let googleInitialized = false;

    function isGmailAddress(email) {
        const normalized = String(email || '').trim().toLowerCase();
        return /^[^\s@]+@(gmail|googlemail)\.com$/.test(normalized);
    }

    async function loadAuthConfig() {
        if (authConfig) return authConfig;
        try {
            const response = await fetch('/api/auth/config');
            authConfig = await response.json();
        } catch (error) {
            authConfig = { googleLoginEnabled: false, emailAuthEnabled: true };
        }
        return authConfig;
    }

    async function sendEmailCode(email, purpose) {
        const response = await fetch('/api/auth/email/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ email, purpose })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || '인증코드 발송에 실패했습니다.');
        }
        return data;
    }

    async function verifyEmailCode(email, code, purpose) {
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

    function storeLoginSuccess(user) {
        const userInfoString = JSON.stringify(user);
        sessionStorage.setItem('userInfo', userInfoString);
        localStorage.setItem('userInfo', userInfoString);
    }

    function getStoredUser(preferSessionOnly) {
        try {
            const raw = preferSessionOnly
                ? sessionStorage.getItem('userInfo')
                : (sessionStorage.getItem('userInfo') || localStorage.getItem('userInfo'));
            if (!raw) return null;
            const user = JSON.parse(raw);
            if (user && (user.id || user.name)) return user;
            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * 로그인 세션의 소속(세나뚜스 등)을 DB 회원 정보로 갱신.
     * localStorage에 남은 옛 세나뚜스(예: 서울)가 양식 분기를 가로채는 것을 방지.
     */
    async function refreshLoggedInUserFromServer() {
        const user = getStoredUser(false);
        if (!user || !user.id) return user;
        try {
            const response = await fetch(`/api/members/${encodeURIComponent(user.id)}`);
            if (!response.ok) return user;
            const row = await response.json();
            if (!row || !row.id) return user;

            const next = {
                ...user,
                name: row.name != null ? row.name : user.name,
                baptism_name: row.baptism_name != null ? row.baptism_name : user.baptism_name,
                church_name: row.church_name != null ? row.church_name : user.church_name,
                curia_name: row.curia_name != null ? row.curia_name : user.curia_name,
                comitia_name: row.comitia_name != null ? row.comitia_name : user.comitia_name,
                regia_name: row.regia_name != null ? row.regia_name : user.regia_name,
                senatus_name: row.senatus_name != null ? row.senatus_name : user.senatus_name,
                pr_name: row.pr_name != null ? row.pr_name : user.pr_name,
                pr_type: row.pr_type != null ? row.pr_type : user.pr_type,
                position: row.position != null ? row.position : user.position,
                gender: row.gender != null ? row.gender : user.gender,
                curia_officer: row.curia_officer != null ? row.curia_officer : user.curia_officer,
                email: row.email != null ? row.email : user.email
            };
            storeLoginSuccess(next);
            return next;
        } catch (error) {
            console.warn('로그인 소속 갱신 실패:', error);
            return user;
        }
    }

    function isLoggedIn() {
        return !!getStoredUser(false);
    }

    /** 이번 브라우저 세션에서 로그인한 경우만 true (로그인 화면 햄버거용) */
    function hasActiveSession() {
        return !!getStoredUser(true);
    }

    function ensureHamburgerVisibilityStyles() {
        if (document.getElementById('regio-hamburger-visibility-styles')) return;
        const style = document.createElement('style');
        style.id = 'regio-hamburger-visibility-styles';
        style.textContent = `
            .hamburger-menu { display: none !important; }
            .hamburger-menu.is-visible { display: flex !important; }
            .hamburger-menu[hidden] { display: none !important; }
        `;
        document.head.appendChild(style);
    }

    /**
     * @param {object} [options]
     * @param {boolean} [options.requireActiveSession] 로그인 페이지: sessionStorage만 인정
     * @param {boolean} [options.visible] 명시적 true/false (활동 페이지용)
     */
    function updateHamburgerMenuVisibility(options) {
        ensureHamburgerVisibilityStyles();
        const menu = document.getElementById('hamburgerMenu');
        if (!menu) return false;

        let loggedIn;
        if (options && typeof options.visible === 'boolean') {
            loggedIn = options.visible;
        } else if (options && options.requireActiveSession) {
            loggedIn = hasActiveSession();
        } else {
            loggedIn = isLoggedIn();
        }

        menu.classList.toggle('is-visible', loggedIn);
        if (loggedIn) {
            menu.removeAttribute('hidden');
        } else {
            menu.setAttribute('hidden', '');
            const dropdown = document.getElementById('dropdownMenu');
            if (dropdown) dropdown.classList.remove('show');
        }

        if (global.RegioAdminMenu && typeof RegioAdminMenu.applyCategoryAdminMenuVisibility === 'function') {
            RegioAdminMenu.applyCategoryAdminMenuVisibility();
        }
        return loggedIn;
    }

    function bindHamburgerClickGuard() {
        const menu = document.getElementById('hamburgerMenu');
        const dropdown = document.getElementById('dropdownMenu');
        if (!menu || menu.dataset.regioHbGuard === '1') return;
        menu.dataset.regioHbGuard = '1';
        menu.addEventListener('click', (e) => {
            if (!menu.classList.contains('is-visible') || menu.hasAttribute('hidden')) {
                e.preventDefault();
                e.stopPropagation();
                if (dropdown) dropdown.classList.remove('show');
            }
        }, true);
    }

    async function loginWithGoogleCredential(credential) {
        const response = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ credential })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Google 로그인에 실패했습니다.');
        }
        return data;
    }

    function ensureAuthStyles() {
        let style = document.getElementById('auth-ui-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'auth-ui-styles';
            document.head.appendChild(style);
        }
        style.textContent = `
            .google-signin-wrap { margin: 8px 0 12px; display: flex; justify-content: center; min-height: 0; }
            .google-signin-wrap:empty { display: none; margin: 0; }
            .email-verify-row { display: flex; gap: 8px; margin-bottom: 12px; }
            .email-verify-row input { flex: 1; margin-bottom: 0; }
            .email-verify-btn { flex-shrink: 0; padding: 0 12px; border: none; border-radius: 6px; background: #6c757d; color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
            .email-verify-btn:hover { background: #5a6268; }
            .email-verify-btn.sent,
            .email-verify-btn.verified { background: #28a745; cursor: default; }
            .email-verify-btn.sent:hover,
            .email-verify-btn.verified:hover { background: #28a745; }
            .email-verify-status { margin: -6px 0 12px; font-size: 12px; color: #666; }
            .email-verify-status.ok { color: #28a745; }
            .find-code-row { display: none; }
            .find-code-row.show { display: flex; gap: 8px; margin-bottom: 12px; }
            .find-code-row input { flex: 1; }
        `;
    }

    function setupEmailVerificationUI(options) {
        ensureAuthStyles();
        const emailInput = options.emailInput;
        const codeInput = options.codeInput;
        const sendBtn = options.sendBtn;
        const verifyBtn = options.verifyBtn;
        const statusEl = options.statusEl;
        const purpose = options.purpose;
        const onVerified = options.onVerified;

        let verificationToken = '';

        function resetSendState() {
            sendBtn.textContent = '인증발송';
            sendBtn.classList.remove('sent');
        }

        function resetVerifyState() {
            verificationToken = '';
            verifyBtn.textContent = '인증확인';
            verifyBtn.classList.remove('verified');
            statusEl.classList.remove('ok');
        }

        async function handleSend() {
            const email = emailInput.value.trim();
            if (!isGmailAddress(email)) {
                alert('Gmail 주소를 입력해주세요.');
                return;
            }
            sendBtn.disabled = true;
            try {
                const data = await sendEmailCode(email, purpose);
                resetVerifyState();
                statusEl.textContent = `${data.emailHint}(으)로 인증코드를 발송했습니다.`;
                if (data.devMode && data.devCode) {
                    statusEl.textContent += ` [개발모드 코드: ${data.devCode}]`;
                }
                sendBtn.textContent = '발송완료';
                sendBtn.classList.add('sent');
            } catch (error) {
                resetSendState();
                alert(error.message);
            } finally {
                sendBtn.disabled = false;
            }
        }

        async function handleVerify() {
            const email = emailInput.value.trim();
            const code = codeInput.value.trim();
            if (!email || !code) {
                alert('Gmail과 인증코드를 입력해주세요.');
                return;
            }
            verifyBtn.disabled = true;
            try {
                const data = await verifyEmailCode(email, code, purpose);
                verificationToken = data.verification_token;
                statusEl.textContent = 'Gmail 인증이 완료되었습니다.';
                statusEl.classList.add('ok');
                verifyBtn.textContent = '인증완료';
                verifyBtn.classList.add('verified');
                if (typeof onVerified === 'function') {
                    onVerified({ email, verification_token: verificationToken });
                }
            } catch (error) {
                alert(error.message);
            } finally {
                verifyBtn.disabled = false;
            }
        }

        sendBtn.addEventListener('click', handleSend);
        verifyBtn.addEventListener('click', handleVerify);
        emailInput.addEventListener('input', () => {
            resetSendState();
            resetVerifyState();
            statusEl.textContent = purpose === 'register'
                ? '회원가입 전 Gmail 인증이 필요합니다.'
                : '';
        });
        codeInput.addEventListener('input', resetVerifyState);

        return {
            getVerificationToken: () => verificationToken,
            getEmail: () => emailInput.value.trim(),
            isVerified: () => !!verificationToken,
            reset() {
                emailInput.value = '';
                codeInput.value = '';
                resetSendState();
                resetVerifyState();
                statusEl.textContent = purpose === 'register'
                    ? '회원가입 전 Gmail 인증이 필요합니다.'
                    : '';
                sendBtn.disabled = false;
                verifyBtn.disabled = false;
            }
        };
    }

    async function initGoogleSignIn(container, onSuccess) {
        ensureAuthStyles();
        const config = await loadAuthConfig();
        if (!config.googleLoginEnabled || !config.googleClientId || !container) {
            if (container) container.innerHTML = '';
            return;
        }

        function renderButton() {
            if (!global.google || !global.google.accounts || !global.google.accounts.id) return;
            if (googleInitialized) return;
            global.google.accounts.id.initialize({
                client_id: config.googleClientId,
                locale: 'ko',
                callback: async (response) => {
                    try {
                        const data = await loginWithGoogleCredential(response.credential);
                        if (typeof onSuccess === 'function') {
                            onSuccess(data.user);
                        }
                    } catch (error) {
                        alert(error.message);
                    }
                }
            });
            global.google.accounts.id.renderButton(container, {
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                locale: 'ko',
                width: Math.min(container.offsetWidth || 320, 360)
            });
            googleInitialized = true;
        }

        if (global.google && global.google.accounts && global.google.accounts.id) {
            renderButton();
            return;
        }

        const existing = document.getElementById('google-gsi-script');
        if (existing) {
            existing.addEventListener('load', renderButton);
            return;
        }

        const script = document.createElement('script');
        script.id = 'google-gsi-script';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = renderButton;
        document.head.appendChild(script);
    }

    global.RegioAuth = {
        isGmailAddress,
        loadAuthConfig,
        sendEmailCode,
        verifyEmailCode,
        loginWithGoogleCredential,
        storeLoginSuccess,
        getStoredUser,
        refreshLoggedInUserFromServer,
        isLoggedIn,
        hasActiveSession,
        updateHamburgerMenuVisibility,
        bindHamburgerClickGuard,
        ensureHamburgerVisibilityStyles,
        setupEmailVerificationUI,
        initGoogleSignIn
    };
})(typeof window !== 'undefined' ? window : global);
