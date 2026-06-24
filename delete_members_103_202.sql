-- member 테이블에서 ID 103번부터 202번까지의 데이터 삭제
-- 삭제 전 데이터 확인
SELECT 
    id,
    name,
    phone_last4,
    resident_id_front6,
    phone_full,
    resident_id_full,
    created_at,
    updated_at
FROM member 
WHERE id BETWEEN 103 AND 202
ORDER BY id;

-- 삭제 실행
DELETE FROM member 
WHERE id BETWEEN 103 AND 202;

-- 삭제 후 확인
SELECT 
    '삭제된 레코드 수' as info,
    COUNT(*) as count
FROM member 
WHERE id BETWEEN 103 AND 202;

-- 전체 member 테이블 상태 확인
SELECT 
    '전체 회원 수' as info,
    COUNT(*) as total_count,
    MIN(id) as min_id,
    MAX(id) as max_id
FROM member; 