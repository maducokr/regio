-- 활동 종목과 활동자료 입력 필드 매핑 테이블 생성
-- PostgreSQL에서 실행할 SQL 스크립트

-- 1. 활동 매핑 테이블 생성
CREATE TABLE IF NOT EXISTS activity_field_mapping (
    id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL,
    field_name VARCHAR(50) NOT NULL,
    field_display_name VARCHAR(50) NOT NULL,
    field_type VARCHAR(20) DEFAULT 'integer',
    is_required BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_name, field_name)
);

-- 2. 매핑 데이터 삽입
INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required) VALUES
-- 기도생활
('기도생활-묵주기도', '횟수', '횟수(회,단,시간,명)', true),
('기도생활-평일미사', '횟수', '횟수(회,단,시간,명)', true),
('기도생활-십자가의길', '횟수', '횟수(회,단,시간,명)', true),
('기도생활-성경읽기', '횟수', '횟수(회,단,시간,명)', true),
('기도생활-성경쓰기', '횟수', '횟수(회,단,시간,명)', true),
('기도생활-소성무일도', '횟수', '횟수(회,단,시간,명)', true),
('기도생활-성체조배', '횟수', '횟수(회,단,시간,명)', true),
('기도생활-기타', '횟수', '횟수(회,단,시간,명)', true),

-- 가정성화활동
('가정성화활동-가족이함께기도하기', '횟수', '횟수(회,단,시간,명)', true),
('가정성화활동-성경봉독 및 묵상', '횟수', '횟수(회,단,시간,명)', true),
('가정성화활동-미사참례', '횟수', '횟수(회,단,시간,명)', true),
('가정성화활동-가족단위 복지시설봉사', '횟수', '횟수(회,단,시간,명)', true),

-- 지구와함께
('지구와함께-거절하기', '횟수', '횟수(회,단,시간,명)', true),
('지구와함께-아껴쓰기', '횟수', '횟수(회,단,시간,명)', true),
('지구와함께-고쳐쓰기', '횟수', '횟수(회,단,시간,명)', true),
('지구와함께-재고하기', '횟수', '횟수(회,단,시간,명)', true),
('지구와함께-다시쓰기', '횟수', '횟수(회,단,시간,명)', true),
('지구와함께-재생하기', '횟수', '횟수(회,단,시간,명)', true),

-- 복음선교
('복음선교-외인 입교권면', '횟수', '횟수(회,단,시간,명)', true),
('복음선교-외인 입교권면', '교리반인도', '교리반인도', false),
('복음선교-개종권면', '횟수', '횟수(회,단,시간,명)', true),
('복음선교-개종권면', '교리반인도', '교리반인도', false),
('복음선교-교리 중단자 권면', '횟수', '횟수(회,단,시간,명)', true),
('복음선교-교리 중단자 권면', '교리반인도', '교리반인도', false),
('복음선교-방문선교', '횟수', '횟수(회,단,시간,명)', true),
('복음선교-방문선교', '교리반인도', '교리반인도', false),
('복음선교-가두선교', '횟수', '횟수(회,단,시간,명)', true),
('복음선교-가두선교', '교리반인도', '교리반인도', false),
('복음선교-예비신자관리돌봄', '횟수', '횟수(회,단,시간,명)', true),
('복음선교-예비신자관리돌봄', '세례', '세례', false),
('복음선교-통신교리자 돌봄', '횟수', '횟수(회,단,시간,명)', true),
('복음선교-통신교리자 돌봄', '세례', '세례', false),
('복음선교-교리반협조', '횟수', '횟수(회,단,시간,명)', true),
('복음선교-교리반 인도', '횟수', '횟수(회,단,시간,명)', true),
('복음선교-교리반인도예비자', '횟수', '횟수(회,단,시간,명)', true),

-- 예비자 돌봄
('예비자 돌봄-교리반 인도', '횟수', '횟수(회,단,시간,명)', true),
('예비자 돌봄-교리반 인도', '세례', '세례자 () 명', false),
('예비자 돌봄-타인이인도한예비신자', '횟수', '횟수(회,단,시간,명)', true),
('예비자 돌봄-타인이인도한예비신자', '세례', '세례자 () 명', false),
('예비자 돌봄-통신교리자', '횟수', '횟수(회,단,시간,명)', true),
('예비자 돌봄-통신교리자', '세례', '세례자 () 명', false),

