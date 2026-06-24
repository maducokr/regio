-- activity_records 테이블에 member_id 컬럼 추가
ALTER TABLE activity_records ADD COLUMN member_id INTEGER REFERENCES member(id);

-- 기존 데이터가 있다면 기본값 설정 (필요한 경우)
-- UPDATE activity_records SET member_id = 1 WHERE member_id IS NULL;
