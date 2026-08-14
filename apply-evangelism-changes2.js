// 복음선교/교우돌봄 활동종목 변경을 실제 DB에 반영하는 일회성 스크립트
// 1) 복음선교-예비자 관리      → 복음선교-예비신자관리돌봄 (이름 변경)
// 2) 복음선교-통신 교리자      → 복음선교-통신교리자 돌봄 (이름 변경)
// 3) 복음선교-교리반 인도      (신규 추가, 필드: 횟수)
// 4) 교우돌봄-냉담교우회두 권면 (신규 추가, 필드: 횟수 + 회두)
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const RENAMES = [
    { from: '복음선교-예비자 관리', to: '복음선교-예비신자관리돌봄' },
    { from: '복음선교-통신 교리자', to: '복음선교-통신교리자 돌봄' },
];

const NEW_CATEGORIES = [
    { name: '복음선교-교리반 인도', group: '복음선교', desc: '교리반 인도 활동',
      fields: [['횟수', '횟수(회,단,시간)', true]] },
    { name: '교우돌봄-냉담교우회두 권면', group: '교우돌봄', desc: '냉담 교우 회두 권면',
      fields: [['횟수', '횟수(회,단,시간)', true], ['회두', '회두', false]] },
];

async function columnExists(client, col) {
    const r = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name='member' AND column_name=$1`, [col]);
    return r.rows.length > 0;
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const mapTableExists = (await client.query(
            `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='activity_field_mapping') AS ex`
        )).rows[0].ex;

        // 1~2) 이름 변경 처리
        for (const { from, to } of RENAMES) {
            // member 컬럼 rename
            if (await columnExists(client, from)) {
                if (!(await columnExists(client, to))) {
                    await client.query(`ALTER TABLE member RENAME COLUMN "${from}" TO "${to}"`);
                    console.log(`[member] 컬럼 이름변경: ${from} → ${to}`);
                } else {
                    console.log(`[member] 대상 컬럼 이미 존재, 변경 생략: ${to}`);
                }
            } else if (!(await columnExists(client, to))) {
                await client.query(`ALTER TABLE member ADD COLUMN "${to}" INTEGER DEFAULT 0`);
                console.log(`[member] 컬럼 신규 추가: ${to}`);
            }

            // activity_categories rename
            await client.query(
                `UPDATE activity_categories SET category_name = $1 WHERE category_name = $2`, [to, from]);
            // 대상이 없었을 경우(과거 데이터 없음) 신규 보장
            await client.query(
                `INSERT INTO activity_categories (category_name, category_group, description)
                 VALUES ($1::varchar, '복음선교', $2::text)
                 ON CONFLICT (category_name) DO NOTHING`, [to, to]);
            console.log(`[categories] 이름변경/확인: ${from} → ${to}`);

            // activity_field_mapping rename
            if (mapTableExists) {
                await client.query(
                    `UPDATE activity_field_mapping SET category_name = $1 WHERE category_name = $2`, [to, from]);
                console.log(`[field_mapping] 이름변경: ${from} → ${to}`);
            }
        }

        // 3~4) 신규 카테고리 추가
        for (const cat of NEW_CATEGORIES) {
            if (!(await columnExists(client, cat.name))) {
                await client.query(`ALTER TABLE member ADD COLUMN "${cat.name}" INTEGER DEFAULT 0`);
                console.log(`[member] 컬럼 추가: ${cat.name}`);
            } else {
                console.log(`[member] 컬럼 이미 존재: ${cat.name}`);
            }

            await client.query(
                `INSERT INTO activity_categories (category_name, category_group, description)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (category_name) DO NOTHING`, [cat.name, cat.group, cat.desc]);
            console.log(`[categories] 추가/확인: ${cat.name}`);

            if (mapTableExists) {
                for (const [fn, fdn, req] of cat.fields) {
                    await client.query(
                        `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT (category_name, field_name) DO NOTHING`, [cat.name, fn, fdn, req]);
                }
                console.log(`[field_mapping] 매핑 추가: ${cat.name}`);
            }
        }

        await client.query('COMMIT');
        console.log('\n✅ 모든 변경이 DB에 반영되었습니다.');

        const cats = await client.query(
            `SELECT category_name FROM activity_categories
             WHERE category_name LIKE '복음선교%' OR category_name LIKE '교우돌봄%' ORDER BY category_group, id`);
        console.log('\n현재 복음선교/교우돌봄 카테고리:');
        cats.rows.forEach(r => console.log(' -', r.category_name));
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 오류 발생, 롤백했습니다:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
