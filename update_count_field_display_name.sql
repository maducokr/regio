-- 활동자료 입력 필드 표시명: 횟수(회,단,시간) → 횟수(회,단,시간,명)
UPDATE activity_field_mapping
SET field_display_name = '횟수(회,단,시간,명)'
WHERE field_display_name = '횟수(회,단,시간)'
   OR (field_name IN ('횟수', 'count') AND field_display_name LIKE '횟수(회,단,시간)%' AND field_display_name <> '횟수(회,단,시간,명)');
