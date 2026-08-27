/**
 * 광주 세나뚜스 활동요약에 횟수 필드가 없는 종목에 횟수 추가
 * 사용: node ensure-gwangju-count-field.js [--render]
 */
require('dotenv').config();
const { Pool } = require('pg');
const path = require('path');

const useRender = process.argv.includes('--render');
if (useRender) {
    require('dotenv').config({ path: path.join(__dirname, '.env.render'), override: true });
}

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: String(process.env.DB_PASSWORD || '5854'),
    port: parseInt(process.env.DB_PORT || '5432', 10)
});

const activePool = useRender && process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })
    : pool;

/** 횟수가 없던 광주 세나뚜스 세목 (이미 있는 본당협조·기타·영성생활·상가/환자 제외) */
const CATEGORIES = [
    '복음선교-교리 중단자 권면',
    '복음선교-가두선교',
    '복음선교-비신자 입교 권면',
    '복음선교-교리반 인도 예비자',
    '복음선교-통신교리자',
    '복음선교-타인이 인도한 예비자',
    '복음선교-교리반 봉사 및 협조',
    '교우돌봄-유아 세례 권면',
    '교우돌봄-신 세례자 방문',
    '교우돌봄-쉬는 교우 방문',
    '교우돌봄-교우 가정 방문',
    '교우돌봄-혼인 장애자 방문',
    '교우돌봄-성사 권면',
    '교우돌봄-전입 교우 방문',
    '교우돌봄-첫 영성체',
    '이웃돌봄-비신자 환자 방문 및 돌봄',
    '이웃돌봄-비신자 상가방문 및 돌봄',
    '이웃돌봄-병원 방문 및 활동',
    '이웃돌봄-복지시설 노력 봉사',
    '이웃돌봄-재해 및 사고 피해자',
    '이웃돌봄-다문화가족돌봄',
    '이웃돌봄-죽을 위험 중의 세례자 돌봄',
    '확장-행동단원 모집',
    '확장-협조단원 모집',
    '확장-소년 레지오 설립을 위한 활동',
    '확장-소년 레지오 돌봄',
    '확장-교본공부',
    '확장-평의회업무협조',
    '본당협조-업무협조',
    '본당협조-노인대학봉사',
    '본당협조-교육및피정',
    '본당협조-제단체봉사',
    '본당협조-성지시설봉사',
    '본당협조-교구관련시설봉사'
];

async function main() {
    const client = await activePool.connect();
    let added = 0;
    let skipped = 0;
    try {
        await client.query('BEGIN');
        const mapExists = (await client.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'activity_field_mapping'
             ) AS ex`
        )).rows[0].ex;
        if (!mapExists) {
            throw new Error('activity_field_mapping 테이블이 없습니다.');
        }

        for (const categoryName of CATEGORIES) {
            const exists = await client.query(
                `SELECT 1 FROM activity_field_mapping
                 WHERE category_name = $1
                   AND (field_name = '횟수' OR field_name = 'count'
                        OR field_display_name LIKE '횟수%')`,
                [categoryName]
            );
            if (exists.rows.length) {
                skipped += 1;
                continue;
            }
            await client.query(
                `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
                 VALUES ($1, '횟수', '횟수', false)`,
                [categoryName]
            );
            console.log(`[+] ${categoryName}`);
            added += 1;
        }

        await client.query('COMMIT');
        console.log(`\n✅ 횟수 추가 ${added}개, 이미 있음 ${skipped}개. (${useRender ? 'Render' : 'local'})`);
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        console.error('❌ 오류, 롤백:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await activePool.end();
        if (useRender && activePool !== pool) await pool.end().catch(() => {});
    }
}

main();
