-- Google Play 인앱결제 기록 (서버 검증 후 저장)
CREATE TABLE IF NOT EXISTS play_purchases (
    id SERIAL PRIMARY KEY,
    member_id INTEGER REFERENCES member(id),
    product_id VARCHAR(100) NOT NULL,
    purchase_token TEXT NOT NULL,
    order_id VARCHAR(200),
    purchase_state VARCHAR(50) DEFAULT 'purchased',
    acknowledged BOOLEAN DEFAULT false,
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP,
    raw_payload JSONB,
    subscription_state VARCHAR(80),
    expiry_time TIMESTAMP,
    auto_renew BOOLEAN,
    UNIQUE (purchase_token)
);

ALTER TABLE play_purchases
    ADD COLUMN IF NOT EXISTS subscription_state VARCHAR(80),
    ADD COLUMN IF NOT EXISTS expiry_time TIMESTAMP,
    ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_play_purchases_member_id ON play_purchases(member_id);
CREATE INDEX IF NOT EXISTS idx_play_purchases_product_id ON play_purchases(product_id);
