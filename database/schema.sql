-- Regio PostgreSQL 데이터베이스 스키마
-- 데이터베이스명: regio
-- 비밀번호: 5854

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

-- inputact 테이블 생성 (활동 입력용)
CREATE TABLE IF NOT EXISTS inputact (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
    activity_type VARCHAR(50) NOT NULL,
    activity_description TEXT,
    hours_spent DECIMAL(4,2) DEFAULT 0,
    location VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_member_name ON member(name);
CREATE INDEX IF NOT EXISTS idx_member_phone_last4 ON member(phone_last4);
CREATE INDEX IF NOT EXISTS idx_member_resident_id_front6 ON member(resident_id_front6);
CREATE INDEX IF NOT EXISTS idx_inputact_member_id ON inputact(member_id);
CREATE INDEX IF NOT EXISTS idx_inputact_activity_date ON inputact(activity_date);
CREATE INDEX IF NOT EXISTS idx_inputact_activity_type ON inputact(activity_type);

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

CREATE TRIGGER update_inputact_updated_at 
    BEFORE UPDATE ON inputact 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 샘플 데이터 (테스트용)
INSERT INTO member (name, phone_last4, resident_id_front6, phone_full, resident_id_full, password_hash) 
VALUES 
    ('홍길동', '1234', '123456', '010-1234-5678', '123456-1234567', '$2a$10$example_hash_here'),
    ('김철수', '5678', '234567', '010-9876-5432', '234567-2345678', '$2a$10$example_hash_here'),
    ('이영희', '9012', '345678', '010-5555-1234', '345678-3456789', '$2a$10$example_hash_here')
ON CONFLICT (name) DO NOTHING;

-- 샘플 활동 데이터
INSERT INTO inputact (member_id, activity_date, activity_type, activity_description, hours_spent, location, notes)
SELECT 
    m.id,
    CURRENT_DATE - INTERVAL '1 day',
    '회의',
    '팀 미팅 참석',
    2.5,
    '회사 회의실',
    '주간 업무 계획 논의'
FROM member m WHERE m.name = '홍길동'
UNION ALL
SELECT 
    m.id,
    CURRENT_DATE,
    '교육',
    '신기술 교육 수강',
    4.0,
    '온라인',
    'React.js 기초 과정'
FROM member m WHERE m.name = '김철수'; 