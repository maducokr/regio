// T로 시작하는 테스트 회원에게 성당별 Pr 2개씩 동일한 꾸리아(정식명칭) 부여
// - 각 성당 4개 Pr → 2개 꾸리아 (Pr 1~2번 → 제1꾸리아, Pr 3~4번 → 제2꾸리아)
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

// server.js generate-test-members 와 동일한 성당/Pr/꾸리아 구조
const CHURCH_GROUPS = [
    {
        church: '성모성심성당',
        prs: ['자비의모후', '도움의모후', '승리의모후', '지혜의옥좌'],
        curias: ['성모성심 제1꾸리아', '성모성심 제2꾸리아'],
    },
    {
        church: '성요셉성당',
        prs: ['평화의모후', '신비로운장미', '계약의궤', '새벽별'],
        curias: ['성요셉 제1꾸리아', '성요셉 제2꾸리아'],
    },
    {
        church: '성베드로성당',
        prs: ['천상의모후', '병자의건강', '죄인의의탁', '천사들의모후'],
        curias: ['성베드로 제1꾸리아', '성베드로 제2꾸리아'],
    },
    {
        church: '성바오로성당',
        prs: ['은총의모후', '사도들의모후', '순교자들의모후', '동정녀들의모후'],
        curias: ['성바오로 제1꾸리아', '성바오로 제2꾸리아'],
    },
];

function getCuriaName(church, prName) {
    const group = CHURCH_GROUPS.find(g => g.church === church);
    if (!group) return null;
    const prIndex = group.prs.indexOf(prName);
    if (prIndex < 0) return null;
    return group.curias[Math.floor(prIndex / 2)];
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let totalUpdated = 0;
        for (const group of CHURCH_GROUPS) {
            for (let i = 0; i < group.prs.length; i++) {
                const prName = group.prs[i];
                const curiaName = group.curias[Math.floor(i / 2)];
                const result = await client.query(
                    `UPDATE member
                     SET curia_name = $1
                     WHERE name LIKE 'T%' AND church_name = $2 AND pr_name = $3
                     RETURNING id`,
                    [curiaName, group.church, prName]
                );
                if (result.rowCount > 0) {
                    console.log(`[update] ${group.church} / ${prName} → ${curiaName} (${result.rowCount}명)`);
                    totalUpdated += result.rowCount;
                }
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ T회원 꾸리아 부여 완료: 총 ${totalUpdated}명`);

        const check = await client.query(
            `SELECT church_name, pr_name, curia_name, COUNT(*)::int AS cnt
             FROM member WHERE name LIKE 'T%'
             GROUP BY church_name, pr_name, curia_name
             ORDER BY church_name, pr_name`
        );
        console.log('\n=== 적용 결과 ===');
        check.rows.forEach(r => console.log(` ${r.church_name} | ${r.pr_name} | ${r.curia_name} | ${r.cnt}명`));
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 오류, 롤백:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

module.exports = { CHURCH_GROUPS, getCuriaName };
if (require.main === module) main();
