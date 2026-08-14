/**
 * Pi Network 백엔드 API 연결 설정
 * 배포 시 window.PIREGIO_API_BASE 를 Pi 백엔드 URL로 설정하세요.
 *
 * 예) index.html <head> 최상단:
 * <script>window.PIREGIO_API_BASE = 'https://your-pi-backend.example.com';</script>
 * <script src="api-config.js"></script>
 */
(function (global) {
    'use strict';

    // Deploy(실서비스) 패키지 기본값 — 로컬 모의와 혼동 방지
    // 로컬에서 piregio를 모의로 쓰려면 index에서 REGIO_APP_MODE='local' 로 덮어쓰세요.
    if (!global.REGIO_APP_MODE) {
        global.REGIO_APP_MODE = 'deploy';
    }

    // Pi Network 백엔드 기본 URL (배포 환경에 맞게 변경)
    const DEFAULT_API_BASE = '';

    function getApiBase() {
        const base = String(global.PIREGIO_API_BASE ?? DEFAULT_API_BASE).trim();
        return base.replace(/\/+$/, '');
    }

    function resolveApiUrl(input) {
        const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
        if (!url || !url.startsWith('/api')) {
            return url;
        }
        const apiBase = getApiBase();
        if (!apiBase) {
            return url;
        }
        return `${apiBase}${url}`;
    }

    const originalFetch = global.fetch.bind(global);

    global.fetch = function patchedFetch(input, init) {
        const resolved = resolveApiUrl(input);
        if (typeof input === 'string') {
            return originalFetch(resolved, init);
        }
        if (input instanceof Request) {
            return originalFetch(new Request(resolved, input), init);
        }
        return originalFetch(resolved, init);
    };

    global.PiregioApi = {
        getApiBase,
        resolveApiUrl,
        fetch: global.fetch
    };
})(typeof window !== 'undefined' ? window : global);
