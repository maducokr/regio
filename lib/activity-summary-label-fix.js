/**
 * 활동집계 — 구버전 getFieldDisplayName 보완 (영문 필드명 → 한글)
 * deploy-mode.js 는 캐시 버전 없이 로드되어 Render 구배포 hotfix 용도.
 */
(function (global) {
    'use strict';

    const DEFAULT_FIELD_LABELS = {
        count: '횟수(회,단,시간,명)',
        catechism_guide: '교리반인도',
        group_join: '단체가입',
        meeting_head: '회두',
        resolution: '해소',
        sacrament: '성사',
        confirmation: '견진',
        baptism: '세례',
        first_communion: '첫영성체',
        year_count: '연도',
        funeral_mass: '장례미사',
        memorial_mass: '추모미사',
        funeral_attendance: '장지참석',
        inout_count: '입출관',
        conditional_baptism: '대세',
        conditional_communion: '보례',
        membership: '입단',
        establishment: '설립',
        target: '대상'
    };

    const CATEGORY_FIELD_LABELS = {
        '교우돌봄-교우 상가 방문 및 돌봄': {
            year_count: '연도',
            funeral_mass: '장례미사(고별식)',
            funeral_attendance: '기타 상가 활동',
            count: '횟수(회,단,시간,명)'
        },
        '교우돌봄-교우 환자 방문 및 돌봄': {
            year_count: '연도',
            funeral_mass: '장례미사(고별식)',
            funeral_attendance: '기타 상가 활동',
            count: '횟수(회,단,시간,명)'
        },
        '교우돌봄-신 세례자 방문': {
            count: '횟수',
            group_join: '단체 가입',
            meeting_head: '쉬는 교우 회두',
            resolution: '혼인 장애 해소',
            sacrament: '판공 성사',
            confirmation: '견진 성사',
            baptism: '유아 세례'
        },
        '교우돌봄-쉬는 교우 방문': {
            count: '횟수',
            group_join: '단체 가입',
            meeting_head: '쉬는 교우 회두',
            resolution: '혼인 장애 해소',
            sacrament: '판공 성사',
            confirmation: '견진 성사',
            baptism: '유아 세례'
        },
        '교우돌봄-교우 가정 방문': {
            count: '횟수',
            group_join: '단체 가입',
            meeting_head: '쉬는 교우 회두',
            resolution: '혼인 장애 해소',
            sacrament: '판공 성사',
            confirmation: '견진 성사',
            baptism: '유아 세례'
        },
        '교우돌봄-혼인 장애자 방문': {
            count: '횟수',
            group_join: '단체 가입',
            meeting_head: '쉬는 교우 회두',
            resolution: '혼인 장애 해소',
            sacrament: '판공 성사',
            confirmation: '견진 성사',
            baptism: '유아 세례'
        },
        '교우돌봄-성사 권면': {
            count: '횟수',
            group_join: '단체 가입',
            meeting_head: '쉬는 교우 회두',
            resolution: '혼인 장애 해소',
            sacrament: '판공 성사',
            confirmation: '견진 성사',
            baptism: '유아 세례'
        },
        '교우돌봄-전입 교우 방문': {
            count: '횟수',
            group_join: '단체 가입',
            meeting_head: '쉬는 교우 회두',
            resolution: '혼인 장애 해소',
            sacrament: '판공 성사',
            confirmation: '견진 성사',
            baptism: '유아 세례'
        }
    };

    const ENGLISH_FIELD_KEYS = Object.keys(DEFAULT_FIELD_LABELS)
        .sort((a, b) => b.length - a.length);

    function labelForField(fieldKey, categoryName) {
        const cat = CATEGORY_FIELD_LABELS[String(categoryName || '').trim()];
        if (cat && cat[fieldKey]) return cat[fieldKey];
        return DEFAULT_FIELD_LABELS[fieldKey] || fieldKey;
    }

    function translateActivityText(text, categoryName) {
        const raw = String(text || '');
        if (!raw || /[가-힣]/.test(raw)) return raw;
        let out = raw;
        ENGLISH_FIELD_KEYS.forEach((key) => {
            const label = labelForField(key, categoryName);
            if (label !== key) {
                out = out.split(key).join(label);
            }
        });
        return out;
    }

    function wrapSummaryRow(row) {
        if (!row || typeof row !== 'object') return row;
        const category = row.subCategory || row.category || '';
        const activityText = translateActivityText(row.activityText, category);
        if (activityText === row.activityText) return row;
        return Object.assign({}, row, { activityText: activityText });
    }

    function installActivitySummaryLabelFix() {
        if (global.__regioActivitySummaryLabelFix) return;
        if (typeof global.buildSummaryRows !== 'function') return;
        global.__regioActivitySummaryLabelFix = true;

        const origSummary = global.buildSummaryRows;
        global.buildSummaryRows = function (dailyData) {
            const rows = origSummary.call(this, dailyData);
            return Array.isArray(rows) ? rows.map(wrapSummaryRow) : rows;
        };

        if (typeof global.buildActivityTextFromRecord === 'function') {
            const origText = global.buildActivityTextFromRecord;
            global.buildActivityTextFromRecord = function (record, category, subCategory) {
                return translateActivityText(
                    origText.call(this, record, category, subCategory),
                    category || subCategory
                );
            };
        }

        if (typeof global.buildMemberReportContent === 'function') {
            const origMember = global.buildMemberReportContent;
            global.buildMemberReportContent = function (memberId, activityData) {
                return translateActivityText(
                    origMember.call(this, memberId, activityData),
                    ''
                );
            };
        }
    }

    function scheduleInstall() {
        installActivitySummaryLabelFix();
        if (!global.__regioActivitySummaryLabelFix && typeof global.buildSummaryRows !== 'function') {
            global.setTimeout(scheduleInstall, 50);
        }
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', scheduleInstall);
        } else {
            scheduleInstall();
        }
        global.addEventListener('load', scheduleInstall);
    }
})(typeof window !== 'undefined' ? window : globalThis);
