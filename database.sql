-- Regio 데이터베이스 생성
CREATE DATABASE regio;

-- 데이터베이스 연결
\c regio;

-- member 테이블 생성
CREATE TABLE member (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    baptism_name VARCHAR(100),
    church_name VARCHAR(200),
    pr_name VARCHAR(100),
    position VARCHAR(100),
    phone_last4 VARCHAR(4) NOT NULL,
    resident_id_front6 VARCHAR(6) NOT NULL,
    phone_full VARCHAR(20),
    resident_id_full VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 테스트 데이터 삽입
INSERT INTO member (name, phone_last4, resident_id_front6) VALUES 
('홍길동', '1234', '123456'),
('갑순이', '1234', '123456')
ON CONFLICT (name) DO NOTHING;

-- 활동 보고서 테이블 (향후 확장용)
CREATE TABLE activity_report (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL,
    report_date DATE NOT NULL,
    evangelism_data JSONB,
    care_data JSONB,
    needy_data JSONB,
    legion_data JSONB,
    prayer_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES member(id)
);

-- 인덱스 생성
CREATE INDEX idx_member_name ON member(name);
CREATE INDEX idx_activity_report_member_date ON activity_report(member_id, report_date);

-- updated_at 자동 업데이트를 위한 트리거 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- member 테이블에 트리거 적용
CREATE TRIGGER update_member_updated_at BEFORE UPDATE ON member
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- activity_report 테이블에 트리거 적용
CREATE TRIGGER update_activity_report_updated_at BEFORE UPDATE ON activity_report
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
