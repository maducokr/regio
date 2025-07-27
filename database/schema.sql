-- Regio PostgreSQL 데이터베이스 스키마
-- 데이터베이스명: regio
-- 비밀번호: 5854

-- member 테이블 생성 (실제 구조에 맞게 수정)
CREATE TABLE IF NOT EXISTS member (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    passno INTEGER NOT NULL
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
CREATE TRIGGER update_inputact_updated_at 
    BEFORE UPDATE ON inputact 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 샘플 데이터 (테스트용) - 실제 데이터와 일치하도록 수정
INSERT INTO member (name, passno) 
VALUES 
    ('홍길동', 1234123456),
    ('갑순이', 1234123456)
ON CONFLICT (id) DO NOTHING;

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
FROM member m WHERE m.name = '갑순이'; 