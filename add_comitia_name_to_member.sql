-- member.comitia_name (꼬미시움) — G1·G2 등록 시 사용
ALTER TABLE member ADD COLUMN IF NOT EXISTS comitia_name VARCHAR(200);
