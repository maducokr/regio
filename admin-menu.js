(function (global) {
    'use strict';

    const CATEGORY_ADMIN_EMAIL = 'maducokr@gmail.com';
    const ADMIN_NAME = '김학숭';
    const ADMIN_ONLY_ACTIONS = [
        'new-category',
        'add-category',
        'test-activity-input',
        'delete-member'
    ];

    const LOGGED_IN_ACTIONS = [
        'test-activity-pdf'
    ];

    const ACTIVITY_ASSIGNMENT_ACTION = 'activity-assignment';
    const CURIA_OFFICER_REGISTER_ACTION = 'curia-officer-register';
    const COMING_SOON_ACTIONS = {};
    const SAMPLE_MEMBER_ID_MIN = 3;
    const SAMPLE_MEMBER_ID_MAX = 103;
    const SAMPLE_RESTRICTED_ACTIONS = ['withdraw'];

    /** 로컬 모의/테스트 전용 메뉴 — Deploy(실서비스) 호스트에서는 숨김 */
    const LOCAL_TEST_ACTIONS = [
        'test-activity-input',
        'test-activity-pdf',
        'sample-member-roster',
        'sample-annual-activity'
    ];

    function isLocalDevHost() {
        if (global.RegioAppMode && typeof global.RegioAppMode.isLocal === 'function') {
            return global.RegioAppMode.isLocal();
        }
        try {
            const host = String(global.location && global.location.hostname || '').toLowerCase();
            return host === 'localhost'
                || host === '127.0.0.1'
                || host === '0.0.0.0'
                || host === ''
                || host.endsWith('.local');
        } catch (_) {
            return false;
        }
    }

    function ensureLocalTestBanner() {
        if (!isLocalDevHost()) {
            const existing = document.getElementById('regio-local-test-banner');
            if (existing) existing.remove();
            return;
        }
        if (document.getElementById('regio-local-test-banner')) return;
        const bar = document.createElement('div');
        bar.id = 'regio-local-test-banner';
        bar.setAttribute('role', 'status');
        bar.textContent = '테스트/모의 환경 — 샘플·시드 DB 자료가 표시될 수 있습니다. Deploy(실서비스) 앱과 별개입니다.';
        bar.style.cssText = [
            'position:sticky',
            'top:0',
            'z-index:9999',
            'background:#fff7ed',
            'color:#9a3412',
            'border-bottom:1px solid #fdba74',
            'padding:8px 12px',
            'font-size:13px',
            'font-weight:600',
            'text-align:center',
            'line-height:1.35'
        ].join(';');
        document.body.insertBefore(bar, document.body.firstChild);
    }

    function isSampleMember(user) {
        if (!user || user.id == null) return false;
        const id = parseInt(user.id, 10);
        return !Number.isNaN(id) && id >= SAMPLE_MEMBER_ID_MIN && id <= SAMPLE_MEMBER_ID_MAX;
    }

    function canUseProfileOrWithdraw(user) {
        return !isSampleMember(user);
    }

    function guardSampleMemberRestrictedAction(actionLabel) {
        const user = getLoggedInUser();
        if (!user || !user.name) {
            alert('로그인이 필요합니다.');
            return false;
        }
        if (isSampleMember(user)) {
            alert(`${actionLabel || '이 메뉴'}는 샘플 회원(3~103번)에게는 제공되지 않습니다.`);
            return false;
        }
        return true;
    }

    function canUseActivityAssignment(user) {
        if (!user || !user.name) return false;
        const name = String(user.name || '').trim();
        // G17/G58 등: 마지막 직책 자리가 1~4이면 허용
        const compound = name.match(/^[TG]([1-6])([1-8])/i);
        if (compound) {
            const code = parseInt(compound[2], 10);
            if (code >= 1 && code <= 4) return true;
        }
        if (/^[TG][1-4]/i.test(name)) return true;
        const position = String(user.position || '').trim();
        if (/단장|부단장|서기|회계/.test(position) && !/행동|협조|쁘레|아듀/.test(position)) {
            return true;
        }
        const officer = String(user.curia_officer || '').trim().toUpperCase();
        if (/^[KCRS][1-4]$/.test(officer)) return true;
        return false;
    }

    function getLoggedInUser() {
        const raw = sessionStorage.getItem('userInfo') || localStorage.getItem('userInfo');
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function isCategoryAdminUser(user) {
        if (!user) return false;
        if (user.is_admin === true) return true;
        if (String(user.name || '').trim() === ADMIN_NAME) return true;
        const email = String(user.email || '').trim().toLowerCase();
        return email === CATEGORY_ADMIN_EMAIL.toLowerCase();
    }

    function canShowCategoryAdminMenu() {
        return isCategoryAdminUser(getLoggedInUser());
    }

    function applyCategoryAdminMenuVisibility(root) {
        const scope = root || document;
        const adminVisible = canShowCategoryAdminMenu();
        const user = getLoggedInUser();
        const loggedIn = !!(user && user.name);

        const localDev = isLocalDevHost();
        if (localDev) ensureLocalTestBanner();

        ADMIN_ONLY_ACTIONS.forEach((action) => {
            scope.querySelectorAll(`[data-action="${action}"]`).forEach((el) => {
                // TEST 자료입력 등은 로컬에서만 + 관리자
                if (LOCAL_TEST_ACTIONS.includes(action)) {
                    el.style.display = (localDev && adminVisible) ? '' : 'none';
                    return;
                }
                el.style.display = adminVisible ? '' : 'none';
            });
        });

        LOGGED_IN_ACTIONS.forEach((action) => {
            scope.querySelectorAll(`[data-action="${action}"]`).forEach((el) => {
                if (LOCAL_TEST_ACTIONS.includes(action)) {
                    el.style.display = (localDev && loggedIn) ? '' : 'none';
                    return;
                }
                el.style.display = loggedIn ? '' : 'none';
            });
        });

        // 샘플명단·1연간샘플: 로컬 모의 환경에서만
        LOCAL_TEST_ACTIONS.forEach((action) => {
            if (ADMIN_ONLY_ACTIONS.includes(action) || LOGGED_IN_ACTIONS.includes(action)) return;
            scope.querySelectorAll(`[data-action="${action}"]`).forEach((el) => {
                el.style.display = localDev ? '' : 'none';
            });
        });

        scope.querySelectorAll(`[data-action="${ACTIVITY_ASSIGNMENT_ACTION}"]`).forEach((el) => {
            el.style.display = canUseActivityAssignment(user) ? '' : 'none';
        });

        // 꾸리아직급등록: 햄버거에 항상 표시 (이용 권한은 클릭 시 G1~G4 검사)
        scope.querySelectorAll(`[data-action="${CURIA_OFFICER_REGISTER_ACTION}"]`).forEach((el) => {
            el.style.display = '';
        });

        // 프로필 수정: 로그인 시 항상 표시 (샘플 3~103 포함 — deploy 전 테스트용)
        scope.querySelectorAll('[data-action="profile"]').forEach((el) => {
            el.style.display = loggedIn ? '' : 'none';
        });

        // 탈단: 샘플 회원(3~103)에게는 숨김
        scope.querySelectorAll('[data-action="withdraw"]').forEach((el) => {
            el.style.display = canUseProfileOrWithdraw(user) ? '' : 'none';
        });
    }

    function guardActivityAssignmentAction(actionLabel) {
        const user = getLoggedInUser();
        if (!user || !user.name) {
            alert('로그인이 필요합니다.');
            return false;
        }
        if (!canUseActivityAssignment(user)) {
            alert(`${actionLabel || '활동배당지시'}는 G1~G4(단장·부단장·서기·회계) 로그인 회원만 이용할 수 있습니다.`);
            return false;
        }
        return true;
    }

    function guardLoggedInAction(actionLabel) {
        const user = getLoggedInUser();
        if (user && user.name) {
            return true;
        }
        alert(`${actionLabel || '이 메뉴'}는 로그인 후 이용할 수 있습니다.`);
        return false;
    }

    function guardAdminOnlyAction(actionLabel) {
        if (canShowCategoryAdminMenu()) {
            return true;
        }
        alert(`${actionLabel || '이 메뉴'}는 관리자(김학숭)로 로그인한 경우에만 이용할 수 있습니다.`);
        return false;
    }

    function guardDeleteMemberAccess(actionLabel) {
        const user = getLoggedInUser();
        if (!user || !user.name) {
            alert('로그인이 필요합니다.');
            return false;
        }
        if (!isCategoryAdminUser(user)) {
            alert(`${actionLabel || '회원 삭제'}는 관리자(김학숭)로 로그인한 경우에만 이용할 수 있습니다.`);
            return false;
        }
        return true;
    }

    function ensureComingSoonMenuStyles() {
        if (document.getElementById('regio-coming-soon-styles')) return;
        const style = document.createElement('style');
        style.id = 'regio-coming-soon-styles';
        style.textContent = `
            .dropdown-item.dropdown-section-label,
            .dropdown-item[data-action^="coming-"] {
                color: #5c6bc0;
                background: #eef0fb;
            }
            .dropdown-item.dropdown-section-label {
                font-size: 12px;
                font-weight: 700;
                cursor: default;
                pointer-events: none;
                border-top: 1px solid #d8ddf5;
            }
            .dropdown-item.dropdown-section-label:hover,
            .dropdown-item[data-action^="coming-"]:hover {
                background: #e0e4f7;
            }
            .dropdown-item[data-action^="coming-"] {
                font-weight: 600;
            }
        `;
        document.head.appendChild(style);
    }

    function initComingSoonMenuHandlers() {
        ensureComingSoonMenuStyles();
        document.addEventListener('click', (e) => {
            const item = e.target.closest('[data-action]');
            if (!item) return;
            const action = item.getAttribute('data-action');
            const label = COMING_SOON_ACTIONS[action];
            if (!label) return;
            e.preventDefault();
            e.stopPropagation();
            document.querySelectorAll('.dropdown-menu.show').forEach((menu) => menu.classList.remove('show'));
            alert(`${label} 기능은 준비 중입니다.`);
        }, true);
    }

    initComingSoonMenuHandlers();

    function guardCategoryAdminPage(options) {
        const opts = options || {};
        const user = getLoggedInUser();
        if (!user || !user.name) {
            alert(opts.loginMessage || '로그인이 필요합니다.');
            window.location.href = opts.loginUrl || 'index.html';
            return false;
        }
        if (!isCategoryAdminUser(user)) {
            alert(opts.deniedMessage || '이 메뉴는 관리자(김학숭)로 로그인한 경우에만 이용할 수 있습니다.');
            window.location.href = opts.redirectUrl || 'index.html';
            return false;
        }
        return true;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                ensureLocalTestBanner();
                applyCategoryAdminMenuVisibility();
            });
        } else {
            ensureLocalTestBanner();
        }
    }

    global.RegioAdminMenu = {
        CATEGORY_ADMIN_EMAIL,
        ADMIN_NAME,
        getLoggedInUser,
        isCategoryAdminUser,
        canShowCategoryAdminMenu,
        applyCategoryAdminMenuVisibility,
        guardCategoryAdminPage,
        guardAdminOnlyAction,
        guardDeleteMemberAccess,
        guardLoggedInAction,
        guardActivityAssignmentAction,
        canUseActivityAssignment,
        isSampleMember,
        canUseProfileOrWithdraw,
        guardSampleMemberRestrictedAction,
        isLocalDevHost,
        ACTIVITY_ASSIGNMENT_ACTION,
        CURIA_OFFICER_REGISTER_ACTION,
        SAMPLE_MEMBER_ID_MIN,
        SAMPLE_MEMBER_ID_MAX,
        SAMPLE_RESTRICTED_ACTIONS,
        COMING_SOON_ACTIONS,
        ADMIN_ONLY_ACTIONS,
        LOGGED_IN_ACTIONS
    };
})(typeof window !== 'undefined' ? window : global);
