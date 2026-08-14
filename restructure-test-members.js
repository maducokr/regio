// T 테스트 회원 이름을 Pr 내 순번 T1~Tn + 성명 형식으로 변경 (인원 삭제 없음)
require('dotenv').config();
require('./lib/local-sample-guard').assertLocalSampleDb();
const { Pool } = require('pg');
const { CHURCH_GROUPS } = require('./assign-test-member-curia');

const PR_DISTRIBUTION = [7, 7, 6, 5];
const KOREAN_NAMES = [
    '김민수','이동식','박철수','최지영','정현우','강수진','윤서연','임동현','한미영','송태호',
    '조은영','신동욱','오혜진','유재석','백지민','남궁민','고은비','문성준','양미경','구자철',
    '손영수','배수정','조현우','홍길동','김철수','박민수','최영수','정민호','강미라','윤지훈',
    '임서준','한소희','송지아','조민재','신유진','오준혁','유나영','백승호','남다은','고태민',
    '문하늘','양지원','구민석','손예진','배준영','조서연','홍민지','김도윤','이서윤','박지호',
    '최유나','정우진','강하은','윤성민','임채원','한지훈','송민서','조예린','신현우','오지민',
    '유서현','백도현','남수아','고준서','김하준','이도윤','박서준','최예준','정시우','강주원',
    '윤건우','임현준','한지후','송연우','조지안','신은우','오민준','유지호','백준우','남시윤',
    '고유준','문지환','양서진','구민준','손도현','배시현','조하준','홍준혁','김서현','이민재',
    '박태윤','최윤서','정하윤','강지유','윤서연','임채은','한수빈','송지우','조예나','신다은',
    '오서윤','유하은','백지아','남수연','고예원','문소율','양채윤','구나은','손하린','배서아',
    '조유진','홍채원','김나연','이소은','박다인','최하연','정유나','강서아','윤채은','임나윤',
    '한예서','송하영','조유나','신서윤','오채아','유지유','백서영','남하윤','고예진','문지은'
];

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: +(process.env.DB_PORT || 5432)
});

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let nameIdx = 0;
        const renames = [];

        for (const group of CHURCH_GROUPS) {
            for (let prIdx = 0; prIdx < group.prs.length; prIdx++) {
                const prName = group.prs[prIdx];
                const targetCount = PR_DISTRIBUTION[prIdx];
                const existing = await client.query(
                    `SELECT id, name FROM member
                     WHERE name LIKE 'T%' AND church_name = $1 AND pr_name = $2
                     ORDER BY id`,
                    [group.church, prName]
                );
                const members = existing.rows.slice(0, targetCount);
                for (let memberIdx = 0; memberIdx < members.length; memberIdx++) {
                    const newName = `T${memberIdx + 1}${KOREAN_NAMES[nameIdx++]}`;
                    renames.push({ id: members[memberIdx].id, newName });
                }
            }
        }

        for (const item of renames) {
            await client.query('UPDATE member SET name = $1 WHERE id = $2', [`T_TMP_${item.id}`, item.id]);
        }
        for (const item of renames) {
            await client.query('UPDATE member SET name = $1 WHERE id = $2', [item.newName, item.id]);
        }

        await client.query('COMMIT');
        console.log(`이름 변경: ${renames.length}명 (삭제 없음)`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('오류:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) main();
