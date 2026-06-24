const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL 연결 설정
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '5854',
    database: process.env.DB_NAME || 'regio',
    port: parseInt(process.env.DB_PORT) || 5432,
    ssl: false,
};

const pool = new Pool(dbConfig);

async function checkData() {
    const client = await pool.connect();
    try {
        console.log('=== 생성된 테스트 데이터 확인 ===\n');
        
        // 전체 회원 수 확인
        const totalCount = await client.query('SELECT COUNT(*) as count FROM member');
        console.log(`총 회원 수: ${totalCount.rows[0].count}명`);
        
        // 서기 수 확인
        const secretaryCount = await client.query("SELECT COUNT(*) as count FROM member WHERE position = '서기'");
        console.log(`서기 수: ${secretaryCount.rows[0].count}명`);
        
        // 성당별 회원 수 확인
        const churchStats = await client.query(`
            SELECT church_name, COUNT(*) as count 
            FROM member 
            GROUP BY church_name 
            ORDER BY count DESC
        `);
        console.log('\n=== 성당별 회원 수 ===');
        churchStats.rows.forEach(row => {
            console.log(`${row.church_name}: ${row.count}명`);
        });
        
        // PR별 회원 수 확인
        const prStats = await client.query(`
            SELECT pr_name, COUNT(*) as count 
            FROM member 
            GROUP BY pr_name 
            ORDER BY count DESC
        `);
        console.log('\n=== PR별 회원 수 ===');
        prStats.rows.forEach(row => {
            console.log(`${row.pr_name}: ${row.count}명`);
        });
        
        // 활동 회수 통계
        const activityStats = await client.query(`
            SELECT 
                MIN(activity_count) as min_count,
                MAX(activity_count) as max_count,
                AVG(activity_count) as avg_count,
                SUM(activity_count) as total_count
            FROM member
        `);
        console.log('\n=== 활동 회수 통계 ===');
        const stats = activityStats.rows[0];
        console.log(`최소: ${stats.min_count}회`);
        console.log(`최대: ${stats.max_count}회`);
        console.log(`평균: ${Math.round(stats.avg_count)}회`);
        console.log(`총합: ${stats.total_count}회`);
        
        // 처음 10명의 상세 정보
        const first10 = await client.query(`
            SELECT name, baptism_name, church_name, pr_name, position, activity_count
            FROM member 
            ORDER BY id 
            LIMIT 10
        `);
        console.log('\n=== 처음 10명의 상세 정보 ===');
        first10.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.name} (${row.baptism_name}) - ${row.church_name} - ${row.pr_name} - ${row.position} - 활동: ${row.activity_count}회`);
        });
        
        // 마지막 10명의 상세 정보
        const last10 = await client.query(`
            SELECT name, baptism_name, church_name, pr_name, position, activity_count
            FROM member 
            ORDER BY id DESC 
            LIMIT 10
        `);
        console.log('\n=== 마지막 10명의 상세 정보 ===');
        last10.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.name} (${row.baptism_name}) - ${row.church_name} - ${row.pr_name} - ${row.position} - 활동: ${row.activity_count}회`);
        });
        
    } catch (error) {
        console.error('데이터 확인 오류:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

checkData();
