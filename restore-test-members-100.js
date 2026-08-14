// T 테스트 회원 100명 유지: Pr별 7/7/6/5명 복구 + T1~Tn 이름 부여 (삭제 없음)
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
const BAPTISMAL_NAMES = ['마리아','요셉','베드로','바오로','요한','루카','마르코','마태오','안드레아','야고보',
    '토마스','스테파노','테레사','카타리나','루치아','아가타','체칠리아','안나','엘리사벳','클라라'];

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: +(process.env.DB_PORT || 5432)
});

const pad = (n, len) => String(n).padStart(len, '0');
const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const genBirth6 = () => pad(randInt(0, 99), 2) + pad(randInt(1, 12), 2) + pad(randInt(1, 28), 2);
const genPhoneFull = () => `010-${pad(randInt(0, 9999), 4)}-${pad(randInt(0, 9999), 4)}`;
const extractPhoneLast4 = (phoneFull) => {
    const digits = String(phoneFull || '').replace(/\D/g, '');
    return digits.slice(-4).padStart(4, '0');
};

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let nameIdx = 0;
        let baptismIdx = 0;
        let added = 0;
        const renames = [];

        for (const group of CHURCH_GROUPS) {
            for (let prIdx = 0; prIdx < group.prs.length; prIdx++) {
                const prName = group.prs[prIdx];
                const curiaName = group.curias[Math.floor(prIdx / 2)];
                const targetCount = PR_DISTRIBUTION[prIdx];

                const existing = await client.query(
                    `SELECT id, name FROM member
                     WHERE name LIKE 'T%' AND church_name = $1 AND pr_name = $2
                     ORDER BY id`,
                    [group.church, prName]
                );
                const members = [...existing.rows];

                while (members.length < targetCount) {
                    const birth6 = genBirth6();
                    const phoneFull = genPhoneFull();
                    const phoneLast4 = extractPhoneLast4(phoneFull);
                    const passno = phoneLast4 + birth6;
                    const tempName = `T_NEW_${group.church}_${prName}_${members.length}`;
                    const baptismalName = BAPTISMAL_NAMES[baptismIdx % BAPTISMAL_NAMES.length];
                    baptismIdx++;

                    const inserted = await client.query(
                        `INSERT INTO member
                            (name, baptism_name, church_name, curia_name, pr_name, position,
                             phone_last4, resident_id_front6, phone_full, passno)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                         RETURNING id, name`,
                        [tempName, baptismalName, group.church, curiaName, prName, '단원',
                         phoneLast4, birth6, phoneFull, passno]
                    );
                    members.push(inserted.rows[0]);
                    added++;
                }

                members.sort((a, b) => a.id - b.id);
                for (let memberIdx = 0; memberIdx < targetCount; memberIdx++) {
                    const member = members[memberIdx];
                    const newName = `T${memberIdx + 1}${KOREAN_NAMES[nameIdx++]}`;
                    renames.push({ id: member.id, oldName: member.name, newName });
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
        console.log(`추가: ${added}명, 이름 변경: ${renames.length}명`);

        const check = await client.query(
            `SELECT church_name, pr_name, COUNT(*)::int AS cnt,
                    array_agg(name ORDER BY name) AS names
             FROM member WHERE name LIKE 'T%'
             GROUP BY church_name, pr_name
             ORDER BY church_name, pr_name`
        );
        console.log('\n=== 적용 결과 ===');
        check.rows.forEach(r => {
            console.log(`${r.church_name} | ${r.pr_name} | ${r.cnt}명`);
            console.log(`  ${r.names.join(', ')}`);
        });
        const total = await client.query(`SELECT COUNT(*)::int AS cnt FROM member WHERE name LIKE 'T%'`);
        console.log(`\n총 T회원: ${total.rows[0].cnt}명`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('오류:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
