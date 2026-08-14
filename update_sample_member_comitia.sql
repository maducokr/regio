-- 샘플 회원 세 그룹 꼬미시움 명칭
-- 3~56 → 제1꼬미시움 / 60~105 → 제2꼬미시움 / 106~138 → 제3꼬미시움

ALTER TABLE member ADD COLUMN IF NOT EXISTS comitia_name VARCHAR(200);

UPDATE member SET comitia_name = '제1꼬미시움' WHERE id BETWEEN 3 AND 56;
UPDATE member SET comitia_name = '제2꼬미시움' WHERE id BETWEEN 60 AND 105;
UPDATE member SET comitia_name = '제3꼬미시움' WHERE id BETWEEN 106 AND 138;

SELECT
    CASE
        WHEN id BETWEEN 3 AND 56 THEN '3-56'
        WHEN id BETWEEN 60 AND 105 THEN '60-105'
        WHEN id BETWEEN 106 AND 138 THEN '106-138'
        ELSE 'other'
    END AS grp,
    comitia_name,
    COUNT(*) AS cnt
FROM member
WHERE id BETWEEN 3 AND 138
GROUP BY 1, 2
ORDER BY 1, 2;
