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
    UNIQUE (purchase_token)
);

CREATE INDEX IF NOT EXISTS idx_play_purchases_member_id ON play_purchases(member_id);
CREATE INDEX IF NOT EXISTS idx_play_purchases_product_id ON play_purchases(product_id);
