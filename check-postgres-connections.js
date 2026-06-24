const { Pool } = require('pg');

// PostgreSQL 연결 설정 (최소한의 연결로)
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres', // 기본 데이터베이스 사용
    password: '5854',
    port: 5432,
    max: 1, // 최대 연결 수를 1로 제한
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 5000,
    ssl: false
});

async function checkConnections() {
    let client;
    try {
        console.log('🔄 PostgreSQL 연결 상태 확인 중...');
        
        // 연결 시도
        client = await pool.connect();
        console.log('✅ 연결 성공');
        
        // 현재 연결 수 확인
        const connectionsResult = await client.query(`
            SELECT 
                count(*) as total_connections,
                count(*) FILTER (WHERE state = 'active') as active_connections,
                count(*) FILTER (WHERE state = 'idle') as idle_connections
            FROM pg_stat_activity 
            WHERE datname = current_database()
        `);
        
        console.log('📊 현재 연결 상태:');
        console.log('   총 연결 수:', connectionsResult.rows[0].total_connections);
        console.log('   활성 연결:', connectionsResult.rows[0].active_connections);
        console.log('   유휴 연결:', connectionsResult.rows[0].idle_connections);
        
        // 최대 연결 수 확인
        const maxConnectionsResult = await client.query('SHOW max_connections');
        console.log('   최대 연결 수:', maxConnectionsResult.rows[0].max_connections);
        
        // 모든 연결 상세 정보
        const allConnectionsResult = await client.query(`
            SELECT 
                pid,
                usename,
                application_name,
                client_addr,
                state,
                query_start,
                state_change
            FROM pg_stat_activity 
            WHERE datname = current_database()
            ORDER BY query_start DESC
        `);
        
        console.log('\n📋 모든 연결 상세:');
        allConnectionsResult.rows.forEach((conn, index) => {
            console.log(`   ${index + 1}. PID: ${conn.pid}, 사용자: ${conn.usename}, 상태: ${conn.state}, 앱: ${conn.application_name || 'N/A'}`);
        });
        
        // regio 데이터베이스 존재 확인
        const dbExistsResult = await client.query(`
            SELECT EXISTS(
                SELECT 1 FROM pg_database WHERE datname = 'regio'
            ) as exists
        `);
        
        if (dbExistsResult.rows[0].exists) {
            console.log('\n✅ regio 데이터베이스가 존재합니다.');
        } else {
            console.log('\n❌ regio 데이터베이스가 존재하지 않습니다.');
            console.log('💡 regio 데이터베이스를 생성해야 합니다.');
        }
        
    } catch (err) {
        console.error('❌ 연결 확인 실패:', err.message);
        console.error('에러 코드:', err.code);
        
        if (err.code === '53300') {
            console.log('\n💡 해결 방법:');
            console.log('1. PostgreSQL 서비스를 재시작하세요');
            console.log('2. 또는 기존 연결들을 강제로 종료하세요');
        }
        
    } finally {
        if (client) {
            try {
                client.release();
                console.log('\n✅ 클라이언트 연결 해제 완료');
            } catch (releaseErr) {
                console.error('❌ 클라이언트 연결 해제 오류:', releaseErr);
            }
        }
        
        try {
            await pool.end();
            console.log('✅ 연결 풀 종료 완료');
        } catch (endErr) {
            console.error('❌ 연결 풀 종료 오류:', endErr);
        }
    }
}

// 연결 상태 확인 실행
checkConnections().catch(console.error);

