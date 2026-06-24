const fetch = require('node-fetch');

async function testLoginAPI() {
    try {
        console.log('=== 로그인 API 테스트 ===');
        
        // 테스트할 사용자 정보 (첫 번째 회원)
        const testData = {
            name: '김민수',
            password: '9946657860'  // 전화번호 끝 4자리 + 주민번호 앞 6자리
        };
        
        console.log('테스트 데이터:', testData);
        
        const response = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testData)
        });
        
        console.log('응답 상태:', response.status);
        console.log('응답 헤더:', response.headers.raw());
        
        const responseText = await response.text();
        console.log('응답 텍스트:', responseText);
        
        if (response.ok) {
            const data = JSON.parse(responseText);
            console.log('로그인 성공!');
            console.log('응답 데이터:', data);
        } else {
            console.log('로그인 실패!');
            try {
                const errorData = JSON.parse(responseText);
                console.log('에러 데이터:', errorData);
            } catch (e) {
                console.log('에러 파싱 실패:', e);
            }
        }
        
    } catch (error) {
        console.error('API 호출 오류:', error);
    }
}

testLoginAPI().catch(console.error);
