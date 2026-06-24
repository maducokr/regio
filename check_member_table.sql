-- member 테이블의 현재 구조 확인
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'member'
AND table_schema = 'public'
ORDER BY ordinal_position;
