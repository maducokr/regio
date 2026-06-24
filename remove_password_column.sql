-- password 컬럼 삭제
ALTER TABLE member DROP COLUMN password;

-- 컬럼이 삭제되었는지 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'member'
AND table_schema = 'public'
ORDER BY ordinal_position;
