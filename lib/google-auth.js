let OAuth2Client = null;
try {
    ({ OAuth2Client } = require('google-auth-library'));
} catch (error) {
    OAuth2Client = null;
}

function isGoogleLoginConfigured() {
    return !!(process.env.GOOGLE_CLIENT_ID && OAuth2Client);
}

function getGoogleClientId() {
    return process.env.GOOGLE_CLIENT_ID || '';
}

async function verifyGoogleCredential(credential) {
    if (!isGoogleLoginConfigured()) {
        throw new Error('GOOGLE_NOT_CONFIGURED');
    }

    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
        throw new Error('GOOGLE_INVALID_TOKEN');
    }
    if (!payload.email_verified) {
        throw new Error('GOOGLE_EMAIL_NOT_VERIFIED');
    }

    return {
        google_id: payload.sub,
        email: String(payload.email).trim().toLowerCase(),
        name: payload.name || '',
        picture: payload.picture || null
    };
}

module.exports = {
    isGoogleLoginConfigured,
    getGoogleClientId,
    verifyGoogleCredential
};
