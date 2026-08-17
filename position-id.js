(function (global) {
    'use strict';

    const POSITION_ITEMS = [
        { code: '1', label: '단장', prefix: 'G1' },
        { code: '2', label: '부단장', prefix: 'G2' },
        { code: '3', label: '서기', prefix: 'G3' },
        { code: '4', label: '회계', prefix: 'G4' },
        { code: '5', label: '행동단원', prefix: 'G5' },
        { code: '6', label: '협조단원', prefix: 'G6' },
        { code: '7', label: '쁘레또리운', prefix: 'G7' },
        { code: '8', label: '아듀또리움', prefix: 'G8' },
        { code: '9', label: '예비단원', prefix: 'G9' },
        { code: '10', label: '휴가', prefix: 'G10' }
    ];

    const POSITION_LABELS = {
        1: '단장', 2: '부단장', 3: '서기', 4: '회계',
        5: '행동단원', 6: '협조단원', 7: '쁘레또리운', 8: '아듀또리움',
        9: '예비단원', 10: '휴가'
    };

    const PREFIX_LETTER_CLASS = '[TG]';
    // G10 우선 매칭 (한 자리 1~9보다 먼저)
    const PREFIX_CODE_CLASS = '(?:10|[1-9])';

    function sanitizeIdBody(value) {
        return String(value || '').trim()
            .replace(new RegExp(`^(?:10|[1-9])(?=${PREFIX_LETTER_CLASS}${PREFIX_CODE_CLASS})`, 'i'), '')
            .replace(/^(?:10|[1-9])/, '')
            .replace(new RegExp(`^${PREFIX_LETTER_CLASS}${PREFIX_CODE_CLASS}`, 'i'), '');
    }

    function parseLoginStyleId(loginId) {
        const trimmed = String(loginId || '').trim();
        const withoutLeadingCode = trimmed.replace(new RegExp(`^(?:10|[1-9])(?=${PREFIX_LETTER_CLASS}${PREFIX_CODE_CLASS})`, 'i'), '');
        const match = withoutLeadingCode.match(new RegExp(`^(${PREFIX_LETTER_CLASS})(${PREFIX_CODE_CLASS})(.+?)(\\d{4})$`, 'i'));
        if (!match) return null;
        const code = parseInt(match[2], 10);
        const letter = match[1].toUpperCase();
        return {
            positionCode: code,
            name: `${letter}${match[2]}${match[3]}`,
            phone_last4: match[4],
            position: POSITION_LABELS[code] || null
        };
    }

    function parseLoginStyleIdForFind(loginId) {
        const full = parseLoginStyleId(loginId);
        if (full) {
            return { ...full, hasPhoneSuffix: true };
        }
        const trimmed = String(loginId || '').trim();
        const withoutLeadingCode = trimmed.replace(new RegExp(`^(?:10|[1-9])(?=${PREFIX_LETTER_CLASS}${PREFIX_CODE_CLASS})`, 'i'), '');
        const match = withoutLeadingCode.match(new RegExp(`^(${PREFIX_LETTER_CLASS})(${PREFIX_CODE_CLASS})(.+)$`, 'i'));
        if (!match || !match[3]) {
            if (trimmed && !new RegExp(`^${PREFIX_LETTER_CLASS}${PREFIX_CODE_CLASS}`, 'i').test(trimmed)) {
                return {
                    name: trimmed,
                    positionCode: null,
                    phone_last4: null,
                    position: null,
                    hasPhoneSuffix: false,
                    isLegacyName: true
                };
            }
            return null;
        }
        const code = parseInt(match[2], 10);
        const letter = match[1].toUpperCase();
        return {
            positionCode: code,
            name: `${letter}${match[2]}${match[3]}`,
            phone_last4: null,
            position: POSITION_LABELS[code] || null,
            hasPhoneSuffix: false
        };
    }

    function canAssignActivity(name) {
        return new RegExp(`^${PREFIX_LETTER_CLASS}[1234]`, 'i').test(String(name || ''));
    }

    global.RegioPosition = {
        POSITION_ITEMS,
        POSITION_LABELS,
        sanitizeIdBody,
        parseLoginStyleId,
        parseLoginStyleIdForFind,
        canAssignActivity
    };
})(typeof window !== 'undefined' ? window : global);
