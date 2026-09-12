/**
 * 회원 세나뚜스 지역 기준 달력 날짜
 * - 대부분(서울·광주·대구·세계): Asia/Seoul
 * - 해외 세나뚜스: 해당 지역 IANA 타임존
 * - 기기(AVD) 타임존과 무관하게 '오늘'을 맞춤
 */
(function (global) {
    'use strict';

    const DEFAULT_TZ = 'Asia/Seoul';

    /** 회원가입 세나뚜스 선택값 → IANA timeZone */
    const SENATUS_TIMEZONE = {
        '서울': 'Asia/Seoul',
        '광주': 'Asia/Seoul',
        '대구': 'Asia/Seoul',
        '세계': 'Asia/Seoul',
        'LA': 'America/Los_Angeles',
        '뉴욕': 'America/New_York',
        '필라델피아': 'America/New_York',
        '토론토': 'America/Toronto',
        '몬트리올': 'America/Toronto',
        '브라질': 'America/Sao_Paulo',
        '아르헨': 'America/Argentina/Buenos_Aires',
        '파리': 'Europe/Paris',
        '마드리드': 'Europe/Madrid',
        '바르셀로나': 'Europe/Madrid',
        '빌바오': 'Europe/Madrid'
    };

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function normalizeSenatusName(name) {
        return String(name || '').trim();
    }

    function getLoggedInUser() {
        try {
            const raw = global.sessionStorage?.getItem('userInfo')
                || global.localStorage?.getItem('userInfo');
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (_) {
            return null;
        }
    }

    function resolveSenatusName(explicit) {
        if (explicit != null && String(explicit).trim() !== '') {
            return normalizeSenatusName(explicit);
        }
        const user = getLoggedInUser();
        return normalizeSenatusName(user && user.senatus_name);
    }

    function resolveTimeZone(senatusOrOptions) {
        let senatus = '';
        if (senatusOrOptions && typeof senatusOrOptions === 'object' && !Array.isArray(senatusOrOptions)) {
            senatus = resolveSenatusName(senatusOrOptions.senatus || senatusOrOptions.senatus_name);
        } else {
            senatus = resolveSenatusName(senatusOrOptions);
        }
        if (senatus && SENATUS_TIMEZONE[senatus]) {
            return SENATUS_TIMEZONE[senatus];
        }
        // 부분 일치(예: "서울세나뚜스") 대비
        const key = Object.keys(SENATUS_TIMEZONE).find((k) => senatus.includes(k));
        if (key) return SENATUS_TIMEZONE[key];
        return DEFAULT_TZ;
    }

    /**
     * @param {Date} [date]
     * @param {string|{senatus?: string, senatus_name?: string, timeZone?: string}} [options]
     * @returns {{ y: number, m: number, d: number, timeZone: string, senatus: string }}
     */
    function getKoreaYmdParts(date, options) {
        const d = date instanceof Date ? date : new Date();
        const senatus = (options && typeof options === 'object')
            ? resolveSenatusName(options.senatus || options.senatus_name)
            : resolveSenatusName(options);
        const timeZone = (options && typeof options === 'object' && options.timeZone)
            ? String(options.timeZone)
            : resolveTimeZone(senatus || undefined);

        try {
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).formatToParts(d);
            const map = {};
            parts.forEach((p) => {
                if (p.type !== 'literal') map[p.type] = p.value;
            });
            return {
                y: Number(map.year),
                m: Number(map.month),
                d: Number(map.day),
                timeZone,
                senatus: senatus || ''
            };
        } catch (_) {
            // Intl 실패 시: 한국(+9) 폴백
            const k = new Date(d.getTime() + (9 * 60 * 60 * 1000));
            return {
                y: k.getUTCFullYear(),
                m: k.getUTCMonth() + 1,
                d: k.getUTCDate(),
                timeZone: DEFAULT_TZ,
                senatus: senatus || ''
            };
        }
    }

    /** YYYY-MM-DD (세나뚜스 지역 달력) */
    function formatKoreaDateString(date, options) {
        const p = getKoreaYmdParts(date || new Date(), options);
        return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
    }

    function todayKoreaYmd(options) {
        return formatKoreaDateString(new Date(), options);
    }

    /** 별칭: 세나뚜스 기준 오늘 */
    function todayMemberYmd(options) {
        return todayKoreaYmd(options);
    }

    global.RegioKoreaDate = {
        DEFAULT_TZ,
        SENATUS_TIMEZONE,
        resolveSenatusName,
        resolveTimeZone,
        getKoreaYmdParts,
        formatKoreaDateString,
        todayKoreaYmd,
        todayMemberYmd
    };
})(typeof window !== 'undefined' ? window : global);
