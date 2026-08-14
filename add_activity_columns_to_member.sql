-- member 테이블에 활동 관련 컬럼들 추가
-- PostgreSQL에서 실행할 SQL 스크립트

-- 1. 기도생활 관련 컬럼들
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '기도생활-묵주기도') THEN
        ALTER TABLE member ADD COLUMN "기도생활-묵주기도" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '기도생활-평일미사') THEN
        ALTER TABLE member ADD COLUMN "기도생활-평일미사" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '기도생활-십자가의길') THEN
        ALTER TABLE member ADD COLUMN "기도생활-십자가의길" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '기도생활-성경읽기') THEN
        ALTER TABLE member ADD COLUMN "기도생활-성경읽기" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '기도생활-성경쓰기') THEN
        ALTER TABLE member ADD COLUMN "기도생활-성경쓰기" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '기도생활-소성무일도') THEN
        ALTER TABLE member ADD COLUMN "기도생활-소성무일도" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '기도생활-성체조배') THEN
        ALTER TABLE member ADD COLUMN "기도생활-성체조배" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '기도생활-기타') THEN
        ALTER TABLE member ADD COLUMN "기도생활-기타" INTEGER DEFAULT 0;
    END IF;
END $$;

-- 2. 지구와함께 관련 컬럼들
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '지구와함께-거절하기') THEN
        ALTER TABLE member ADD COLUMN "지구와함께-거절하기" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '지구와함께-아껴쓰기') THEN
        ALTER TABLE member ADD COLUMN "지구와함께-아껴쓰기" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '지구와함께-고쳐쓰기') THEN
        ALTER TABLE member ADD COLUMN "지구와함께-고쳐쓰기" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '지구와함께-재고하기') THEN
        ALTER TABLE member ADD COLUMN "지구와함께-재고하기" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '지구와함께-다시쓰기') THEN
        ALTER TABLE member ADD COLUMN "지구와함께-다시쓰기" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '지구와함께-재생하기') THEN
        ALTER TABLE member ADD COLUMN "지구와함께-재생하기" INTEGER DEFAULT 0;
    END IF;
END $$;

-- 3. 복음선교 관련 컬럼들
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '복음선교-외인 입교권면') THEN
        ALTER TABLE member ADD COLUMN "복음선교-외인 입교권면" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '복음선교-개종권면') THEN
        ALTER TABLE member ADD COLUMN "복음선교-개종권면" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '복음선교-교리 중단자 권면') THEN
        ALTER TABLE member ADD COLUMN "복음선교-교리 중단자 권면" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '복음선교-방문선교') THEN
        ALTER TABLE member ADD COLUMN "복음선교-방문선교" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '복음선교-가두선교') THEN
        ALTER TABLE member ADD COLUMN "복음선교-가두선교" INTEGER DEFAULT 0;
    END IF;
    -- 기존 '복음선교-방문및가두선교' 컬럼은 '방문'/'가두선교'로 분리되어 제거됨
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '복음선교-방문및가두선교') THEN
        ALTER TABLE member DROP COLUMN "복음선교-방문및가두선교";
    END IF;
    -- 기존 '복음선교-예비자 관리' → '복음선교-예비신자관리돌봄' 으로 이름 변경
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '복음선교-예비자 관리') THEN
        ALTER TABLE member RENAME COLUMN "복음선교-예비자 관리" TO "복음선교-예비신자관리돌봄";
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '복음선교-예비신자관리돌봄') THEN
        ALTER TABLE member ADD COLUMN "복음선교-예비신자관리돌봄" INTEGER DEFAULT 0;
    END IF;
    -- 기존 '복음선교-통신 교리자' → '복음선교-통신교리자 돌봄' 으로 이름 변경
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '복음선교-통신 교리자') THEN
        ALTER TABLE member RENAME COLUMN "복음선교-통신 교리자" TO "복음선교-통신교리자 돌봄";
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '복음선교-통신교리자 돌봄') THEN
        ALTER TABLE member ADD COLUMN "복음선교-통신교리자 돌봄" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '복음선교-교리반협조') THEN
        ALTER TABLE member ADD COLUMN "복음선교-교리반협조" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '복음선교-교리반 인도') THEN
        ALTER TABLE member ADD COLUMN "복음선교-교리반 인도" INTEGER DEFAULT 0;
    END IF;
