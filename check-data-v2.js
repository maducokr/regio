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
        console.log('=== 개선된 테스트 데이터 확인 ===\n');
        
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
        
        // 활동별 통계
        const activityStats = await client.query(`
            SELECT 
                SUM(evangelism_count) as total_evangelism,
                SUM(care_count) as total_care,
                SUM(needy_count) as total_needy,
                SUM(legion_count) as total_legion,
                SUM(prayer_count) as total_prayer,
                SUM(district_count) as total_district,
                SUM(activity_count) as total_activity,
                AVG(evangelism_count) as avg_evangelism,
                AVG(care_count) as avg_care,
                AVG(needy_count) as avg_needy,
                AVG(legion_count) as avg_legion,
                AVG(prayer_count) as avg_prayer,
                AVG(district_count) as avg_district,
                AVG(activity_count) as avg_activity
            FROM member
        `);
        console.log('\n=== 활동별 통계 ===');
        const stats = activityStats.rows[0];
        console.log(`전도활동: 총 ${stats.total_evangelism}회, 평균 ${Math.round(stats.avg_evangelism)}회`);
        console.log(`돌봄활동: 총 ${stats.total_care}회, 평균 ${Math.round(stats.avg_care)}회`);
        console.log(`구제활동: 총 ${stats.total_needy}회, 평균 ${Math.round(stats.avg_needy)}회`);
        console.log(`레지오활동: 총 ${stats.total_legion}회, 평균 ${Math.round(stats.avg_legion)}회`);
        console.log(`기도생활: 총 ${stats.total_prayer}회, 평균 ${Math.round(stats.avg_prayer)}회`);
        console.log(`지구와함께: 총 ${stats.total_district}회, 평균 ${Math.round(stats.avg_district)}회`);
        console.log(`총 활동: ${stats.total_activity}회, 평균 ${Math.round(stats.avg_activity)}회`);
        
        // 활동 날짜 분포 확인
        const dateStats = await client.query(`
            SELECT 
                activity_date,
                COUNT(*) as count
            FROM member 
            GROUP BY activity_date 
            ORDER BY activity_date
        `);
        console.log('\n=== 활동 날짜 분포 ===');
        dateStats.rows.forEach(row => {
            console.log(`${row.activity_date}: ${row.count}명`);
        });
        
        // 처음 5명의 상세 정보
        const first5 = await client.query(`
            SELECT name, baptism_name, church_name, pr_name, position, 
                   evangelism_count, care_count, needy_count, legion_count, 
                   prayer_count, district_count, activity_count, activity_date
            FROM member 
            ORDER BY id 
            LIMIT 5
        `);
        console.log('\n=== 처음 5명의 상세 정보 ===');
        first5.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.name} (${row.baptism_name}) - ${row.church_name} - ${row.pr_name} - ${row.position}`);
            console.log(`   전도: ${row.evangelism_count}회, 돌봄: ${row.care_count}회, 구제: ${row.needy_count}회`);
            console.log(`   레지오: ${row.legion_count}회, 기도: ${row.prayer_count}회, 지구: ${row.district_count}회`);
            console.log(`   총활동: ${row.activity_count}회, 날짜: ${row.activity_date}`);
        });
        
        // 마지막 5명의 상세 정보
        const last5 = await client.query(`
            SELECT name, baptism_name, church_name, pr_name, position, 
                   evangelism_count, care_count, needy_count, legion_count, 
                   prayer_count, district_count, activity_count, activity_date
            FROM member 
            ORDER BY id DESC 
            LIMIT 5
        `);
        console.log('\n=== 마지막 5명의 상세 정보 ===');
        last5.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.name} (${row.baptism_name}) - ${row.church_name} - ${row.pr_name} - ${row.position}`);
            console.log(`   전도: ${row.evangelism_count}회, 돌봄: ${row.care_count}회, 구제: ${row.needy_count}회`);
            console.log(`   레지오: ${row.legion_count}회, 기도: ${row.prayer_count}회, 지구: ${row.district_count}회`);
            console.log(`   총활동: ${row.activity_count}회, 날짜: ${row.activity_date}`);
        });
        
        // 비밀번호 형식 확인
        const passwordSample = await client.query(`
            SELECT name, password, phone_last4, resident_id_front6
            FROM member 
            ORDER BY id 
            LIMIT 3
        `);
        console.log('\n=== 비밀번호 형식 확인 ===');
        passwordSample.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.name}: ${row.password} (전화번호 끝4자리: ${row.phone_last4}, 주민번호 앞6자리: ${row.resident_id_front6})`);
        });
        
    } catch (error) {
        console.error('데이터 확인 오류:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

checkData();
