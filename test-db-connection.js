const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'regio',
    password: '5854',
    port: 5432,
    // 연결 풀 설정 최적화 (연결 누수 방지)
    max: 2, // 최대 연결 수를 더 줄임 (테스트용)
    min: 0, // 최소 연결 수
    idleTimeoutMillis: 5000, // 유휴 연결 타임아웃 (5초)
    connectionTimeoutMillis: 3000, // 연결 타임아웃 (3초)
    acquireTimeoutMillis: 5000, // 연결 획득 타임아웃
    allowExitOnIdle: true, // 유휴 시 종료 허용
});

async function testDatabaseConnection() {
    let client;
    try {
        console.log('=== 데이터베이스 연결 테스트 시작 ===');
        
        // 연결 풀 상태 확인
        console.log('연결 풀 상태:', {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount
        });
        
        // 데이터베이스 연결 테스트
        client = await pool.connect();
        console.log('✅ 데이터베이스 연결 성공');
        
        // 간단한 쿼리 실행
        const result = await client.query('SELECT NOW() as current_time');
        console.log('✅ 쿼리 실행 성공:', result.rows[0]);
        
        // member 테이블 데이터 확인
        const memberResult = await client.query('SELECT COUNT(*) as count FROM member');
        console.log('✅ member 테이블 조회 성공:', memberResult.rows[0]);
        
        // 로그인 테스트용 쿼리
        const loginTest = await client.query(
            'SELECT * FROM member WHERE name = $1 AND passno = $2',
            ['김학숭', '1240520301']
        );
        console.log('✅ 로그인 테스트 쿼리 성공:', {
            found: loginTest.rows.length > 0,
            user: loginTest.rows[0] ? loginTest.rows[0].name : '사용자 없음'
        });
        
    } catch (error) {
        console.error('❌ 데이터베이스 연결 테스트 실패:', error.message);
        console.error('에러 코드:', error.code);
        console.error('상세 오류:', error);
    } finally {
        // 연결 해제 보장
        if (client) {
            try {
                client.release();
                console.log('✅ 연결 해제 완료');
            } catch (releaseErr) {
                console.error('❌ 연결 해제 오류:', releaseErr);
            }
        }
        
        // 연결 풀 종료
        try {
            await pool.end();
            console.log('✅ 연결 풀 종료 완료');
        } catch (endErr) {
            console.error('❌ 연결 풀 종료 오류:', endErr);
        }
    }
}

testDatabaseConnection();


