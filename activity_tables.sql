-- 회원 활동 기록을 위한 테이블들

-- 1. 세목별 활동 기록 테이블 (매일 기록)
CREATE TABLE IF NOT EXISTS daily_activities (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL,
    activity_date DATE NOT NULL,
    evangelism_count INTEGER DEFAULT 0, -- 전도 활동 횟수
    care_count INTEGER DEFAULT 0,       -- 돌봄 활동 횟수
    needy_count INTEGER DEFAULT 0,      -- 구제 활동 횟수
    legion_count INTEGER DEFAULT 0,     -- 군단 활동 횟수
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES member(id) ON DELETE CASCADE,
    UNIQUE(member_id, activity_date)
);

-- 2. 기도생활 기록 테이블 (주 1-2회 기록)
CREATE TABLE IF NOT EXISTS prayer_activities (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL,
    week_start_date DATE NOT NULL, -- 주의 시작일 (월요일)
    daily_prayer_count INTEGER DEFAULT 0, -- 일일기도 횟수
    rosary_count INTEGER DEFAULT 0,       -- 묵주기도 횟수
    mass_attendance_count INTEGER DEFAULT 0, -- 미사 참례 횟수
    confession_count INTEGER DEFAULT 0,   -- 고해성사 횟수
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES member(id) ON DELETE CASCADE,
    UNIQUE(member_id, week_start_date)
);

-- 3. 지구와 함께 활동 기록 테이블 (주 1-2회 기록)
CREATE TABLE IF NOT EXISTS community_activities (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL,
    week_start_date DATE NOT NULL, -- 주의 시작일 (월요일)
    community_service_count INTEGER DEFAULT 0, -- 지역봉사 횟수
    environmental_activity_count INTEGER DEFAULT 0, -- 환경보호 활동 횟수
    social_justice_count INTEGER DEFAULT 0, -- 사회정의 활동 횟수
    charity_work_count INTEGER DEFAULT 0, -- 자선활동 횟수
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES member(id) ON DELETE CASCADE,
    UNIQUE(member_id, week_start_date)
);

-- 인덱스 생성
CREATE INDEX idx_daily_activities_member_date ON daily_activities(member_id, activity_date);
CREATE INDEX idx_prayer_activities_member_week ON prayer_activities(member_id, week_start_date);
CREATE INDEX idx_community_activities_member_week ON community_activities(member_id, week_start_date);

-- updated_at 자동 업데이트를 위한 트리거 적용
CREATE TRIGGER update_daily_activities_updated_at BEFORE UPDATE ON daily_activities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prayer_activities_updated_at BEFORE UPDATE ON prayer_activities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_community_activities_updated_at BEFORE UPDATE ON community_activities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 주의 시작일을 계산하는 함수
CREATE OR REPLACE FUNCTION get_week_start_date(input_date DATE)
RETURNS DATE AS $$
BEGIN
    RETURN input_date - EXTRACT(DOW FROM input_date)::INTEGER;
END;
$$ LANGUAGE plpgsql;
