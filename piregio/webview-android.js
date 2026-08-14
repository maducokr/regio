/**
 * Android WebView / Capacitor 대응
 * - 하드웨어 뒤로가기: 열린 모달 닫기 → history.back → (앱이면) 종료
 * - 네이티브 감지 헬퍼
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
            document.documentElement.classList.add('regio-webview');
            if (isNative()) document.documentElement.classList.add('regio-native-android');
        } catch (_) {
            /* ignore */
        }
    }

    function init() {
        applyWebViewDocumentHints();
        bindAndroidBackButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.RegioWebViewAndroid = {
        isNative,
        closeTopOverlay,
        init
    };
})(typeof window !== 'undefined' ? window : global);
