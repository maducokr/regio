const express = require('express');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 10000;

// 미들웨어 설정
app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            console.error('JSON 파싱 에러:', e);
            throw new Error('잘못된 JSON 형식');
        }
    }
}));
app.use(express.static('.'));

// JSON 파싱 에러 처리 미들웨어
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        console.error('JSON 파싱 에러:', error);
        return res.status(400).json({ error: '잘못된 JSON 형식입니다.' });
    }
    next();
});

// CORS 설정 - Render 환경에 맞게 수정
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// 데이터베이스 연결 (환경 변수가 없으면 더미 데이터 사용)
let sql;
try {
    if (process.env.DATABASE_URL) {
        sql = neon(process.env.DATABASE_URL);
        console.log('Neon 데이터베이스에 연결되었습니다.');
    } else {
        console.log('DATABASE_URL이 설정되지 않아 더미 데이터를 사용합니다.');
    }
} catch (error) {
    console.log('데이터베이스 연결 실패, 더미 데이터 사용:', error.message);
}

// 더미 사용자 데이터
const dummyUsers = [
    {
        id: 1,
        name: '홍길동',
        phone_last4: '1234',
        resident_id_front6: '123456',
        password_hash: 'dummy_hash'
    },
    {
        id: 2,
        name: '김철수',
        phone_last4: '5678',
        resident_id_front6: '234567',
        password_hash: 'dummy_hash'
    }
];

// 로그인 API
app.post('/api/login', async (req, res) => {
    try {
        // 요청 본문 검증
        if (!req.body || typeof req.body !== 'object') {
            console.log('잘못된 요청 본문:', req.body);
            return res.status(400).json({ error: '잘못된 요청 형식입니다.' });
        }

        const { name, password } = req.body;
        
        // 디버깅 로그 추가
        console.log('로그인 요청:', { name, password });

        if (!name || !password) {
            return res.status(400).json({ error: '성명과 비밀번호를 입력해주세요.' });
        }

        let user;
        
        if (sql) {
            // 실제 데이터베이스 사용
            const result = await sql`
                SELECT id, name, password_hash, phone_last4, resident_id_front6, created_at 
                FROM member 
                WHERE name = ${name}
            `;
            user = result[0];
        } else {
            // 더미 데이터 사용
            user = dummyUsers.find(u => u.name === name);
        }

        console.log('찾은 사용자:', user);

        if (!user) {
            return res.status(401).json({ error: '등록되지 않은 사용자입니다.' });
        }

        // 비밀번호 검증 (폰번호끝4자+주민번호앞6자)
        const expectedPassword = `${user.phone_last4}${user.resident_id_front6}`;
        
        console.log('비밀번호 검증:', {
            입력된비밀번호: password,
            예상비밀번호: expectedPassword,
            일치여부: password === expectedPassword
        });
        
        if (password !== expectedPassword) {
            return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
        }

        res.json({
            success: true,
            message: '로그인 성공',
            user: {
                id: user.id,
                name: user.name,
                created_at: user.created_at || new Date()
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 등록 API
app.post('/api/register', async (req, res) => {
    try {
        const { name, phone_last4, resident_id_front6, phone_full, resident_id_full } = req.body;

        if (!name || !phone_last4 || !resident_id_front6) {
            return res.status(400).json({ error: '모든 필수 정보를 입력해주세요.' });
        }

        if (phone_last4.length !== 4 || !/^\d{4}$/.test(phone_last4)) {
            return res.status(400).json({ error: '전화번호 끝 4자리를 정확히 입력해주세요.' });
        }

        if (resident_id_front6.length !== 6 || !/^\d{6}$/.test(resident_id_front6)) {
            return res.status(400).json({ error: '주민번호 앞 6자리를 정확히 입력해주세요.' });
        }

        // 중복 확인
        let existingUser;
        if (sql) {
            const result = await sql`SELECT id FROM member WHERE name = ${name}`;
            existingUser = result[0];
        } else {
            existingUser = dummyUsers.find(u => u.name === name);
        }

        if (existingUser) {
            return res.status(409).json({ error: '이미 등록된 사용자입니다.' });
        }

        // 새 사용자 생성
        const newUser = {
            id: dummyUsers.length + 1,
            name,
            phone_last4,
            resident_id_front6,
            phone_full,
            resident_id_full,
            created_at: new Date()
        };

        if (sql) {
            // 실제 데이터베이스에 저장
            const passwordHash = await bcrypt.hash(`${phone_last4}${resident_id_front6}`, 10);
            const result = await sql`
                INSERT INTO member (name, phone_last4, resident_id_front6, phone_full, resident_id_full, password_hash, created_at)
                VALUES (${name}, ${phone_last4}, ${resident_id_front6}, ${phone_full || null}, ${resident_id_full || null}, ${passwordHash}, NOW())
                RETURNING id, name, created_at
            `;
            newUser.id = result[0].id;
            newUser.created_at = result[0].created_at;
        } else {
            // 더미 데이터에 추가
            dummyUsers.push(newUser);
        }

        res.status(201).json({
            success: true,
            message: '등록이 완료되었습니다.',
            user: {
                id: newUser.id,
                name: newUser.name,
                created_at: newUser.created_at
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 메인 페이지
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`환경: ${process.env.NODE_ENV || 'development'}`);
    if (sql) {
        console.log('✅ Neon 데이터베이스 연결됨');
    } else {
        console.log('⚠️ 더미 데이터 사용 중 (DATABASE_URL 설정 필요)');
    }
});
