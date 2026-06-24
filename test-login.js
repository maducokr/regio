const http = require('http');

const postData = JSON.stringify({
    name: '김학숭',
    password: '1240520301'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

const req = http.request(options, (res) => {
    console.log(`상태 코드: ${res.statusCode}`);
    console.log(`응답 헤더:`, res.headers);
    
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log('응답 데이터:', data);
        try {
            const jsonData = JSON.parse(data);
            console.log('파싱된 JSON:', jsonData);
        } catch (e) {
            console.log('JSON 파싱 실패:', e.message);
        }
    });
});

req.on('error', (e) => {
    console.error(`요청 오류: ${e.message}`);
});

req.write(postData);
req.end();