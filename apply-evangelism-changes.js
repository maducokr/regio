// 복음선교 활동종목 변경을 실제 DB에 반영하는 일회성 스크립트
// - 추가: 복음선교-개종권면, 복음선교-방문선교, 복음선교-가두선교
// - 삭제: 복음선교-방문및가두선교
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const OLD = '복음선교-방문및가두선교';
const NEW_CATEGORIES = [
    { name: '복음선교-개종권면', desc: '개종 권면 활동' },
    { name: '복음선교-방문선교', desc: '방문 선교 활동' },
    { name: '복음선교-가두선교', desc: '가두 선교 활동' },
];
const NEW_MEMBER_COLUMNS = ['복음선교-개종권면', '복음선교-방문선교', '복음선교-가두선교'];

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1) member 테이블 컬럼 추가
        for (const col of NEW_MEMBER_COLUMNS) {
            const exists = await client.query(
                `SELECT 1 FROM information_schema.columns WHERE table_name='member' AND column_name=$1`,
                [col]
            );
            if (exists.rows.length === 0) {
                await client.query(`ALTER TABLE member ADD COLUMN "${col}" INTEGER DEFAULT 0`);
                console.log(`[member] 컬럼 추가: ${col}`);
            } else {
                console.log(`[member] 컬럼 이미 존재: ${col}`);
            }
        }

        // 2) member 테이블 기존 컬럼 삭제 (방문및가두선교)
        const oldColExists = await client.query(
            `SELECT 1 FROM information_schema.columns WHERE table_name='member' AND column_name=$1`,
            [OLD]
        );
        if (oldColExists.rows.length > 0) {
            await client.query(`ALTER TABLE member DROP COLUMN "${OLD}"`);
            console.log(`[member] 컬럼 삭제: ${OLD}`);
        } else {
            console.log(`[member] 삭제할 컬럼 없음: ${OLD}`);
        }

        // 3) activity_categories 신규 추가
        for (const cat of NEW_CATEGORIES) {
            await client.query(
                `INSERT INTO activity_categories (category_name, category_group, description)
                 VALUES ($1, '복음선교', $2)
                 ON CONFLICT (category_name) DO NOTHING`,
                [cat.name, cat.desc]
            );
            console.log(`[categories] 추가/확인: ${cat.name}`);
        }

        // 4) 기존 카테고리(방문및가두선교) 및 참조 활동기록 삭제
        const oldCat = await client.query(
            `SELECT id FROM activity_categories WHERE category_name = $1`,
            [OLD]
        );
        if (oldCat.rows.length > 0) {
            const oldId = oldCat.rows[0].id;
            const delRec = await client.query(
                `DELETE FROM activity_records WHERE category_id = $1 RETURNING id`,
                [oldId]
            );
            console.log(`[activity_records] ${OLD} 참조 기록 삭제: ${delRec.rows.length}건`);
            await client.query(`DELETE FROM activity_categories WHERE id = $1`, [oldId]);
            console.log(`[categories] 삭제: ${OLD}`);
        } else {
            console.log(`[categories] 삭제할 카테고리 없음: ${OLD}`);
        }

        // 5) activity_field_mapping: 기존 매핑 삭제 후 신규 매핑 추가
        // 테이블이 없을 수도 있으므로 존재 확인
        const mapTableExists = await client.query(
            `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='activity_field_mapping') AS ex`
        );
        if (mapTableExists.rows[0].ex) {
            const delMap = await client.query(
                `DELETE FROM activity_field_mapping WHERE category_name = $1 RETURNING id`,
                [OLD]
            );
            console.log(`[field_mapping] ${OLD} 매핑 삭제: ${delMap.rows.length}건`);

            const mappingRows = [];
            for (const cat of NEW_CATEGORIES) {
                mappingRows.push([cat.name, '횟수', '횟수(회,단,시간)', true]);
                mappingRows.push([cat.name, '교리반인도', '교리반인도', false]);
            }
            for (const [cn, fn, fdn, req] of mappingRows) {
                await client.query(
                    `INSERT INTO activity_field_mapping (category_name, field_name, field_display_name, is_required)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (category_name, field_name) DO NOTHING`,
                    [cn, fn, fdn, req]
                );
            }
            console.log(`[field_mapping] 신규 매핑 추가 완료`);
        } else {
            console.log(`[field_mapping] 테이블 없음 - 건너뜀`);
        }

        await client.query('COMMIT');
        console.log('\n✅ 모든 변경이 DB에 반영되었습니다.');

        // 결과 확인
        const check = await client.query(
            `SELECT category_name FROM activity_categories WHERE category_name LIKE '복음선교%' ORDER BY id`
        );
        console.log('\n현재 복음선교 카테고리 목록:');
        check.rows.forEach(r => console.log(' -', r.category_name));
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
