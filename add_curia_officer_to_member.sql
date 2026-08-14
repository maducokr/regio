-- member 테이블에 꾸리아 간부 직책(간부아님/K1~K4) 컬럼 추가
ALTER TABLE member ADD COLUMN IF NOT EXISTS curia_officer VARCHAR(50);
