/**
 * Google Play 인앱결제 — 앱(Android) / 웹 공통 브릿지
 * Capacitor + Billing Plugin 연동 시 isNativeApp() 만 true 로 전환
 */
(function (global) {
    'use strict';

    function isCapacitorNative() {
        return !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());
    }

    function getApiBase() {
        if (global.RegioApiConfig && typeof global.RegioApiConfig.getBaseUrl === 'function') {
            return global.RegioApiConfig.getBaseUrl();
        }
        return '';
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
        if (!isCapacitorNative()) {
            const config = await fetchBillingConfig();
            return (config.productIds || []).map((id) => ({
                id,
                title: id,
                available: false,
                reason: '웹 브라우저에서는 Google Play 인앱결제를 사용할 수 없습니다.'
            }));
        }

        // TODO: Capacitor Billing Plugin 연동
        // const { InAppPurchase } = Capacitor.Plugins;
        // return InAppPurchase.getProducts({ productIds: config.productIds });
        throw new Error('Android Billing Plugin 연동이 필요합니다. mobile/README.md 참고');
    }

    async function purchase(productId) {
        if (!isCapacitorNative()) {
            throw new Error('Google Play 인앱결제는 Android 앱에서만 가능합니다.');
        }
        throw new Error('Android Billing Plugin 연동이 필요합니다.');
    }

    async function restorePurchases() {
        if (!isCapacitorNative()) {
            return { restored: [] };
        }
        throw new Error('Android Billing Plugin 연동이 필요합니다.');
    }

    global.RegioBillingBridge = {
        isNativeApp: isCapacitorNative,
        fetchBillingConfig,
        verifyPurchaseOnServer,
        getProducts,
        purchase,
        restorePurchases
    };
})(typeof window !== 'undefined' ? window : global);
