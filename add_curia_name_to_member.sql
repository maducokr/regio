-- member 테이블에 꾸리아(정식명칭) 컬럼 추가
ALTER TABLE member ADD COLUMN IF NOT EXISTS curia_name VARCHAR(200);
