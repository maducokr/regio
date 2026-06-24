const { Pool } = require('pg');

// PostgreSQL 연결 설정을 더 보수적으로 설정
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres', // 기본 데이터베이스 사용
    password: '5854',
    port: 5432,
    max: 1, // 최대 연결 수를 1로 제한
    min: 0, // 최소 연결 수를 0으로 설정
    connectionTimeoutMillis: 3000, // 연결 타임아웃을 3초로 단축
    idleTimeoutMillis: 1000, // 유휴 타임아웃을 1초로 단축
    acquireTimeoutMillis: 2000, // 연결 획득 타임아웃을 2초로 단축
    ssl: false,
    // 추가 설정
    allowExitOnIdle: true, // 유휴 시 종료 허용
    keepAlive: false, // keepAlive 비활성화
    keepAliveInitialDelayMillis: 0
});

async function fixConnection() {
    let client;
    try {
        console.log('🔄 PostgreSQL 연결 수정 시도...');
        
        // 연결 시도 (타임아웃 설정)
        client = await Promise.race([
            pool.connect(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Connection timeout')), 3000)
            )
        ]);
        
        console.log('✅ 연결 성공!');
        
        // PostgreSQL 설정 확인
        const settingsResult = await client.query(`
            SELECT name, setting, unit, context 
            FROM pg_settings 
            WHERE name IN ('max_connections', 'shared_preload_libraries', 'listen_addresses')
            ORDER BY name
        `);
        
        console.log('\n📊 PostgreSQL 설정:');
        settingsResult.rows.forEach(row => {
            console.log(`   ${row.name}: ${row.setting} ${row.unit || ''} (${row.context})`);
        });
        
        // 현재 연결 수 확인
        const connectionsResult = await client.query(`
            SELECT 
                count(*) as total_connections,
                count(*) FILTER (WHERE state = 'active') as active_connections,
                count(*) FILTER (WHERE state = 'idle') as idle_connections,
                count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
            FROM pg_stat_activity 
            WHERE datname = current_database()
        `);
        
        console.log('\n📊 현재 연결 상태:');
        console.log('   총 연결 수:', connectionsResult.rows[0].total_connections);
        console.log('   활성 연결:', connectionsResult.rows[0].active_connections);
        console.log('   유휴 연결:', connectionsResult.rows[0].idle_connections);
        console.log('   트랜잭션 중 유휴:', connectionsResult.rows[0].idle_in_transaction);
        
        // regio 데이터베이스 생성 시도
        try {
            await client.query('CREATE DATABASE regio');
            console.log('\n✅ regio 데이터베이스가 생성되었습니다.');
        } catch (createErr) {
            if (createErr.code === '42P04') {
                console.log('\n✅ regio 데이터베이스가 이미 존재합니다.');
            } else {
                console.log('\n❌ regio 데이터베이스 생성 실패:', createErr.message);
            }
        }
        
        // regio 데이터베이스로 연결 테스트
        try {
            const regioPool = new Pool({
                user: 'postgres',
                host: 'localhost',
                database: 'regio',
                password: '5854',
                port: 5432,
                max: 1,
                connectionTimeoutMillis: 3000,
                ssl: false
            });
            
            const regioClient = await regioPool.connect();
            console.log('✅ regio 데이터베이스 연결 성공!');
            
            // 테이블 존재 확인
            const tablesResult = await regioClient.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name
            `);
            
            console.log('\n📋 regio 데이터베이스의 테이블:');
            if (tablesResult.rows.length > 0) {
                tablesResult.rows.forEach(row => {
                    console.log(`   - ${row.table_name}`);
                });
            } else {
                console.log('   (테이블이 없습니다)');
            }
            
            regioClient.release();
            await regioPool.end();
            
        } catch (regioErr) {
            console.log('\n❌ regio 데이터베이스 연결 실패:', regioErr.message);
        }
        
    } catch (err) {
        console.error('❌ 연결 수정 실패:', err.message);
        console.error('에러 코드:', err.code);
        
        if (err.code === '53300') {
            console.log('\n💡 해결 방법:');
            console.log('1. 관리자 권한으로 PowerShell을 실행하세요');
            console.log('2. 다음 명령어를 실행하세요:');
            console.log('   Restart-Service -Name "postgresql-x64-17" -Force');
            console.log('3. 또는 PostgreSQL을 수동으로 재시작하세요');
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

// 연결 수정 실행
fixConnection().catch(console.error);