-- PostgreSQL 레지오 활동 데이터베이스 테이블 생성 스크립트

-- 1. 활동 카테고리 테이블
CREATE TABLE activity_categories (
    id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    category_group VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 활동 입력 데이터 테이블
CREATE TABLE activity_records (
    id SERIAL PRIMARY KEY,
    member_id INTEGER REFERENCES member(id),
    category_id INTEGER REFERENCES activity_categories(id),
    target VARCHAR(200), -- 대상
    count INTEGER DEFAULT 0, -- 횟수
    catechism_guide INTEGER DEFAULT 0, -- 교리반인도
    group_join INTEGER DEFAULT 0, -- 단체가입
    meeting_head INTEGER DEFAULT 0, -- 회두
    resolution INTEGER DEFAULT 0, -- 해소
    sacrament INTEGER DEFAULT 0, -- 성사
    confirmation INTEGER DEFAULT 0, -- 견진
    baptism INTEGER DEFAULT 0, -- 세례
    first_communion INTEGER DEFAULT 0, -- 첫영성체
    year_count INTEGER DEFAULT 0, -- 연도
    funeral_mass INTEGER DEFAULT 0, -- 장례미사
    funeral_attendance INTEGER DEFAULT 0, -- 장지참석
    conditional_baptism INTEGER DEFAULT 0, -- 대세
    conditional_communion INTEGER DEFAULT 0, -- 보례
    membership INTEGER DEFAULT 0, -- 입단
    establishment INTEGER DEFAULT 0, -- 설립
    inout_count INTEGER DEFAULT 0, -- 입출관
    note TEXT, -- 기타 메모
    activity_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 카테고리 데이터 삽입
INSERT INTO activity_categories (category_name, category_group, description) VALUES
-- 기도생활
('기도생활-묵주기도', '기도생활', '묵주기도 활동'),
('기도생활-평일미사', '기도생활', '평일미사 참석'),
('기도생활-십자가의길', '기도생활', '십자가의길 기도'),
('기도생활-성경읽기', '기도생활', '성경 읽기 활동'),
('기도생활-성경쓰기', '기도생활', '성경 쓰기 활동'),
('기도생활-소성무일도', '기도생활', '소성무일도 기도'),
('기도생활-성체조배', '기도생활', '성체조배 활동'),
('기도생활-기타', '기도생활', '기타 기도 활동'),

-- 지구와함께
('지구와함께-거절하기', '지구와함께', '불필요한 소비 거절'),
('지구와함께-아껴쓰기', '지구와함께', '자원 절약 활동'),
('지구와함께-고쳐쓰기', '지구와함께', '물건 수리 재사용'),
('지구와함께-재고하기', '지구와함께', '재고 관리 활동'),
('지구와함께-다시쓰기', '지구와함께', '재활용 활동'),
('지구와함께-재생하기', '지구와함께', '재생 자원 활용'),

-- 복음선교
('복음선교-외인 입교권면', '복음선교', '외인 입교 권면 활동'),
('복음선교-교리 중단자 권면', '복음선교', '교리 중단자 권면'),
('복음선교-방문및가두선교', '복음선교', '방문 및 가두선교'),
('복음선교-예비자 관리', '복음선교', '예비자 관리 활동'),
('복음선교-통신 교리자', '복음선교', '통신 교리자 관리'),
('복음선교-교리반협조', '복음선교', '교리반 협조 활동'),

-- 교우돌봄
('교우돌봄-신 영세자 돌봄', '교우돌봄', '신 영세자 돌봄 활동'),
('교우돌봄-교우 가정방문', '교우돌봄', '교우 가정 방문'),
('교우돌봄-냉담 교우 방문', '교우돌봄', '냉담 교우 방문'),
('교우돌봄-혼인 장애자 돌봄', '교우돌봄', '혼인 장애자 돌봄'),
('교우돌봄-판공성사 권면', '교우돌봄', '판공성사 권면'),
('교우돌봄-전입 교우 돌봄', '교우돌봄', '전입 교우 돌봄'),
('교우돌봄-견진성사권면', '교우돌봄', '견진성사 권면'),
('교우돌봄-유아 세례 권면', '교우돌봄', '유아 세례 권면'),
('교우돌봄-군인선원돌봄', '교우돌봄', '군인선원 돌봄'),
('교우돌봄-청소년 돌봄', '교우돌봄', '청소년 돌봄 활동'),

-- 어려운자돌봄
('어려운자돌봄-교우 상가 방문 및 돌봄', '어려운자돌봄', '교우 상가 방문 및 돌봄'),
('어려운자돌봄-교우 환자 방문 및 돌봄', '어려운자돌봄', '교우 환자 방문 및 돌봄'),
('어려운자돌봄-외인환자 방문 및 돌봄', '어려운자돌봄', '외인환자 방문 및 돌봄'),
('어려운자돌봄-외인 상가방문 및 돌봄', '어려운자돌봄', '외인 상가방문 및 돌봄'),
('어려운자돌봄-재해 및 사고 피해자', '어려운자돌봄', '재해 및 사고 피해자 돌봄'),
('어려운자돌봄-다문화가족돌봄', '어려운자돌봄', '다문화가족 돌봄'),
('어려운자돌봄-병원봉사', '어려운자돌봄', '병원봉사 활동'),
('어려운자돌봄-복지시설방문', '어려운자돌봄', '복지시설 방문'),
('어려운자돌봄-대세자돌봄', '어려운자돌봄', '대세자 돌봄'),

-- 레지오활동
('레지오활동-소년 레지오 지도', '레지오활동', '소년 레지오 지도'),
('레지오활동-행동단원 모집', '레지오활동', '행동단원 모집'),
('레지오활동-협조단원 모집. 돌봄', '레지오활동', '협조단원 모집 및 돌봄'),
('레지오활동-Pr설립권면', '레지오활동', 'Pr설립 권면'),
('레지오활동-결석단원돌봄', '레지오활동', '결석단원 돌봄'),
('레지오활동-교본공부', '레지오활동', '교본공부 활동'),
('레지오활동-평의회업무협조', '레지오활동', '평의회 업무 협조'),

-- 본당교회협조
('본당교회협조-본당사도직활동', '본당교회협조', '본당사도직 활동'),
('본당교회협조-행사 준비 및 협조', '본당교회협조', '행사 준비 및 협조'),
('본당교회협조-주일학교 돌봄', '본당교회협조', '주일학교 돌봄'),
('본당교회협조-소공동체활동', '본당교회협조', '소공동체 활동'),
('본당교회협조-사무협조', '본당교회협조', '사무 협조'),
('본당교회협조-회원모집', '본당교회협조', '회원 모집'),
('본당교회협조-전례협조', '본당교회협조', '전례 협조'),
('본당교회협조-피정참가권장', '본당교회협조', '피정 참가 권장'),

-- 기타
('기타-청소 미화', '기타', '청소 및 미화 활동'),
('기타-출판물 보급', '기타', '출판물 보급 활동'),
('기타-생태 환경보호 활동', '기타', '생태 환경보호 활동'),
('기타-특별활동', '기타', '특별 활동'),
('기타-접촉활동', '기타', '접촉 활동'),
('기타-차량봉사및교통정리', '기타', '차량봉사 및 교통정리'),
('기타-기타', '기타', '기타 활동');

-- 4. 인덱스 생성
CREATE INDEX idx_activity_records_category_id ON activity_records(category_id);
CREATE INDEX idx_activity_records_activity_date ON activity_records(activity_date);
CREATE INDEX idx_activity_records_created_at ON activity_records(created_at);

-- 5. 업데이트 트리거 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 6. 업데이트 트리거 생성
CREATE TRIGGER update_activity_records_updated_at 
    BEFORE UPDATE ON activity_records 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 7. 뷰 생성 (카테고리별 통계)
CREATE VIEW activity_summary AS
SELECT 
    ac.category_group,
    ac.category_name,
    COUNT(ar.id) as total_records,
    SUM(ar.count) as total_count,
    SUM(ar.catechism_guide) as total_catechism_guide,
    SUM(ar.group_join) as total_group_join,
    SUM(ar.meeting_head) as total_meeting_head,
    SUM(ar.resolution) as total_resolution,
    SUM(ar.sacrament) as total_sacrament,
    SUM(ar.confirmation) as total_confirmation,
    SUM(ar.baptism) as total_baptism,
    SUM(ar.first_communion) as total_first_communion,
    SUM(ar.year_count) as total_year_count,
    SUM(ar.funeral_mass) as total_funeral_mass,
    SUM(ar.funeral_attendance) as total_funeral_attendance,
    SUM(ar.conditional_baptism) as total_conditional_baptism,
    SUM(ar.conditional_communion) as total_conditional_communion,
    SUM(ar.membership) as total_membership,
    SUM(ar.establishment) as total_establishment
FROM activity_categories ac
LEFT JOIN activity_records ar ON ac.id = ar.category_id
GROUP BY ac.category_group, ac.category_name, ac.id
ORDER BY ac.category_group, ac.category_name;

-- 8. 권한 설정 (필요시)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;
