const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'regio',
    password: '5854',
    port: 5432
});

async function checkMemberData() {
    const client = await pool.connect();
    try {
        console.log('=== Member 테이블 데이터 확인 ===');
        
        // 전체 회원 조회
        const result = await client.query('SELECT id, name, passno, baptism_name, church_name, pr_name, position FROM member ORDER BY id');
        console.log('총 회원 수:', result.rows.length);
        console.log('\n회원 목록:');
        result.rows.forEach(member => {
            console.log(`ID: ${member.id}, 이름: ${member.name}, 비밀번호: ${member.passno}, 세례명: ${member.baptism_name}, 성당: ${member.church_name}, PR: ${member.pr_name}, 직책: ${member.position}`);
        });
        
        // 특정 사용자로 로그인 테스트
        console.log('\n=== 로그인 테스트 ===');
        const loginTest = await client.query('SELECT * FROM member WHERE name = $1 AND passno = $2', ['김학숭', '1240520301']);
        console.log('김학숭 로그인 테스트 결과:', loginTest.rows.length > 0 ? '성공' : '실패');
        if (loginTest.rows.length > 0) {
            console.log('사용자 정보:', loginTest.rows[0]);
        }
        
        // 이미지에서 보인 passno 값들로 테스트
        console.log('\n=== 이미지의 passno 값들로 테스트 ===');
        const testPassnos = ['1240520301', '1240600313'];
        for (const passno of testPassnos) {
            const testResult = await client.query('SELECT * FROM member WHERE passno = $1', [passno]);
            console.log(`passno ${passno}: ${testResult.rows.length > 0 ? '존재함' : '존재하지 않음'}`);
            if (testResult.rows.length > 0) {
                console.log('  사용자:', testResult.rows[0].name);
            }
        }
        
    } catch (error) {
        console.error('오류:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

checkMemberData();

