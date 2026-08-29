/**
 * 소년 활동종목 및 세목, 활동요약(필드매핑) DB 등록 스크립트
 * 사용: node add-junior-activity-categories.js [--render]
 */
const path = require('path');
const { Pool } = require('pg');

try {
    require('dotenv').config();
} catch (_) {}

const useRender = process.argv.includes('--render');
if (useRender) {
    require('dotenv').config({ path: path.join(__dirname, '.env.render'), override: true });
}

function createPool() {
    if (useRender && process.env.DATABASE_URL) {
        return new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
    }
    return new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'regio',
        password: String(process.env.DB_PASSWORD || '5854'),
        port: parseInt(process.env.DB_PORT || '5432', 10)
    });
}

const JUNIOR_ITEMS = [
    // 1. 가톨릭 알리기
    {
        group: '가톨릭 알리기',
        item: '친구, 가족 성당 오게 하기',
        desc: '친구, 가족 성당 오게 하기 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'catechism_guide', display: '교리반인도 () 명', required: false },
            { name: 'baptism', display: '세례자 () 명', required: false }
        ]
    },
    {
        group: '가톨릭 알리기',
        item: '교리 중단자 찾아가기',
        desc: '교리 중단자 찾아가기 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'catechism_guide', display: '교리반인도 () 명', required: false },
            { name: 'baptism', display: '세례자 () 명', required: false }
        ]
    },
    {
        group: '가톨릭 알리기',
        item: '가정을 방문하여 선교 활동',
        desc: '가정을 방문하여 선교 활동 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'catechism_guide', display: '교리반인도 () 명', required: false },
            { name: 'baptism', display: '세례자 () 명', required: false }
        ]
    },
    {
        group: '가톨릭 알리기',
        item: '타인이 입교, 개종 권면한 예비신자 돌봄',
        desc: '타인이 입교, 개종 권면한 예비신자 돌봄 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'catechism_guide', display: '교리반인도 () 명', required: false },
            { name: 'baptism', display: '세례자 () 명', required: false }
        ]
    },
    {
        group: '가톨릭 알리기',
        item: '성당 자랑',
        desc: '성당 자랑 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'catechism_guide', display: '교리반인도 () 명', required: false },
            { name: 'baptism', display: '세례자 () 명', required: false }
        ]
    },

    // 2. 교우 돌보기
    {
        group: '교우 돌보기',
        item: '신자 가정의 방문',
        desc: '신자 가정의 방문 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'meeting_head', display: '회두 () 명', required: false },
            { name: 'sacrament', display: '성사 () 명', required: false },
            { name: 'first_communion', display: '첫영성체 () 명', required: false }
        ]
    },
    {
        group: '교우 돌보기',
        item: '교우 환자 방문',
        desc: '교우 환자 방문 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'meeting_head', display: '회두 () 명', required: false },
            { name: 'sacrament', display: '성사 () 명', required: false },
            { name: 'first_communion', display: '첫영성체 () 명', required: false }
        ]
    },
    {
        group: '교우 돌보기',
        item: '쉬고 있는 친구 성당 오게 하기',
        desc: '쉬고 있는 친구 성당 오게 하기 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'meeting_head', display: '회두 () 명', required: false },
            { name: 'sacrament', display: '성사 () 명', required: false },
            { name: 'first_communion', display: '첫영성체 () 명', required: false }
        ]
    },
    {
        group: '교우 돌보기',
        item: '판공 성사, 견진 성사 받도록 하기',
        desc: '판공 성사, 견진 성사 받도록 하기 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'meeting_head', display: '회두 () 명', required: false },
            { name: 'sacrament', display: '성사 () 명', required: false },
            { name: 'first_communion', display: '첫영성체 () 명', required: false }
        ]
    },
    {
        group: '교우 돌보기',
        item: '첫영성체 하도록 권유하기',
        desc: '첫영성체 하도록 권유하기 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'meeting_head', display: '회두 () 명', required: false },
            { name: 'sacrament', display: '성사 () 명', required: false },
            { name: 'first_communion', display: '첫영성체 () 명', required: false }
        ]
    },

    // 3. 이웃 돌보기
    {
        group: '이웃 돌보기',
        item: '이사 온 친구를 위한 활동',
        desc: '이사 온 친구를 위한 활동 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'resolution', display: '선행 () 회', required: false },
            { name: 'sacrament', display: '희생 () 회', required: false }
        ]
    },
    {
        group: '이웃 돌보기',
        item: '다문화 가정 친구 방문 및 돌봄',
        desc: '다문화 가정 친구 방문 및 돌봄 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'resolution', display: '선행 () 회', required: false },
            { name: 'sacrament', display: '희생 () 회', required: false }
        ]
    },
    {
        group: '이웃 돌보기',
        item: '아픈 친구 방문, 학교 소식 전달, 가방 들어주기',
        desc: '아픈 친구 방문, 학교 소식 전달, 가방 들어주기 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'resolution', display: '선행 () 회', required: false },
            { name: 'sacrament', display: '희생 () 회', required: false }
        ]
    },
    {
        group: '이웃 돌보기',
        item: '복지시설을 방문하여 봉사 활동',
        desc: '복지시설을 방문하여 봉사 활동 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'resolution', display: '선행 () 회', required: false },
            { name: 'sacrament', display: '희생 () 회', required: false }
        ]
    },

    // 4. 레지오 알리기
    {
        group: '레지오 알리기',
        item: '행동 단원 모집',
        desc: '행동 단원 모집 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'membership', display: '행동단원입단 () 명', required: false },
            { name: 'group_join', display: '협조단원입단 () 명', required: false }
        ]
    },
    {
        group: '레지오 알리기',
        item: '협조 단원 모집',
        desc: '협조 단원 모집 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'membership', display: '행동단원입단 () 명', required: false },
            { name: 'group_join', display: '협조단원입단 () 명', required: false }
        ]
    },
    {
        group: '레지오 알리기',
        item: '교본 공부 하기',
        desc: '교본 공부 하기 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'membership', display: '행동단원입단 () 명', required: false },
            { name: 'group_join', display: '협조단원입단 () 명', required: false }
        ]
    },
    {
        group: '레지오 알리기',
        item: '레지오 기도문 바치기',
        desc: '레지오 기도문 바치기 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'membership', display: '행동단원입단 () 명', required: false },
            { name: 'group_join', display: '협조단원입단 () 명', required: false }
        ]
    },
    {
        group: '레지오 알리기',
        item: '주회에 결석하는 단원 방문',
        desc: '주회에 결석하는 단원 방문 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'membership', display: '행동단원입단 () 명', required: false },
            { name: 'group_join', display: '협조단원입단 () 명', required: false }
        ]
    },

    // 5. 본당 도와주기
    {
        group: '본당 도와주기',
        item: '성탄, 부활, 본당의 날, 주일학교, 행사 돕기',
        desc: '성탄, 부활, 본당의 날, 주일학교, 행사 돕기 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },
    {
        group: '본당 도와주기',
        item: '전례 협조(주보 정리, 해설 및 독서, 성가대, 복사 등)',
        desc: '전례 협조 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },
    {
        group: '본당 도와주기',
        item: '제구 손질 및 청소',
        desc: '제구 손질 및 청소 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },
    {
        group: '본당 도와주기',
        item: '교리실 청소 등',
        desc: '교리실 청소 등 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },

    // 6. 지구 살리기
    {
        group: '지구 살리기',
        item: '절전, 물 받아쓰기',
        desc: '절전, 물 받아쓰기 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },
    {
        group: '지구 살리기',
        item: '분리 수거',
        desc: '분리 수거 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },
    {
        group: '지구 살리기',
        item: '성당, 학교 주변, 집 주변, 공원, 해수욕장 등 청소하기',
        desc: '성당, 학교 주변 청소 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },
    {
        group: '지구 살리기',
        item: '음식물 남기지 않기',
        desc: '음식물 남기지 않기 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },
    {
        group: '지구 살리기',
        item: '아껴 쓰기, 고쳐 쓰기',
        desc: '아껴 쓰기, 고쳐 쓰기 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },

    // 7. 바른 생활
    {
        group: '바른 생활',
        item: '인사, 미소 짓기',
        desc: '인사, 미소 짓기 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },
    {
        group: '바른 생활',
        item: '감사하기',
        desc: '감사하기 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },
    {
        group: '바른 생활',
        item: '신발 정리, 이불 정리, 청소, 숙제하기',
        desc: '신발 정리, 숙제하기 등 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },
    {
        group: '바른 생활',
        item: '양보, 싸움 참기, 화해하기',
        desc: '양보, 싸움 참기, 화해하기 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },
    {
        group: '바른 생활',
        item: '부모님 말씀 듣기(심부름, 설거지 돕기, 빨래 개기)',
        desc: '부모님 말씀 듣기 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },
    {
        group: '바른 생활',
        item: '길 안내, 자리 양보',
        desc: '길 안내, 자리 양보 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },
    {
        group: '바른 생활',
        item: '부모(조부모)님, 수녀님, 신부님께 편지쓰기',
        desc: '편지쓰기 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },
    {
        group: '바른 생활',
        item: '절제하기(게임, TV 시청 등)',
        desc: '절제하기 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },

    // 8. 기도 생활
    {
        group: '기도 생활',
        item: '미사, 영성체, 성체조배',
        desc: '미사, 영성체, 성체조배 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'year_count', display: '() 단', required: false }
        ]
    },
    {
        group: '기도 생활',
        item: '아침·저녁기도, 삼종기도, 식사 전·후기도 등',
        desc: '아침·저녁기도 등 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'year_count', display: '() 단', required: false }
        ]
    },
    {
        group: '기도 생활',
        item: '매일 묵주기도 바치기',
        desc: '매일 묵주기도 바치기 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'year_count', display: '() 단', required: false }
        ]
    },
    {
        group: '기도 생활',
        item: '성직자, 수도자를 위한 기도',
        desc: '성직자, 수도자를 위한 기도 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'year_count', display: '() 단', required: false }
        ]
    },
    {
        group: '기도 생활',
        item: '가족 기도 하기',
        desc: '가족 기도 하기 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'year_count', display: '() 단', required: false }
        ]
    },
    {
        group: '기도 생활',
        item: '부모(조부모)를 위한 기도',
        desc: '부모(조부모)를 위한 기도 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'year_count', display: '() 단', required: false }
        ]
    },
    {
        group: '기도 생활',
        item: '성경 읽기, 성경 쓰기 등',
        desc: '성경 읽기, 성경 쓰기 등 (소년)',
        fields: [
            { name: 'count', display: '횟수(회,명,단,건)', required: true },
            { name: 'year_count', display: '() 단', required: false }
        ]
    },

    // 9. 기타
    {
        group: '기타',
        item: '신앙 서적 및 양서 읽기',
        desc: '신앙 서적 및 양서 읽기 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },
    {
        group: '기타',
        item: '교회 출판물 보급',
        desc: '교회 출판물 보급 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    },
    {
        group: '기타',
        item: '다른 항목에 들어가지 않는 항목',
        desc: '다른 항목에 들어가지 않는 항목 (소년)',
        fields: [{ name: 'count', display: '횟수(회,명,단,건)', required: true }]
    }
];

async function ensureCategory(client, group, item, desc) {
    const fullName = `${group}-${item}`;
    const res = await client.query(
        `SELECT id FROM activity_categories WHERE category_name = $1`,
        [fullName]
    );
    if (res.rows.length) {
        return res.rows[0].id;
    }
    const ins = await client.query(
        `INSERT INTO activity_categories (category_group, category_name, description)
         VALUES ($1, $2, $3) RETURNING id`,
        [group, fullName, desc || fullName]
    );
    return ins.rows[0].id;
}

async function ensureMapping(client, categoryName, fieldName, displayName, required) {
    const exists = await client.query(
        `SELECT 1 FROM activity_field_mapping
         WHERE category_name = $1 AND field_name = $2`,
        [categoryName, fieldName]
    );
    if (exists.rows.length) {
        await client.query(
            `UPDATE activity_field_mapping
             SET field_display_name = $3, is_required = $4
             WHERE category_name = $1 AND field_name = $2`,
            [categoryName, fieldName, displayName, required]
        );
        return;
    }
    await client.query(
        `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
         VALUES ($1, $2, $3, $4)`,
        [categoryName, fieldName, displayName, required]
    );
}

async function main() {
    const pool = createPool();
    const client = await pool.connect();
    try {
        console.log('소년 활동종목·세목 및 필드매핑 등록 시작...');
        let addedCount = 0;
        for (const def of JUNIOR_ITEMS) {
            const fullName = `${def.group}-${def.item}`;
            await ensureCategory(client, def.group, def.item, def.desc);
            for (const f of def.fields) {
                await ensureMapping(client, fullName, f.name, f.display, f.required);
            }
            addedCount++;
        }
        console.log(`✅ 소년 종목 ${addedCount}개 등록 및 매핑 완료`);
    } catch (err) {
        console.error('오류 발생:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
