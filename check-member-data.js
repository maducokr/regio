const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'regio',
    password: '5854',
    port: 5432
});

async function checkMemberData() {
    try {
        const result = await pool.query(`
            SELECT id, name, baptism_name, church_name, pr_name, position, 
                   phone_last4, resident_id_front6, passno
            FROM member
            ORDER BY id
        `);
        
        console.log('Member 테이블 데이터:');
        console.log('='.repeat(80));
        
        result.rows.forEach((row, index) => {
            console.log(`${index + 1}. ID: ${row.id}`);
            console.log(`   이름: ${row.name}`);
            console.log(`   세례명: ${row.baptism_name || '없음'}`);
            console.log(`   성당: ${row.church_name || '없음'}`);
            console.log(`   PR: ${row.pr_name || '없음'}`);
            console.log(`   직책: ${row.position || '없음'}`);
            console.log(`   전화번호 끝 4자리: ${row.phone_last4 || '없음'}`);
            console.log(`   주민번호 앞 6자리: ${row.resident_id_front6 || '없음'}`);
            console.log(`   passno: ${row.passno || '없음'}`);
            console.log('   ' + '-'.repeat(40));
        });
        
        console.log(`\n총 ${result.rows.length}명의 회원이 있습니다.`);
        
    } catch (error) {
        console.error('오류:', error.message);
    } finally {
        await pool.end();
    }
}

checkMemberData();


