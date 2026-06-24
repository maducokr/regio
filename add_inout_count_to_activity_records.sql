-- activity_records 테이블에 inout_count 컬럼 추가
ALTER TABLE public.activity_records ADD COLUMN IF NOT EXISTS inout_count integer DEFAULT 0;

-- 컬럼 추가 확인을 위한 주석
-- 컬럼 추가 확인을 위한 주석
-- 컬럼 추가 확인을 위한 주석
