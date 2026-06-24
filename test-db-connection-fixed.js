const { Pool } = require('pg');

// PostgreSQL 연결 설정
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'regio',
    password: '5854',
    port: 5432,
    // 연결 풀 설정 최적화
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    acquireTimeoutMillis: 10000,
    allowExitOnIdle: true,
    ssl: false,
    keepAlive: true,
    keepAliveInitialDelayMillis: 0
});

async function testConnection() {
    let client;
    try {
        console.log('🔄 PostgreSQL 연결 테스트 시작...');
        
        // 연결 풀에서 클라이언트 획득 (타임아웃 설정)
        client = await Promise.race([
            pool.connect(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Connection timeout')), 5000)
            )
        ]);
        
        console.log('✅ 데이터베이스 클라이언트 연결 성공');
        
        // 간단한 쿼리 테스트
        const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
        console.log('✅ 쿼리 실행 성공:');
        console.log('   현재 시간:', result.rows[0].current_time);
        console.log('   PostgreSQL 버전:', result.rows[0].pg_version.split(' ')[0]);
        
        // 연결 풀 상태 확인
        console.log('📊 연결 풀 상태:', {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount
        });
        
        // 데이터베이스 테이블 확인
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        
        console.log('📋 데이터베이스 테이블 목록:');
        tablesResult.rows.forEach(row => {
            console.log(`   - ${row.table_name}`);
        });
        
        console.log('✅ 모든 테스트 통과!');
        
    } catch (err) {
        console.error('❌ 연결 테스트 실패:', err.message);
        console.error('에러 코드:', err.code);
        console.error('에러 상세:', err);
        
        console.log('\n💡 해결 방법:');
        console.log('1. PostgreSQL 서비스가 실행 중인지 확인하세요');
        console.log('2. 데이터베이스 "regio"가 존재하는지 확인하세요');
        console.log('3. 사용자 "postgres"의 비밀번호가 "5854"인지 확인하세요');
        console.log('4. pg_hba.conf 파일에서 인증 방식을 확인하세요');
        console.log('5. 방화벽 설정을 확인하세요');
        
    } finally {
        // 연결 해제
        if (client) {
            try {
                client.release();
                console.log('✅ 데이터베이스 클라이언트 연결 해제 완료');
            } catch (releaseErr) {
                console.error('❌ 클라이언트 연결 해제 오류:', releaseErr);
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

// 테스트 실행
testConnection().catch(console.error);
