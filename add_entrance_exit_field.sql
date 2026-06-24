-- 입출관 필드를 활동 매핑 테이블에 추가하는 SQL 스크립트
-- 어려운자돌봄-교우 상가 방문 및 돌봄 종목에만 적용

-- 1. 어려운자돌봄-교우 상가 방문 및 돌봄에 입출관 필드 추가
INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required) VALUES
('어려운자돌봄-교우 상가 방문 및 돌봄', '입출관', '입출관', false)
ON CONFLICT (category_name, field_name) DO NOTHING;

-- 2. 추가된 필드 확인
SELECT 
    category_name, 
    field_name, 
    field_display_name, 
    is_required 
FROM activity_field_mapping 
WHERE field_name = '입출관' 
ORDER BY category_name;

-- 3. 어려운자돌봄-교우 상가 방문 및 돌봄의 전체 필드 확인
SELECT 
    category_name, 
    field_name, 
    field_display_name, 
    is_required 
FROM activity_field_mapping 
WHERE category_name = '어려운자돌봄-교우 상가 방문 및 돌봄'
ORDER BY field_name;