-- 교우돌봄
('교우돌봄-신영세자돌봄(방문)', '횟수', '횟수(회,단,시간,명)', true),
('교우돌봄-신영세자돌봄(방문)', '단체가입', '단체가입', false),
('교우돌봄-교우 가정방문', '횟수', '횟수(회,단,시간,명)', true),
('교우돌봄-교우 가정방문', '단체가입', '단체가입', false),
('교우돌봄-냉담 교우 방문', '횟수', '횟수(회,단,시간,명)', true),
('교우돌봄-냉담 교우 방문', '회두', '회두', false),
('교우돌봄-냉담교우회두 권면', '횟수', '횟수(회,단,시간,명)', true),
('교우돌봄-냉담교우회두 권면', '회두', '회두', false),
('교우돌봄-혼인 장애자 돌봄', '횟수', '횟수(회,단,시간,명)', true),
('교우돌봄-혼인 장애자 돌봄', '해소', '해소', false),
('교우돌봄-판공성사 권면', '횟수', '횟수(회,단,시간,명)', true),
('교우돌봄-판공성사 권면', '성사', '성사', false),
('교우돌봄-전입교우돌봄(방문)', '횟수', '횟수(회,단,시간,명)', true),
('교우돌봄-전입교우돌봄(방문)', '단체가입', '단체가입', false),
('교우돌봄-견진성사권면', '횟수', '횟수(회,단,시간,명)', true),
('교우돌봄-견진성사권면', '견진', '견진', false),
('교우돌봄-유아 세례 권면', '횟수', '횟수(회,단,시간,명)', true),
('교우돌봄-유아 세례 권면', '세례', '세례', false),
('교우돌봄-군인선원돌봄', '횟수', '횟수(회,단,시간,명)', true),
('교우돌봄-군인선원돌봄', '첫영성체', '첫영성체', false),
('교우돌봄-청소년 돌봄', '횟수', '횟수(회,단,시간,명)', true),

-- 어려운자돌봄
('어려운자돌봄-교우 상가 방문 및 돌봄', '횟수', '횟수(회,단,시간,명)', true),
('어려운자돌봄-교우 상가 방문 및 돌봄', '연도', '연도', false),
('어려운자돌봄-교우 상가 방문 및 돌봄', '장지참석', '장지참석', false),
('어려운자돌봄-교우 상가 방문 및 돌봄', '장례미사', '장례미사', false),
('어려운자돌봄-교우 상가 방문 및 돌봄', '추모미사', '추모미사', false),
('어려운자돌봄-교우 환자 방문 및 돌봄', '성사', '병자성사', false),
('어려운자돌봄-교우 환자 방문 및 돌봄', '첫영성체', '병자영성체', false),
('어려운자돌봄-외인환자 방문 및 돌봄', '횟수', '횟수(회,단,시간,명)', true),
('어려운자돌봄-외인환자 방문 및 돌봄', '대세', '대세', false),
('어려운자돌봄-외인환자 방문 및 돌봄', '보례', '보례', false),
('어려운자돌봄-외인 상가방문 및 돌봄', '횟수', '횟수(회,단,시간,명)', true),
('어려운자돌봄-재해 및 사고 피해자', '횟수', '횟수(회,단,시간,명)', true),
('어려운자돌봄-다문화가족돌봄', '횟수', '횟수(회,단,시간,명)', true),
('어려운자돌봄-병원봉사', '횟수', '횟수(회,단,시간,명)', true),
('어려운자돌봄-복지시설방문', '횟수', '횟수(회,단,시간,명)', true),
('어려운자돌봄-대세자돌봄', '횟수', '횟수(회,단,시간,명)', true),
('어려운자돌봄-대세자돌봄', '교리반인도', '교리반인도', false),

-- 레지오활동
('레지오활동-소년 레지오 지도', '횟수', '횟수(회,단,시간,명)', true),
('레지오활동-행동단원 모집', '입단', '입단', true),
('레지오활동-협조단원 모집. 돌봄', '입단', '입단', true),
('레지오활동-Pr설립권면', '설립', '설립', true),
('레지오활동-결석단원돌봄', '횟수', '횟수(회,단,시간,명)', true),
('레지오활동-교본공부', '횟수', '횟수(회,단,시간,명)', true),
('레지오활동-평의회업무협조', '횟수', '횟수(회,단,시간,명)', true),

