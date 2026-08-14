/**
 * Regio 앱 실행 모드: local(모의/테스트) vs deploy(실서비스)
 *
 * 우선순위:
 * 1) window.REGIO_APP_MODE = 'local' | 'deploy' (명시)
 * 2) Capacitor 네이티브 앱 → deploy
 * 3) PIREGIO_API_BASE 가 원격 URL → deploy
 * 4) hostname 이 localhost/127.0.0.1 → local
 * 5) 그 외 → deploy
 */
(function (global) {
    'use strict';

    function normalizeMode(value) {
        const v = String(value || '').trim().toLowerCase();
        if (v === 'local' || v === 'dev' || v === 'test' || v === 'mock') return 'local';
        if (v === 'deploy' || v === 'production' || v === 'prod') return 'deploy';
        return '';
    }

    function isCapacitorNative() {
        try {
            const cap = global.Capacitor;
            if (!cap) return false;
            if (typeof cap.isNativePlatform === 'function') return !!cap.isNativePlatform();
            return String(cap.getPlatform && cap.getPlatform() || '').toLowerCase() !== 'web';
        } catch (_) {
            return false;
        }
    }

    function hasRemoteApiBase() {
        const base = String(global.PIREGIO_API_BASE || '').trim().toLowerCase();
        if (!base) return false;
        if (base.indexOf('localhost') >= 0 || base.indexOf('127.0.0.1') >= 0) return false;
        return /^https?:\/\//.test(base);
    }

    function isLocalHostname() {
        try {
            const host = String((global.location && global.location.hostname) || '').toLowerCase();
            return host === 'localhost'
                || host === '127.0.0.1'
                || host === '0.0.0.0'
                || host === ''
                || host.endsWith('.local');
        } catch (_) {
            return false;
        }
    }

    function detectMode() {
        const forced = normalizeMode(global.REGIO_APP_MODE);
        if (forced) return forced;
        if (isCapacitorNative()) return 'deploy';
        if (hasRemoteApiBase()) return 'deploy';
        if (isLocalHostname()) return 'local';
        return 'deploy';
    }

    function getMode() {
        return detectMode();
    }

    function isLocal() {
        return getMode() === 'local';
    }

    function isDeploy() {
        return getMode() === 'deploy';
    }

    global.RegioAppMode = {
        getMode,
        isLocal,
        isDeploy,
        detectMode,
        isCapacitorNative,
        isLocalHostname
    };
})(typeof window !== 'undefined' ? window : global);
