/**
 * Google Play 월간 구독 — 웹뷰와 AndroidBilling 연결
 * 앱은 buyItem / AndroidBilling.purchaseProduct("regio_premium_monthly") 를 호출한다.
 * 결제 결과는 window.onBillingResult → handleNativeResult → /api/billing/verify
 */
(function (global) {
    'use strict';

    var MONTHLY_PRODUCT_ID = 'regio_premium_monthly';
    var pendingPurchase = null;

    function isCapacitorNative() {
        return !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());
    }

    function isPlayApp() {
        return isCapacitorNative() || !!(
            global.AndroidBilling &&
            typeof global.AndroidBilling.purchaseProduct === 'function'
        );
    }

    function getApiBase() {
        if (global.RegioApiConfig && typeof global.RegioApiConfig.getBaseUrl === 'function') {
            return global.RegioApiConfig.getBaseUrl();
        }
        return '';
    }

    function rejectPending(error) {
        var pending = pendingPurchase;
        pendingPurchase = null;
        if (pending) pending.reject(error);
    }

    async function fetchBillingConfig() {
        const response = await fetch(`${getApiBase()}/api/billing/config`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '결제 설정 조회 실패');
        }
        return data;
    }

    async function verifyPurchaseOnServer(payload) {
        const userRaw = sessionStorage.getItem('userInfo') || localStorage.getItem('userInfo');
        let memberId = payload.member_id;
        if (!memberId && userRaw) {
            try {
                memberId = JSON.parse(userRaw).id;
            } catch (error) {
                // ignore
            }
        }
        const response = await fetch(`${getApiBase()}/api/billing/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                member_id: memberId,
                product_id: payload.productId,
                purchase_token: payload.purchaseToken
            })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || '구매 검증 실패');
        }
        return data;
    }

    async function getProducts() {
        const config = await fetchBillingConfig();
        const inApp = isPlayApp();
        return (config.productIds || []).map((id) => ({
            id,
            title: id,
            available: inApp,
            reason: inApp ? '' : '웹 브라우저에서는 Google Play 인앱결제를 사용할 수 없습니다.'
        }));
    }

    function purchase(productId) {
        var id = productId || MONTHLY_PRODUCT_ID;
        if (!isPlayApp()) {
            return Promise.reject(new Error('Google Play 인앱결제는 Android 앱에서만 가능합니다.'));
        }
        if (pendingPurchase) {
            return Promise.reject(new Error('이미 결제가 진행 중입니다.'));
        }
        return new Promise(function (resolve, reject) {
            pendingPurchase = { productId: id, resolve: resolve, reject: reject };
            try {
                global.AndroidBilling.purchaseProduct(id);
            } catch (error) {
                pendingPurchase = null;
                reject(error);
            }
        }).then(function (purchaseToken) {
            return verifyPurchaseOnServer({
                productId: id,
                purchaseToken: purchaseToken
            });
        });
    }

    function handleNativeResult(status, purchaseToken) {
        var pending = pendingPurchase;
        pendingPurchase = null;
        if (status === 'SUCCESS' && purchaseToken) {
            if (pending) {
                pending.resolve(purchaseToken);
                return;
            }
            verifyPurchaseOnServer({
                productId: MONTHLY_PRODUCT_ID,
                purchaseToken: purchaseToken
            }).then(function () {
                alert('월간 구독이 확인되었습니다.');
            }).catch(function (error) {
                alert(error.message || '구매 검증 실패');
            });
            return;
        }
        if (!pending) return;
        if (status === 'CANCELED') {
            pending.reject(new Error('결제를 취소했습니다.'));
            return;
        }
        pending.reject(new Error(purchaseToken || '결제에 실패했습니다.'));
    }

    function startMonthlySubscription() {
        return purchase(MONTHLY_PRODUCT_ID).then(function () {
            alert('월간 구독이 확인되었습니다.');
        }).catch(function (error) {
            if (error && error.message === '결제를 취소했습니다.') return;
            alert((error && error.message) || '구독 결제에 실패했습니다.');
        });
    }

    function restorePurchases() {
        return Promise.resolve({ restored: [] });
    }

    function ensureSubscribeMenuItem() {
        var menus = document.querySelectorAll('.dropdown-menu');
        Array.prototype.forEach.call(menus, function (menu) {
            if (menu.querySelector('[data-action="subscribe-monthly"]')) return;
            var item = document.createElement('div');
            item.className = 'dropdown-item';
            item.setAttribute('data-action', 'subscribe-monthly');
            item.textContent = '월간 구독';
            var help = menu.querySelector('[data-action="help"]');
            if (help) menu.insertBefore(item, help);
            else menu.appendChild(item);
        });
    }

    function onSubscribeClick(event) {
        var item = event.target && event.target.closest
            ? event.target.closest('[data-action="subscribe-monthly"]')
            : null;
        if (!item) return;
        event.preventDefault();
        var menu = item.closest('.dropdown-menu');
        if (menu) menu.classList.remove('show');
        startMonthlySubscription();
    }

    global.buyItem = function (productId) {
        var id = productId || MONTHLY_PRODUCT_ID;
        if (global.AndroidBilling && typeof global.AndroidBilling.purchaseProduct === 'function') {
            startMonthlySubscriptionFor(id);
            return;
        }
        alert('Android 앱 환경에서만 결제가 가능합니다.');
    };

    function startMonthlySubscriptionFor(productId) {
        purchase(productId).then(function () {
            alert('월간 구독이 확인되었습니다.');
        }).catch(function (error) {
            if (error && error.message === '결제를 취소했습니다.') return;
            alert((error && error.message) || '구독 결제에 실패했습니다.');
        });
    }

    if (!global.onBillingResult) {
        global.onBillingResult = function (status, purchaseToken) {
            handleNativeResult(status, purchaseToken);
        };
    }

    global.RegioBillingBridge = {
        MONTHLY_PRODUCT_ID: MONTHLY_PRODUCT_ID,
        isNativeApp: isPlayApp,
        fetchBillingConfig,
        verifyPurchaseOnServer,
        getProducts,
        purchase,
        restorePurchases,
        handleNativeResult,
        startMonthlySubscription
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureSubscribeMenuItem);
    } else {
        ensureSubscribeMenuItem();
    }
    document.addEventListener('click', onSubscribeClick, true);
})(typeof window !== 'undefined' ? window : global);
