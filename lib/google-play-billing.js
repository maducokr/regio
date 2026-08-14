/**
 * Google Play 인앱결제 — 서버 검증 (Play Console + 서비스 계정 설정 후 활성화)
 *
 * 필요 환경변수:
 *   GOOGLE_PLAY_PACKAGE_NAME=com.regio.note
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

/**
 * Play Developer API로 purchaseToken 검증
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

    const response = await api.purchases.products.get({
        packageName,
        productId,
        token: purchaseToken
    });

    const data = response.data || {};
    const purchaseState = parseInt(data.purchaseState, 10);
    if (purchaseState !== 0) {
        const error = new Error('PURCHASE_NOT_COMPLETED');
        error.status = 400;
        throw error;
    }

    return {
        productId,
        purchaseToken,
        orderId: data.orderId || null,
        purchaseState: 'purchased',
        raw: data
    };
}

async function saveVerifiedPurchase(pool, memberId, verified) {
    const result = await pool.query(
        `INSERT INTO play_purchases
            (member_id, product_id, purchase_token, order_id, purchase_state, verified_at, raw_payload)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)
         ON CONFLICT (purchase_token) DO UPDATE SET
            member_id = EXCLUDED.member_id,
            order_id = EXCLUDED.order_id,
            purchase_state = EXCLUDED.purchase_state,
            verified_at = NOW(),
            raw_payload = EXCLUDED.raw_payload
         RETURNING *`,
        [
            memberId,
            verified.productId,
            verified.purchaseToken,
            verified.orderId,
            verified.purchaseState,
            JSON.stringify(verified.raw || {})
        ]
    );
    return result.rows[0];
}

async function memberHasActiveProduct(pool, memberId, productId) {
    const result = await pool.query(
        `SELECT id FROM play_purchases
         WHERE member_id = $1 AND product_id = $2 AND purchase_state = 'purchased'
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
