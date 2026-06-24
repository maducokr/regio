-- activity_records 테이블에 inout_count 컬럼 추가
-- 입출관 필드를 위한 컬럼

ALTER TABLE activity_records ADD COLUMN inout_count INTEGER DEFAULT 0;

-- 컬럼 추가 확인
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'activity_records' AND column_name = 'inout_count';

-- 기존 데이터 확인 (새로 추가된 컬럼은 NULL이므로 기본값 0으로 설정)
UPDATE activity_records SET inout_count = 0 WHERE inout_count IS NULL;

-- 컬럼 설명 추가 (PostgreSQL에서만 작동)
COMMENT ON COLUMN activity_records.inout_count IS '입출관 횟수';
