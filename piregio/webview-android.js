/**
 * Android WebView / Capacitor 대응
 * - 하드웨어 뒤로가기: 열린 모달 닫기 → history.back → (앱이면) 종료
 * - Android WebView UA 감지 + visual viewport 높이(--app-vh) 보정
 *   (100dvh + overflow:hidden 조합이 WebView에서 레이아웃 붕괴/빈 화면을 만들 수 있음)
 * 플러그인 미설치 시 조용히 no-op
 */
(function (global) {
    'use strict';

    function isNative() {
        try {
            const cap = global.Capacitor;
            if (!cap) return false;
            if (typeof cap.isNativePlatform === 'function') return !!cap.isNativePlatform();
            return String(cap.getPlatform && cap.getPlatform() || '').toLowerCase() === 'android';
        } catch (_) {
            return false;
        }
    }

    /** Chrome Custom Tab이 아닌 앱 내장 WebView (UA에 "; wv)" 포함) */
    function isAndroidWebViewUa() {
        try {
            const ua = String(global.navigator && global.navigator.userAgent || '');
            return /Android/i.test(ua) && /; wv\)/i.test(ua);
        } catch (_) {
            return false;
        }
    }

    function closeTopOverlay() {
        const selectors = [
            '.modal.show',
            '.modal[style*="display: block"]',
            '.modal:not([hidden])',
            '.council-hub-modal',
            '.profile-edit-modal',
            '.sensitive-auth-modal',
            '#sampleMemberRosterModal',
            '#sampleAnnualActivityModal',
            '#testExportViewModal',
            '#regioHelpModal'
        ];
        for (let i = 0; i < selectors.length; i++) {
            const nodes = document.querySelectorAll(selectors[i]);
            if (!nodes.length) continue;
            const el = nodes[nodes.length - 1];
            const style = global.getComputedStyle ? getComputedStyle(el) : null;
            if (style && style.display === 'none') continue;
            const closer = el.querySelector(
                '.close, [data-dismiss], [id$="CloseBtn"], [id$="Close"], .regio-help-close'
            );
            if (closer && typeof closer.click === 'function') {
                closer.click();
                return true;
            }
            if (el.parentNode) {
                el.parentNode.removeChild(el);
                return true;
            }
        }
        return false;
    }

    function bindAndroidBackButton() {
        if (!isNative()) return;
        const cap = global.Capacitor;
        const App = (cap.Plugins && cap.Plugins.App)
            || (cap.PluginRegistry && cap.PluginRegistry.App);
        if (!App || typeof App.addListener !== 'function') return;

        App.addListener('backButton', function (event) {
            if (closeTopOverlay()) return;
            if (event && event.canGoBack) {
                global.history.back();
                return;
            }
            if (global.history.length > 1) {
                global.history.back();
                return;
            }
            if (typeof App.exitApp === 'function') App.exitApp();
        });
    }

    function applyWebViewDocumentHints() {
        try {
            const root = document.documentElement;
            const androidWv = isAndroidWebViewUa() || isNative();
            if (androidWv || /Android/i.test(String(global.navigator && global.navigator.userAgent || ''))) {
                root.classList.add('regio-webview');
            }
            if (androidWv) {
                root.classList.add('regio-native-android');
            }
        } catch (_) {
            /* ignore */
        }
    }

    /**
     * WebView에서 100dvh가 0/잘못 계산되면 flex 레이아웃이 통째로 사라질 수 있다.
     * innerHeight 기준으로 --app-vh 를 직접 넣는다.
     */
    function bindViewportHeightVar() {
        const root = document.documentElement;
        if (!root || !root.classList.contains('regio-webview')) return;

        let raf = 0;
        const apply = function () {
            raf = 0;
            try {
                const vv = global.visualViewport;
                const h = Math.max(
                    1,
                    Math.round((vv && vv.height) || global.innerHeight || root.clientHeight || 0)
                );
                root.style.setProperty('--app-vh', h + 'px');
            } catch (_) {
                /* ignore */
            }
        };
        const schedule = function () {
            if (raf) return;
            raf = global.requestAnimationFrame ? requestAnimationFrame(apply) : (setTimeout(apply, 16), 1);
        };

        apply();
        global.addEventListener('resize', schedule, { passive: true });
        global.addEventListener('orientationchange', schedule, { passive: true });
        if (global.visualViewport) {
            global.visualViewport.addEventListener('resize', schedule, { passive: true });
            global.visualViewport.addEventListener('scroll', schedule, { passive: true });
        }
        // 첫 레이아웃·폰트 로드 후 한 번 더
        setTimeout(apply, 50);
        setTimeout(apply, 300);
    }

    function init() {
        applyWebViewDocumentHints();
        bindViewportHeightVar();
        bindAndroidBackButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.RegioWebViewAndroid = {
        isNative,
        isAndroidWebViewUa,
        closeTopOverlay,
        init
    };
})(typeof window !== 'undefined' ? window : global);
