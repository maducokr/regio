const { Pool } = require('pg');

// 간단한 연결 테스트
async function testSimpleConnection() {
    const pool = new Pool({
        user: 'postgres',
        host: 'localhost',
        database: 'regio',
        password: '5854',
        port: 5432,
        max: 1, // 최소 연결 수
        connectionTimeoutMillis: 3000,
        idleTimeoutMillis: 5000
    });

    let client;
    try {
        console.log('🔄 간단한 연결 테스트 시작...');
        
        client = await pool.connect();
        console.log('✅ 연결 성공!');
        
        const result = await client.query('SELECT NOW()');
        console.log('✅ 쿼리 실행 성공:', result.rows[0].now);
        
    } catch (err) {
        console.error('❌ 연결 실패:', err.message);
        console.error('에러 코드:', err.code);
        
        if (err.code === '53300') {
            console.log('💡 해결 방법:');
            console.log('1. PostgreSQL 서비스를 재시작하세요');
            console.log('2. 또는 잠시 기다린 후 다시 시도하세요');
        }
        
    } finally {
        if (client) {
            client.release();
        }
        await pool.end();
    }
}

testSimpleConnection();
