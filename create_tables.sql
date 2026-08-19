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
    memorial_mass INTEGER DEFAULT 0, -- 추모미사
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

-- 가정성화활동
('가정성화활동-가족이함께기도하기', '가정성화활동', '가족이 함께 기도하기'),
('가정성화활동-성경봉독 및 묵상', '가정성화활동', '성경봉독 및 묵상'),
('가정성화활동-미사참례', '가정성화활동', '가족 미사참례'),
('가정성화활동-가족단위 복지시설봉사', '가정성화활동', '가족단위 복지시설 봉사'),

-- 지구와함께
('지구와함께-거절하기', '지구와함께', '불필요한 소비 거절'),
('지구와함께-아껴쓰기', '지구와함께', '자원 절약 활동'),
('지구와함께-고쳐쓰기', '지구와함께', '물건 수리 재사용'),
('지구와함께-재고하기', '지구와함께', '재고 관리 활동'),
('지구와함께-다시쓰기', '지구와함께', '재활용 활동'),
('지구와함께-재생하기', '지구와함께', '재생 자원 활용'),

-- 복음선교
('복음선교-외인 입교권면', '복음선교', '외인 입교 권면 활동'),
('복음선교-개종권면', '복음선교', '개종 권면 활동'),
('복음선교-교리 중단자 권면', '복음선교', '교리 중단자 권면'),
('복음선교-방문선교', '복음선교', '방문 선교 활동'),
('복음선교-가두선교', '복음선교', '가두 선교 활동'),
('복음선교-예비신자관리돌봄', '복음선교', '예비신자 관리 및 돌봄 활동'),
('복음선교-통신교리자 돌봄', '복음선교', '통신 교리자 돌봄 활동'),
('복음선교-교리반협조', '복음선교', '교리반 협조 활동'),
('복음선교-교리반 인도', '복음선교', '교리반 인도 활동'),
('복음선교-교리반인도예비자', '복음선교', '교리반 인도 예비자 활동'),

-- 예비신자 돌봄
('예비신자 돌봄-예비신자 돌봄', '예비신자 돌봄', '예비신자 돌봄 활동'),
('예비신자 돌봄-통신교리자 돌봄', '예비신자 돌봄', '통신교리자 돌봄 활동'),
('예비신자 돌봄-교리반 봉사', '예비신자 돌봄', '교리반 봉사 활동'),

-- 교우돌봄
('교우돌봄-신영세자돌봄(방문)', '교우돌봄', '신영세자돌봄(방문) 활동'),
('교우돌봄-교우 가정방문', '교우돌봄', '교우 가정 방문'),
('교우돌봄-냉담 교우 방문', '교우돌봄', '냉담 교우 방문'),
('교우돌봄-냉담교우회두 권면', '교우돌봄', '냉담 교우 회두 권면'),
('교우돌봄-혼인 장애자 돌봄', '교우돌봄', '혼인 장애자 돌봄'),
('교우돌봄-판공성사 권면', '교우돌봄', '판공성사 권면'),
('교우돌봄-전입교우돌봄(방문)', '교우돌봄', '전입교우돌봄(방문) 활동'),
('교우돌봄-견진성사권면', '교우돌봄', '견진성사 권면'),
('교우돌봄-유아 세례 권면', '교우돌봄', '유아 세례 권면'),
('교우돌봄-첫영성체', '교우돌봄', '첫영성체 권면·지도 활동'),
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
('본당교회협조-호구방문', '본당교회협조', '호구 방문 활동'),
('본당교회협조-제구돌보기', '본당교회협조', '제구 돌보기 활동'),
('본당교회협조-보미사', '본당교회협조', '보미사 활동'),
('본당교회협조-본당사도직활동', '본당교회협조', '본당사도직 활동'),
('본당교회협조-행사 준비 및 협조', '본당교회협조', '행사 준비 및 협조'),
('본당교회협조-주일학교 돌봄', '본당교회협조', '주일학교 돌봄'),
('본당교회협조-소공동체모임참석', '본당교회협조', '소공동체 모임 참석'),
('본당교회협조-구역반장교육참석', '본당교회협조', '구역반장 교육 참석'),
('본당교회협조-반모임 참석권유', '본당교회협조', '반모임 참석 권유'),
('본당교회협조-사무협조', '본당교회협조', '사무 협조'),
('본당교회협조-회원모집', '본당교회협조', '회원 모집'),
('본당교회협조-전례협조', '본당교회협조', '전례 협조'),
('본당교회협조-피정참가권장', '본당교회협조', '피정 참가 권장'),
('본당교회협조-청소및미화', '본당교회협조', '청소 및 미화 활동'),
('본당교회협조-미사안내봉사', '본당교회협조', '미사 안내 봉사'),
('본당교회협조-기타본당협조', '본당교회협조', '기타 본당 협조 활동'),

-- 본당교회협조 (구 소공동체활동)
('본당교회협조-반모임참석', '본당교회협조', '반모임 참석 활동'),
('본당교회협조-구역반장교육및모임참석', '본당교회협조', '구역반장 교육 및 모임 참석'),
('본당교회협조-직장공동체활동', '본당교회협조', '직장 공동체 활동'),

-- 특별활동
('특별활동-재해피해자돌봄', '특별활동', '재해 피해자 돌봄 활동'),
('특별활동-사고피해자돌봄', '특별활동', '사고 피해자 돌봄 활동'),
('특별활동-복지시설노력봉사', '특별활동', '복지시설 노력봉사 활동'),
('특별활동-병원방문', '특별활동', '병원 방문 활동'),
('특별활동-호구조사', '특별활동', '호구조사(호별방문) 활동'),

-- 자연보호
('자연보호-생태 환경보호 활동', '자연보호', '생태 환경보호 활동'),
('자연보호-자연보호활동', '자연보호', '자연보호 활동'),
('자연보호-환경정화', '자연보호', '환경정화 활동'),

-- 기타활동
('기타활동-선교회협조', '기타활동', '선교회 협조 활동'),
('기타활동-청소 미화', '기타활동', '청소 및 미화 활동'),
('기타활동-출판물 보급', '기타활동', '출판물 보급 활동'),
('기타활동-특별활동', '기타활동', '특별 활동'),
('기타활동-접촉활동', '기타활동', '접촉 활동'),
('기타활동-차량봉사및교통정리', '기타활동', '차량봉사 및 교통정리'),
('기타활동-기타', '기타활동', '기타 활동'),
('기타활동-기타사목활동', '기타활동', '기타 사목 활동'),
('기타활동-기타교구행사참석', '기타활동', '기타 교구 행사 참석 활동');

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
    SUM(ar.memorial_mass) as total_memorial_mass,
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
