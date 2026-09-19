/**
 * 공통 화면 이동 / BACK 처리 (Android WebView 포함)
 * - 헤더 ← : 로그인 화면으로 (skipAutoLogin)
 * - 로그인 화면: 비번찾기·모달 닫기(handleLoginBack)
 * - 하드웨어 BACK과 동일 정책
 */
(function (global) {
    'use strict';

    function isLoginPage() {
        try {
            const path = String((global.location && global.location.pathname) || '').toLowerCase();
            return path.endsWith('/') || path.endsWith('/index.html') || path.endsWith('index.html') || path === '';
        } catch (_) {
            return false;
        }
    }

    function closeAnyOverlay() {
        if (global.RegioWebViewAndroid && typeof global.RegioWebViewAndroid.closeTopOverlay === 'function') {
            return !!global.RegioWebViewAndroid.closeTopOverlay();
        }
        const selectors = [
            '#regioHelpModal',
            '.modal.registration-modal',
            '.council-hub-modal',
            '.profile-edit-modal',
            '.sensitive-auth-modal',
            '.modal'
        ];
        for (let i = 0; i < selectors.length; i++) {
            const el = document.querySelector(selectors[i]);
            if (!el) continue;
            const style = global.getComputedStyle ? getComputedStyle(el) : null;
            if (style && style.display === 'none') continue;
            if (el.parentNode) {
                el.parentNode.removeChild(el);
                return true;
            }
        }
        return false;
    }

    function goHome() {
        try {
            sessionStorage.setItem('skipAutoLogin', 'true');
        } catch (_) { /* ignore */ }
        global.location.href = 'index.html';
    }

    function goBackOrHome() {
        if (closeAnyOverlay()) return;

        if (isLoginPage()) {
            if (typeof global.handleLoginBack === 'function') {
                global.handleLoginBack();
                return;
            }
            return;
        }

        goHome();
    }

    function bindBackButtons(root) {
        const scope = root || document;
        const nodes = scope.querySelectorAll('.back-button, [data-nav="back"], [data-action="go-home"]');
        nodes.forEach((btn) => {
            if (btn.dataset.regioBackBound === '1') return;
            btn.dataset.regioBackBound = '1';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                goBackOrHome();
            }, true);
        });
    }

    function init() {
        bindBackButtons(document);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.goHome = goHome;
    global.goBack = goBackOrHome;
    global.goBackOrHome = goBackOrHome;
    global.RegioAppNav = {
        goHome,
        goBack: goBackOrHome,
        goBackOrHome,
        bindBackButtons,
        isLoginPage,
        closeAnyOverlay
    };
})(typeof window !== 'undefined' ? window : global);
