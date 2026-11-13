/**
 * Google Play 인앱결제 — 서버 검증 (Play Console + 서비스 계정 설정 후 활성화)
 *
 * 필요 환경변수:
 *   GOOGLE_PLAY_PACKAGE_NAME=com.ktube.regio
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
 *   GOOGLE_PLAY_PRODUCT_IDS=regio_premium_monthly,regio_premium_yearly
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_PRODUCT_IDS = ['regio_premium_monthly', 'regio_premium_yearly'];

function getPackageName() {
    return String(process.env.GOOGLE_PLAY_PACKAGE_NAME || '').trim();
}

function getProductIds() {
    const raw = String(process.env.GOOGLE_PLAY_PRODUCT_IDS || '').trim();
    if (!raw) return DEFAULT_PRODUCT_IDS;
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function getServiceAccountCredentials() {
    const inline = String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim();
    if (inline) {
        try {
            return JSON.parse(inline);
        } catch (error) {
            throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON 파싱 실패');
        }
    }
    const filePath = String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE || '').trim();
    if (filePath && fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
    }
    return null;
}

function isPlayBillingConfigured() {
    return !!(getPackageName() && getServiceAccountCredentials());
}

function getBillingPublicConfig() {
    return {
        enabled: isPlayBillingConfigured(),
        packageName: getPackageName() || null,
        productIds: getProductIds(),
        platform: 'google_play'
    };
}

const ENTITLED_SUBSCRIPTION_STATES = new Set([
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    'SUBSCRIPTION_STATE_CANCELED'
]);

function pickSubscriptionLineItem(data, productId) {
    const items = Array.isArray(data.lineItems) ? data.lineItems : [];
    const matched = items.find((item) => item && item.productId === productId);
    if (matched) return matched;
    return items.slice().sort((a, b) => {
        const aTime = Date.parse(a && a.expiryTime) || 0;
        const bTime = Date.parse(b && b.expiryTime) || 0;
        return bTime - aTime;
    })[0] || null;
}

function subscriptionGrantsAccess(subscriptionState, expiryTime) {
    if (!ENTITLED_SUBSCRIPTION_STATES.has(subscriptionState)) return false;
    const expiryMs = Date.parse(expiryTime);
    return Number.isFinite(expiryMs) && expiryMs > Date.now();
}

/**
 * Play Developer API로 월간 구독 purchaseToken 검증
 * googleapis 패키지 설치 + Play Console API 연동 후 실제 호출 활성화
 */
async function verifyPurchaseWithGoogle({ productId, purchaseToken }) {
    const packageName = getPackageName();
    const credentials = getServiceAccountCredentials();
    if (!packageName || !credentials) {
        const error = new Error('PLAY_BILLING_NOT_CONFIGURED');
        error.status = 503;
        throw error;
    }

    let androidpublisher;
    try {
        ({ google: { androidpublisher } } = require('googleapis'));
    } catch (error) {
        const err = new Error('googleapis 패키지가 필요합니다. npm install googleapis');
        err.status = 503;
        throw err;
    }

    const auth = new (require('google-auth-library').GoogleAuth)({
        credentials,
        scopes: ['https://www.googleapis.com/auth/androidpublisher']
    });
    const client = await auth.getClient();
    const api = androidpublisher({ version: 'v3', auth: client });

    const response = await api.purchases.subscriptionsv2.get({
        packageName,
        token: purchaseToken
    });

    const data = response.data || {};
    const lineItem = pickSubscriptionLineItem(data, productId);
    if (!lineItem || lineItem.productId !== productId) {
        const error = new Error('SUBSCRIPTION_PRODUCT_MISMATCH');
        error.status = 400;
        throw error;
    }

    const subscriptionState = String(data.subscriptionState || '');
    const expiryTime = lineItem.expiryTime || null;
    const autoRenew = !!(lineItem.autoRenewingPlan && lineItem.autoRenewingPlan.autoRenewEnabled);
    if (!subscriptionGrantsAccess(subscriptionState, expiryTime)) {
        const error = new Error('SUBSCRIPTION_NOT_ACTIVE');
        error.status = 400;
        throw error;
    }

    return {
        productId,
        purchaseToken,
        orderId: data.latestOrderId || null,
        purchaseState: 'active',
        subscriptionState,
        expiryTime,
        autoRenew,
        raw: data
    };
}

async function saveVerifiedPurchase(pool, memberId, verified) {
    const result = await pool.query(
        `INSERT INTO play_purchases
            (member_id, product_id, purchase_token, order_id, purchase_state,
             subscription_state, expiry_time, auto_renew, verified_at, raw_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
         ON CONFLICT (purchase_token) DO UPDATE SET
            member_id = EXCLUDED.member_id,
            order_id = EXCLUDED.order_id,
            purchase_state = EXCLUDED.purchase_state,
            subscription_state = EXCLUDED.subscription_state,
            expiry_time = EXCLUDED.expiry_time,
            auto_renew = EXCLUDED.auto_renew,
            verified_at = NOW(),
            raw_payload = EXCLUDED.raw_payload
         RETURNING *`,
        [
            memberId,
            verified.productId,
            verified.purchaseToken,
            verified.orderId,
            verified.purchaseState,
            verified.subscriptionState,
            verified.expiryTime,
            verified.autoRenew,
            JSON.stringify(verified.raw || {})
        ]
    );
    return result.rows[0];
}

async function memberHasActiveProduct(pool, memberId, productId) {
    const result = await pool.query(
        `SELECT id FROM play_purchases
         WHERE member_id = $1 AND product_id = $2
           AND purchase_state = 'active'
           AND expiry_time > NOW()
         LIMIT 1`,
        [memberId, productId]
    );
    return result.rows.length > 0;
}

module.exports = {
    getBillingPublicConfig,
    isPlayBillingConfigured,
    getProductIds,
    verifyPurchaseWithGoogle,
    saveVerifiedPurchase,
    memberHasActiveProduct
};
