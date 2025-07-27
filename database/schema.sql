-- Regio 데이터베이스 스키마
-- Neon PostgreSQL 데이터베이스용

-- member 테이블 생성
CREATE TABLE IF NOT EXISTS member (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    phone_last4 VARCHAR(4) NOT NULL,
    resident_id_front6 VARCHAR(6) NOT NULL,
    phone_full VARCHAR(20),
    resident_id_full VARCHAR(14),
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_member_name ON member(name);
CREATE INDEX IF NOT EXISTS idx_member_phone_last4 ON member(phone_last4);
CREATE INDEX IF NOT EXISTS idx_member_resident_id_front6 ON member(resident_id_front6);

-- updated_at 자동 업데이트를 위한 트리거 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 트리거 생성
CREATE TRIGGER update_member_updated_at 
    BEFORE UPDATE ON member 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 샘플 데이터 (테스트용)
INSERT INTO member (name, phone_last4, resident_id_front6, phone_full, resident_id_full, password_hash) 
VALUES 
    ('홍길동', '1234', '123456', '010-1234-5678', '123456-1234567', '$2a$10$example_hash_here'),
    ('김철수', '5678', '234567', '010-9876-5432', '234567-2345678', '$2a$10$example_hash_here'),
    ('이영희', '9012', '345678', '010-5555-1234', '345678-3456789', '$2a$10$example_hash_here')
ON CONFLICT (name) DO NOTHING; 