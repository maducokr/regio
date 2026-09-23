/**
 * Android WebView / Capacitor 대응
 * - 하드웨어 뒤로가기: 열린 모달 닫기 → history.back → (앱이면) 종료
 * - Android WebView UA 감지 + visual viewport 높이(--app-vh) / 폭(--app-vw) 보정
 *   (100dvh + overflow:hidden 조합이 WebView에서 레이아웃 붕괴/빈 화면을 만들 수 있음)
 * - 폴드폰(접기/펼치기) 리사이즈·세그먼트·지연 재측정
 * 플러그인 미설치 시 조용히 no-op
 */
(function (global) {
    'use strict';

    var foldTimers = [];
    var lastViewportSig = '';

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

            try {
                if (typeof global.handleLoginBack === 'function' && global.RegioAppNav && global.RegioAppNav.isLoginPage()) {
                    const findPanel = document.getElementById('findPasswordPanel');
                    const help = document.getElementById('regioHelpModal');
                    const modal = document.querySelector('.modal');
                    if ((findPanel && !findPanel.classList.contains('panel-hidden')) || help || modal) {
                        global.handleLoginBack();
                        return;
                    }
                }
            } catch (_) { /* ignore */ }

            try {
                if (global.RegioAppNav && !global.RegioAppNav.isLoginPage()) {
                    global.RegioAppNav.goHome();
                    return;
                }
                if (typeof global.goHome === 'function' && !(global.RegioAppNav && global.RegioAppNav.isLoginPage())) {
                    global.goHome();
                    return;
                }
            } catch (_) { /* ignore */ }

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

    function getViewportSize() {
        const vv = global.visualViewport;
        const w = Math.max(
            1,
            Math.round((vv && vv.width) || global.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 0)
        );
        const h = Math.max(
            1,
            Math.round((vv && vv.height) || global.innerHeight || (document.documentElement && document.documentElement.clientHeight) || 0)
        );
        return { w: w, h: h };
    }

    /** Window Segments / CSS spanning (듀얼·폴드 힌지) */
    function getWindowSegments() {
        try {
            if (typeof global.getWindowSegments === 'function') {
                return global.getWindowSegments() || [];
            }
            if (global.visualViewport && typeof global.visualViewport.segments !== 'undefined') {
                return global.visualViewport.segments || [];
            }
        } catch (_) { /* ignore */ }
        return [];
    }

    function isSpanningDualScreen() {
        try {
            if (global.matchMedia) {
                if (global.matchMedia('(spanning: single-fold-vertical)').matches) return 'vertical';
                if (global.matchMedia('(spanning: single-fold-horizontal)').matches) return 'horizontal';
            }
        } catch (_) { /* ignore */ }
        const segs = getWindowSegments();
        if (segs && segs.length >= 2) return 'segments';
        return '';
    }

    /**
     * 폴드 추정:
     * - spanning/segments 있으면 폴드
     * - 짧은 변 ≥ 560 또는 긴 변 ≥ 900 이면서 비율이 폰·태블릿 경계면 펼침으로 취급
     * - 화면 대각/면적이 접힘↔펼침 전환에 민감하도록 클래스만 부여
     */
    function classifyFoldState(size) {
        const w = size.w;
        const h = size.h;
        const shortSide = Math.min(w, h);
        const longSide = Math.max(w, h);
        const ratio = longSide / Math.max(1, shortSide);
        const spanning = isSpanningDualScreen();
        const segs = getWindowSegments();

        let foldable = false;
        let open = false;

        if (spanning || (segs && segs.length >= 2)) {
            foldable = true;
            open = true;
        } else {
            // AVD/실기기 폴드: 펼침 시 짧은 변이 크게 증가 (대략 태블릿 폭)
            if (shortSide >= 560 || (w >= 700 && h >= 500) || (h >= 700 && w >= 500)) {
                foldable = true;
                open = true;
            } else if (shortSide <= 420 && longSide >= 700 && ratio >= 1.6) {
                // 접힌 커버 디스플레이 형태
                foldable = true;
                open = false;
            }
        }

        // UA 힌트 (있으면)
        try {
            const ua = String(global.navigator && global.navigator.userAgent || '');
            if (/SM-F9|SM-F7|Pixel Fold|Fold/i.test(ua)) foldable = true;
        } catch (_) { /* ignore */ }

        return {
            foldable: foldable,
            open: open,
            spanning: spanning || '',
            segments: segs.length,
            shortSide: shortSide,
            longSide: longSide,
            ratio: ratio
        };
    }

    function applyFoldClasses(root, state) {
        if (!root) return;
        root.classList.toggle('regio-foldable', !!state.foldable);
        root.classList.toggle('regio-fold-open', !!(state.foldable && state.open));
        root.classList.toggle('regio-fold-closed', !!(state.foldable && !state.open));
        root.classList.toggle('regio-fold-spanning', !!state.spanning);
        root.classList.toggle('regio-fold-landscape', state.shortSide > 0 && state.longSide > 0 && (getViewportSize().w > getViewportSize().h));
        root.dataset.foldSpanning = state.spanning || '';
        root.dataset.foldSegments = String(state.segments || 0);
    }

    function dispatchViewportEvent(detail) {
        try {
            if (typeof global.CustomEvent === 'function') {
                global.dispatchEvent(new CustomEvent('regio:viewportchange', { detail: detail }));
            }
        } catch (_) { /* ignore */ }
    }

    function clearFoldTimers() {
        while (foldTimers.length) {
            const id = foldTimers.pop();
            try { clearTimeout(id); } catch (_) { /* ignore */ }
        }
    }

    /**
     * WebView에서 100dvh가 0/잘못 계산되면 flex 레이아웃이 통째로 사라질 수 있다.
     * 폴드 접기/펼치기 직후 크기가 여러 번 바뀌므로 --app-vh/--app-vw 를 반복 보정한다.
     */
    function bindViewportHeightVar() {
        const root = document.documentElement;
        if (!root || !root.classList.contains('regio-webview')) return;

        let raf = 0;
        const apply = function (reason) {
            raf = 0;
            try {
                const size = getViewportSize();
                root.style.setProperty('--app-vh', size.h + 'px');
                root.style.setProperty('--app-vw', size.w + 'px');

                const fold = classifyFoldState(size);
                applyFoldClasses(root, fold);

                const sig = [size.w, size.h, fold.foldable ? 1 : 0, fold.open ? 1 : 0, fold.spanning || '', fold.segments].join('x');
                if (sig !== lastViewportSig) {
                    lastViewportSig = sig;
                    dispatchViewportEvent({
                        width: size.w,
                        height: size.h,
                        foldable: fold.foldable,
                        foldOpen: fold.open,
                        spanning: fold.spanning,
                        segments: fold.segments,
                        reason: reason || 'apply'
                    });
                }
            } catch (_) {
                /* ignore */
            }
        };

        const schedule = function (reason) {
            if (raf) return;
            raf = global.requestAnimationFrame
                ? requestAnimationFrame(function () { apply(reason); })
                : (setTimeout(function () { apply(reason); }, 16), 1);
        };

        /** 폴드 애니메이션(약 300~600ms) 동안 여러 번 재측정 */
        const scheduleFoldSettle = function (reason) {
            schedule(reason || 'fold');
            clearFoldTimers();
            [50, 120, 250, 400, 650, 1000].forEach(function (ms) {
                foldTimers.push(setTimeout(function () {
                    apply('fold-settle-' + ms);
                }, ms));
            });
        };

        apply('init');
        global.addEventListener('resize', function () { scheduleFoldSettle('resize'); }, { passive: true });
        global.addEventListener('orientationchange', function () { scheduleFoldSettle('orientation'); }, { passive: true });
        if (global.visualViewport) {
            global.visualViewport.addEventListener('resize', function () { schedule('vv-resize'); }, { passive: true });
            global.visualViewport.addEventListener('scroll', function () { schedule('vv-scroll'); }, { passive: true });
        }

        // Screen Orientation API
        try {
            const so = global.screen && global.screen.orientation;
            if (so && typeof so.addEventListener === 'function') {
                so.addEventListener('change', function () { scheduleFoldSettle('screen-orientation'); });
            }
        } catch (_) { /* ignore */ }

        // spanning 미디어 쿼리 변화 (지원 기기)
        try {
            if (global.matchMedia) {
                ['(spanning: single-fold-vertical)', '(spanning: single-fold-horizontal)'].forEach(function (q) {
                    const mql = global.matchMedia(q);
                    const onChange = function () { scheduleFoldSettle('spanning'); };
                    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onChange);
                    else if (typeof mql.addListener === 'function') mql.addListener(onChange);
                });
            }
        } catch (_) { /* ignore */ }

        // 페이지 표시 복귀(폴드 후 탭 전환 등)
        global.addEventListener('pageshow', function () { scheduleFoldSettle('pageshow'); }, { passive: true });
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) scheduleFoldSettle('visible');
        });

        setTimeout(function () { apply('boot-50'); }, 50);
        setTimeout(function () { apply('boot-300'); }, 300);
    }

    function refreshViewport() {
        try {
            const root = document.documentElement;
            if (!root) return;
            const size = getViewportSize();
            root.style.setProperty('--app-vh', size.h + 'px');
            root.style.setProperty('--app-vw', size.w + 'px');
            applyFoldClasses(root, classifyFoldState(size));
        } catch (_) { /* ignore */ }
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
        isNative: isNative,
        isAndroidWebViewUa: isAndroidWebViewUa,
        closeTopOverlay: closeTopOverlay,
        refreshViewport: refreshViewport,
        getViewportSize: getViewportSize,
        classifyFoldState: classifyFoldState,
        init: init
    };
})(typeof window !== 'undefined' ? window : global);
