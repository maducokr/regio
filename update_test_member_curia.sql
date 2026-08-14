-- T로 시작하는 테스트 회원에게 성당별 Pr 2개씩 동일한 꾸리아(정식명칭) 부여
-- Pr 1~2번 → 제1꾸리아, Pr 3~4번 → 제2꾸리아

-- 성모성심성당
UPDATE member SET curia_name = '성모성심 제1꾸리아' WHERE name LIKE 'T%' AND church_name = '성모성심성당' AND pr_name IN ('자비의모후', '도움의모후');
UPDATE member SET curia_name = '성모성심 제2꾸리아' WHERE name LIKE 'T%' AND church_name = '성모성심성당' AND pr_name IN ('승리의모후', '지혜의옥좌');

-- 성요셉성당
UPDATE member SET curia_name = '성요셉 제1꾸리아' WHERE name LIKE 'T%' AND church_name = '성요셉성당' AND pr_name IN ('평화의모후', '신비로운장미');
UPDATE member SET curia_name = '성요셉 제2꾸리아' WHERE name LIKE 'T%' AND church_name = '성요셉성당' AND pr_name IN ('계약의궤', '새벽별');

-- 성베드로성당
UPDATE member SET curia_name = '성베드로 제1꾸리아' WHERE name LIKE 'T%' AND church_name = '성베드로성당' AND pr_name IN ('천상의모후', '병자의건강');
UPDATE member SET curia_name = '성베드로 제2꾸리아' WHERE name LIKE 'T%' AND church_name = '성베드로성당' AND pr_name IN ('죄인의의탁', '천사들의모후');

-- 성바오로성당
UPDATE member SET curia_name = '성바오로 제1꾸리아' WHERE name LIKE 'T%' AND church_name = '성바오로성당' AND pr_name IN ('은총의모후', '사도들의모후');
UPDATE member SET curia_name = '성바오로 제2꾸리아' WHERE name LIKE 'T%' AND church_name = '성바오로성당' AND pr_name IN ('순교자들의모후', '동정녀들의모후');

-- 확인
SELECT church_name, pr_name, curia_name, COUNT(*) AS cnt
FROM member WHERE name LIKE 'T%'
GROUP BY church_name, pr_name, curia_name
ORDER BY church_name, pr_name;