END $$;

-- 4. 교우돌봄 관련 컬럼들
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '교우돌봄-신영세자돌봄(방문)') THEN
        ALTER TABLE member ADD COLUMN "교우돌봄-신영세자돌봄(방문)" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '교우돌봄-교우 가정방문') THEN
        ALTER TABLE member ADD COLUMN "교우돌봄-교우 가정방문" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '교우돌봄-냉담 교우 방문') THEN
        ALTER TABLE member ADD COLUMN "교우돌봄-냉담 교우 방문" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '교우돌봄-냉담교우회두 권면') THEN
        ALTER TABLE member ADD COLUMN "교우돌봄-냉담교우회두 권면" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '교우돌봄-혼인 장애자 돌봄') THEN
        ALTER TABLE member ADD COLUMN "교우돌봄-혼인 장애자 돌봄" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '교우돌봄-판공성사 권면') THEN
        ALTER TABLE member ADD COLUMN "교우돌봄-판공성사 권면" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '교우돌봄-전입교우돌봄(방문)') THEN
        ALTER TABLE member ADD COLUMN "교우돌봄-전입교우돌봄(방문)" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '교우돌봄-견진성사권면') THEN
        ALTER TABLE member ADD COLUMN "교우돌봄-견진성사권면" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '교우돌봄-유아 세례 권면') THEN
        ALTER TABLE member ADD COLUMN "교우돌봄-유아 세례 권면" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '교우돌봄-군인선원돌봄') THEN
        ALTER TABLE member ADD COLUMN "교우돌봄-군인선원돌봄" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '교우돌봄-청소년 돌봄') THEN
        ALTER TABLE member ADD COLUMN "교우돌봄-청소년 돌봄" INTEGER DEFAULT 0;
    END IF;
END $$;

-- 5. 어려운자돌봄 관련 컬럼들
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '어려운자돌봄-교우 상가 방문 및 돌봄') THEN
        ALTER TABLE member ADD COLUMN "어려운자돌봄-교우 상가 방문 및 돌봄" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '어려운자돌봄-교우 환자 방문 및 돌봄') THEN
        ALTER TABLE member ADD COLUMN "어려운자돌봄-교우 환자 방문 및 돌봄" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '어려운자돌봄-외인환자 방문 및 돌봄') THEN
        ALTER TABLE member ADD COLUMN "어려운자돌봄-외인환자 방문 및 돌봄" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '어려운자돌봄-외인 상가방문 및 돌봄') THEN
        ALTER TABLE member ADD COLUMN "어려운자돌봄-외인 상가방문 및 돌봄" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '어려운자돌봄-재해 및 사고 피해자') THEN
        ALTER TABLE member ADD COLUMN "어려운자돌봄-재해 및 사고 피해자" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '어려운자돌봄-다문화가족돌봄') THEN
        ALTER TABLE member ADD COLUMN "어려운자돌봄-다문화가족돌봄" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '어려운자돌봄-병원봉사') THEN
        ALTER TABLE member ADD COLUMN "어려운자돌봄-병원봉사" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '어려운자돌봄-복지시설방문') THEN
        ALTER TABLE member ADD COLUMN "어려운자돌봄-복지시설방문" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '어려운자돌봄-대세자돌봄') THEN
        ALTER TABLE member ADD COLUMN "어려운자돌봄-대세자돌봄" INTEGER DEFAULT 0;
    END IF;
END $$;