-- 본당교회협조
('본당교회협조-호구방문', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-제구돌보기', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-보미사', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-본당사도직활동', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-행사 준비 및 협조', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-주일학교 돌봄', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-소공동체모임참석', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-구역반장교육참석', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-반모임 참석권유', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-사무협조', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-회원모집', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-전례협조', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-피정참가권장', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-피정참가권장', 'membership', '피정참가 () 명', false),
('본당교회협조-피정참가권장', 'establishment', '교육참가 () 명', false),
('본당교회협조-청소및미화', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-미사안내봉사', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-기타본당협조', '횟수', '횟수(회,단,시간,명)', true),

-- 본당교회협조 (구 소공동체활동)
('본당교회협조-반모임참석', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-구역반장교육및모임참석', '횟수', '횟수(회,단,시간,명)', true),
('본당교회협조-직장공동체활동', '횟수', '횟수(회,단,시간,명)', true),

-- 특별활동
('특별활동-재해피해자돌봄', '횟수', '횟수(회,단,시간,명)', true),
('특별활동-사고피해자돌봄', '횟수', '횟수(회,단,시간,명)', true),
('특별활동-복지시설노력봉사', '횟수', '횟수(회,단,시간,명)', true),
('특별활동-병원방문', '횟수', '횟수(회,단,시간,명)', true),

-- 자연보호
('자연보호-생태 환경보호 활동', '횟수', '횟수(회,단,시간,명)', true),
('자연보호-자연보호활동', '횟수', '횟수(회,단,시간,명)', true),
('자연보호-환경정화', '횟수', '횟수(회,단,시간,명)', true),

-- 기타활동
('기타활동-선교회협조', '횟수', '횟수(회,단,시간,명)', true),
('기타활동-청소 미화', '횟수', '횟수(회,단,시간,명)', true),
('기타활동-출판물 보급', '횟수', '횟수(회,단,시간,명)', true),
('기타활동-특별활동', '횟수', '횟수(회,단,시간,명)', true),
('기타활동-접촉활동', '횟수', '횟수(회,단,시간,명)', true),
('기타활동-차량봉사및교통정리', '횟수', '횟수(회,단,시간,명)', true),
('기타활동-기타', '횟수', '횟수(회,단,시간,명)', true),
('기타활동-기타사목활동', '횟수', '횟수(회,단,시간,명)', true),
('기타활동-기타교구행사참석', '횟수', '횟수(회,단,시간,명)', true)
ON CONFLICT (category_name, field_name) DO NOTHING;

-- 3. 활동 입력 테이블 생성 (실제 활동 데이터 저장용)
CREATE TABLE IF NOT EXISTS activity_inputs (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES member(id),
    category_name VARCHAR(100) NOT NULL,
    field_name VARCHAR(50) NOT NULL,
    field_value INTEGER DEFAULT 0,
    activity_date DATE DEFAULT CURRENT_DATE,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(member_id, category_name, field_name, activity_date)
);

-- 4. 인덱스 생성
CREATE INDEX idx_activity_inputs_member_id ON activity_inputs(member_id);
CREATE INDEX idx_activity_inputs_category ON activity_inputs(category_name);
CREATE INDEX idx_activity_inputs_date ON activity_inputs(activity_date);
CREATE INDEX idx_activity_inputs_member_date ON activity_inputs(member_id, activity_date);

-- 5. 업데이트 트리거 함수 (이미 존재하는 경우 무시)
CREATE OR REPLACE FUNCTION update_activity_inputs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 6. 업데이트 트리거 생성
DROP TRIGGER IF EXISTS update_activity_inputs_updated_at ON activity_inputs;
CREATE TRIGGER update_activity_inputs_updated_at 
    BEFORE UPDATE ON activity_inputs 
    FOR EACH ROW 
    EXECUTE FUNCTION update_activity_inputs_updated_at();

-- 7. 뷰 생성 (활동 요약 조회용)
CREATE OR REPLACE VIEW activity_summary_view AS
SELECT 
    ai.member_id,
    m.name as member_name,
    ai.category_name,
    afm.field_name,
    afm.field_display_name,
    SUM(ai.field_value) as total_value,
    COUNT(ai.id) as activity_count,
    MIN(ai.activity_date) as first_activity,
    MAX(ai.activity_date) as last_activity
FROM activity_inputs ai
JOIN member m ON ai.member_id = m.id
JOIN activity_field_mapping afm ON ai.category_name = afm.category_name AND ai.field_name = afm.field_name
GROUP BY ai.member_id, m.name, ai.category_name, afm.field_name, afm.field_display_name
ORDER BY ai.member_id, ai.category_name, afm.field_name;

-- 8. 확인 쿼리
SELECT 
    category_name,
    string_agg(field_display_name, ', ' ORDER BY field_name) as available_fields,
    COUNT(*) as field_count
FROM activity_field_mapping 
GROUP BY category_name 
ORDER BY category_name;
