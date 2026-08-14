-- T 테스트 회원 주간 활동 데이터 (참고용)
--
-- 실제 데이터 삽입: node generate-t-member-weekly-activities.js
--
-- 규칙:
--   - 2025년 1월 첫째 주 월요일(2025-01-06)부터 52주, 각 주 월~토
--   - T% 회원마다 주당 활동종목 5개 랜덤, 횟수 1~10
--   - activity_records.member_id → member(id) WHERE name LIKE 'T%'
--
-- T명단 삭제 시 (기존 API와 동일):
--   DELETE FROM activity_records WHERE member_id IN (SELECT id FROM member WHERE name LIKE 'T%');
--   DELETE FROM member WHERE name LIKE 'T%';

-- 생성 결과 확인
SELECT COUNT(*)::int AS total_records,
       COUNT(DISTINCT ar.member_id)::int AS member_count,
       MIN(ar.activity_date) AS first_date,
       MAX(ar.activity_date) AS last_date
FROM activity_records ar
JOIN member m ON ar.member_id = m.id
WHERE m.name LIKE 'T%';