-- 6. 소외계층 지원 관련 컬럼들 (사용자가 요청한 이름으로)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '소외계층 지원-비회원 장례 관리') THEN
        ALTER TABLE member ADD COLUMN "소외계층 지원-비회원 장례 관리" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '소외계층 지원-재난 피해자') THEN
        ALTER TABLE member ADD COLUMN "소외계층 지원-재난 피해자" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '소외계층 지원-다문화 가정') THEN
        ALTER TABLE member ADD COLUMN "소외계층 지원-다문화 가정" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '소외계층 지원-병원 서비스') THEN
        ALTER TABLE member ADD COLUMN "소외계층 지원-병원 서비스" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '소외계층 지원-복지 시설 방문') THEN
        ALTER TABLE member ADD COLUMN "소외계층 지원-복지 시설 방문" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '소외계층 지원-조건부 세례 관리') THEN
        ALTER TABLE member ADD COLUMN "소외계층 지원-조건부 세례 관리" INTEGER DEFAULT 0;
    END IF;
END $$;

-- 7. 레지오 활동 관련 컬럼들
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '레지오 활동-청소년 레지오 지침') THEN
        ALTER TABLE member ADD COLUMN "레지오 활동-청소년 레지오 지침" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '레지오 활동-정회원 모집') THEN
        ALTER TABLE member ADD COLUMN "레지오 활동-정회원 모집" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '레지오 활동-보조 회원 관리') THEN
        ALTER TABLE member ADD COLUMN "레지오 활동-보조 회원 관리" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '레지오 활동-Pr 설립') THEN
        ALTER TABLE member ADD COLUMN "레지오 활동-Pr 설립" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '레지오 활동-부재 회원 관리') THEN
        ALTER TABLE member ADD COLUMN "레지오 활동-부재 회원 관리" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '레지오 활동-핸드북 학습') THEN
        ALTER TABLE member ADD COLUMN "레지오 활동-핸드북 학습" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '레지오 활동-평의회 지원') THEN
        ALTER TABLE member ADD COLUMN "레지오 활동-평의회 지원" INTEGER DEFAULT 0;
    END IF;
END $$;

-- 8. 본당 협력 관련 컬럼들
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '본당 협력-본당 사도직') THEN
        ALTER TABLE member ADD COLUMN "본당 협력-본당 사도직" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '본당 협력-행사 지원') THEN
        ALTER TABLE member ADD COLUMN "본당 협력-행사 지원" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '본당 협력-주일학교 돌봄') THEN
        ALTER TABLE member ADD COLUMN "본당 협력-주일학교 돌봄" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '본당 협력-소규모 공동체 활동') THEN
        ALTER TABLE member ADD COLUMN "본당 협력-소규모 공동체 활동" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '본당 협력-행정 지원') THEN
        ALTER TABLE member ADD COLUMN "본당 협력-행정 지원" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '본당 협력-회원 모집') THEN
        ALTER TABLE member ADD COLUMN "본당 협력-회원 모집" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '본당 협력-전례 지원') THEN
        ALTER TABLE member ADD COLUMN "본당 협력-전례 지원" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '본당 협력-피정 지원') THEN
        ALTER TABLE member ADD COLUMN "본당 협력-피정 지원" INTEGER DEFAULT 0;
    END IF;
END $$;

-- 9. 기타 관련 컬럼들
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '기타-청소 및 미화') THEN
        ALTER TABLE member ADD COLUMN "기타-청소 및 미화" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '기타-출판물 배포') THEN
        ALTER TABLE member ADD COLUMN "기타-출판물 배포" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '기타-생태 활동') THEN
        ALTER TABLE member ADD COLUMN "기타-생태 활동" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '기타-특별 활동') THEN
        ALTER TABLE member ADD COLUMN "기타-특별 활동" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '기타-접촉 활동') THEN
        ALTER TABLE member ADD COLUMN "기타-접촉 활동" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '기타-차량 서비스') THEN
        ALTER TABLE member ADD COLUMN "기타-차량 서비스" INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member' AND column_name = '기타-기타') THEN
        ALTER TABLE member ADD COLUMN "기타-기타" INTEGER DEFAULT 0;
    END IF;
END $$;

-- 컬럼 추가 확인
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'member' 
AND column_name LIKE '%-%'
ORDER BY column_name;
