const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL 연결 설정
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

async function deleteMembers103To202() {
    const client = await pool.connect();
    
    try {
        console.log('=== member 테이블 ID 103-202 삭제 작업 시작 ===\n');
        
        // 1. 삭제 전 데이터 확인
        console.log('1. 삭제 전 데이터 확인...');
        const beforeDelete = await client.query(`
            SELECT 
                id,
                name,
                phone_last4,
                resident_id_front6,
                phone_full,
                resident_id_full,
                created_at,
                updated_at
            FROM member 
            WHERE id BETWEEN 103 AND 202
            ORDER BY id
        `);
        
        console.log(`삭제 대상 레코드 수: ${beforeDelete.rows.length}개`);
        
        if (beforeDelete.rows.length > 0) {
            console.log('\n삭제 대상 데이터:');
            beforeDelete.rows.forEach(row => {
                console.log(`ID: ${row.id}, 이름: ${row.name}, 전화번호끝4자: ${row.phone_last4}, 주민번호앞6자: ${row.resident_id_front6}`);
            });
        } else {
            console.log('삭제할 데이터가 없습니다.');
            return;
        }
        
        // 2. 전체 테이블 상태 확인
        console.log('\n2. 삭제 전 전체 테이블 상태...');
        const beforeStats = await client.query(`
            SELECT 
                COUNT(*) as total_count,
                MIN(id) as min_id,
                MAX(id) as max_id
            FROM member
        `);
        
        console.log(`전체 회원 수: ${beforeStats.rows[0].total_count}명`);
        console.log(`ID 범위: ${beforeStats.rows[0].min_id} ~ ${beforeStats.rows[0].max_id}`);
        
        // 3. 삭제 실행
        console.log('\n3. 데이터 삭제 실행...');
        const deleteResult = await client.query(`
            DELETE FROM member 
            WHERE id BETWEEN 103 AND 202
        `);
        
        console.log(`삭제된 레코드 수: ${deleteResult.rowCount}개`);
        
        // 4. 삭제 후 확인
        console.log('\n4. 삭제 후 확인...');
        const afterDelete = await client.query(`
            SELECT COUNT(*) as count
            FROM member 
            WHERE id BETWEEN 103 AND 202
        `);
        
        console.log(`ID 103-202 범위의 남은 레코드 수: ${afterDelete.rows[0].count}개`);
        
        // 5. 삭제 후 전체 테이블 상태 확인
        console.log('\n5. 삭제 후 전체 테이블 상태...');
        const afterStats = await client.query(`
            SELECT 
                COUNT(*) as total_count,
                MIN(id) as min_id,
                MAX(id) as max_id
            FROM member
        `);
        
        console.log(`전체 회원 수: ${afterStats.rows[0].total_count}명`);
        console.log(`ID 범위: ${afterStats.rows[0].min_id} ~ ${afterStats.rows[0].max_id}`);
        
        console.log('\n=== 삭제 작업 완료 ===');
        
    } catch (error) {
        console.error('오류 발생:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

// 스크립트 실행
deleteMembers103To202(); 