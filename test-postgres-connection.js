const { Pool } = require('pg');

// PostgreSQL 연결 설정
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'regio',
    password: '5854',
    port: 5432,
    // 연결 타임아웃 설정
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    max: 1, // 최대 연결 수를 1로 제한
    ssl: false
});

async function testConnection() {
    let client;
    try {
        console.log('🔄 PostgreSQL 연결 테스트 시작...');
        
        // 연결 풀에서 클라이언트 획득
        client = await pool.connect();
        console.log('✅ 데이터베이스 클라이언트 연결 성공');
        
        // 간단한 쿼리 실행
        const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
        console.log('✅ 쿼리 실행 성공:');
        console.log('   현재 시간:', result.rows[0].current_time);
        console.log('   PostgreSQL 버전:', result.rows[0].pg_version);
        
        // 데이터베이스 목록 확인
        const dbResult = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
        console.log('✅ 사용 가능한 데이터베이스:');
        dbResult.rows.forEach(row => {
            console.log('   -', row.datname);
        });
        
        // regio 데이터베이스 존재 확인
        const regioExists = dbResult.rows.some(row => row.datname === 'regio');
        if (regioExists) {
            console.log('✅ regio 데이터베이스가 존재합니다.');
        } else {
            console.log('❌ regio 데이터베이스가 존재하지 않습니다.');
        }
        
    } catch (err) {
        console.error('❌ 연결 테스트 실패:', err.message);
        console.error('에러 코드:', err.code);
        console.error('에러 상세:', err);
        
        // 구체적인 해결 방법 제시
        if (err.code === 'ECONNREFUSED') {
            console.log('\n💡 해결 방법:');
            console.log('1. PostgreSQL 서비스가 실행 중인지 확인하세요');
            console.log('2. 포트 5432가 사용 중인지 확인하세요');
            console.log('3. 방화벽 설정을 확인하세요');
        } else if (err.code === '28P01') {
            console.log('\n💡 해결 방법:');
            console.log('1. postgres 사용자의 비밀번호를 확인하세요');
            console.log('2. pg_hba.conf 파일의 인증 설정을 확인하세요');
        } else if (err.code === '3D000') {
            console.log('\n💡 해결 방법:');
            console.log('1. regio 데이터베이스를 생성하세요');
            console.log('2. 또는 다른 데이터베이스명을 사용하세요');
        }
        
    } finally {
        // 클라이언트 연결 해제
        if (client) {
            try {
                client.release();
                console.log('✅ 클라이언트 연결 해제 완료');
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

// 연결 테스트 실행
testConnection().catch(console.error);

