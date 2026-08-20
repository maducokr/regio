/**
 * 대구 세나뚜스 활동 종목·세목 — 녹색 표기용 공통 목록
 * 일반(기존) 종목과 혼동되지 않도록 UI에서 녹색으로 구분한다.
 */
(function (global) {
    'use strict';

    const DAEGU_SENATUS_CATEGORY_GROUPS = [
        '이웃에 가톨릭 알리기활동',
        '예비신자와 함께하는 활동',
        '가정을 위한 활동, 교우 돌봄',
        '성사권유 및 혼인장애자를 위한 활동',
        '어려움을 겪는 이웃과 나눔 활동',
        '본당협조활동',
        '레지오의 발전을 위한 활동',
        '소공동체와 함께하는 활동',
        '자연보호 및 생명존중 운동에 동참',
        '상급평의회가 지시한 활동',
        '기타 활동'
    ];

    function isDaeguSenatusCategory(categoryName) {
        const name = String(categoryName || '').trim();
        if (!name) return false;
        return DAEGU_SENATUS_CATEGORY_GROUPS.some(
            (g) => name === g || name.startsWith(`${g}-`)
        );
    }

    global.DAEGU_SENATUS_CATEGORY_GROUPS = DAEGU_SENATUS_CATEGORY_GROUPS;
    global.isDaeguSenatusCategory = isDaeguSenatusCategory;
    /** @deprecated 호환용 — isDaeguSenatusCategory 사용 */
    global.isNewGreenCategory = isDaeguSenatusCategory;
})(typeof window !== 'undefined' ? window : globalThis);
