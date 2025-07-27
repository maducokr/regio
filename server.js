const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 10000;

// PostgreSQL 연결 설정
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: process.env.DB_PORT || 5432,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

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

// 데이터베이스 연결 테스트
pool.on('connect', () => {
    console.log('✅ PostgreSQL 데이터베이스에 연결되었습니다.');
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL 연결 오류:', err);
});

// 더미 사용자 데이터 (데이터베이스 연결 실패 시 사용)
const dummyUsers = [
    {
        id: 1,
        name: '홍길동',
        passno: 123412345
    },
    {
        id: 2,
        name: '갑순이',
        passno: 123412345
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
        
        try {
            // PostgreSQL 데이터베이스 사용 - 실제 구조에 맞게 수정
            const result = await pool.query(
                'SELECT id, name, passno FROM member WHERE name = $1',
                [name]
            );
            user = result.rows[0];
        } catch (dbError) {
            console.error('데이터베이스 오류:', dbError);
            // 데이터베이스 오류 시 더미 데이터 사용
            user = dummyUsers.find(u => u.name === name);
        }

        console.log('찾은 사용자:', user);

        if (!user) {
            return res.status(401).json({ error: '등록되지 않은 사용자입니다.' });
        }

        // 비밀번호 검증 (passno와 비교)
        const expectedPassword = user.passno.toString();
        
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
                name: user.name
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
        const { name, password } = req.body;

        if (!name || !password) {
            return res.status(400).json({ error: '성명과 비밀번호를 입력해주세요.' });
        }

        // 비밀번호가 숫자인지 확인
        if (!/^\d+$/.test(password)) {
            return res.status(400).json({ error: '비밀번호는 숫자만 입력해주세요.' });
        }

        // 중복 확인
        let existingUser;
        try {
            const result = await pool.query('SELECT id FROM member WHERE name = $1', [name]);
            existingUser = result.rows[0];
        } catch (dbError) {
            console.error('데이터베이스 오류:', dbError);
            existingUser = dummyUsers.find(u => u.name === name);
        }

        if (existingUser) {
            return res.status(409).json({ error: '이미 등록된 사용자입니다.' });
        }

        // 새 사용자 생성
        const newUser = {
            id: dummyUsers.length + 1,
            name,
            passno: parseInt(password)
        };

        try {
            // PostgreSQL 데이터베이스에 저장
            const result = await pool.query(
                'INSERT INTO member (name, passno) VALUES ($1, $2) RETURNING id, name',
                [name, parseInt(password)]
            );
            newUser.id = result.rows[0].id;
        } catch (dbError) {
            console.error('데이터베이스 저장 오류:', dbError);
            // 데이터베이스 오류 시 더미 데이터에 추가
            dummyUsers.push(newUser);
        }

        res.status(201).json({
            success: true,
            message: '등록이 완료되었습니다.',
            user: {
                id: newUser.id,
                name: newUser.name
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 활동 입력 API
app.post('/api/inputact', async (req, res) => {
    try {
        const { member_id, activity_date, activity_type, activity_description, hours_spent, location, notes } = req.body;

        if (!member_id || !activity_type) {
            return res.status(400).json({ error: '회원 ID와 활동 유형은 필수입니다.' });
        }

        let newActivity;
        try {
            // PostgreSQL 데이터베이스에 저장
            const result = await pool.query(
                `INSERT INTO inputact (member_id, activity_date, activity_type, activity_description, hours_spent, location, notes, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                 RETURNING id, member_id, activity_date, activity_type, created_at`,
                [
                    member_id,
                    activity_date || new Date(),
                    activity_type,
                    activity_description || null,
                    hours_spent || 0,
                    location || null,
                    notes || null
                ]
            );
            newActivity = result.rows[0];
        } catch (dbError) {
            console.error('활동 저장 오류:', dbError);
            return res.status(500).json({ error: '활동 저장 중 오류가 발생했습니다.' });
        }

        res.status(201).json({
            success: true,
            message: '활동이 등록되었습니다.',
            activity: newActivity
        });

    } catch (error) {
        console.error('Activity input error:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 활동 조회 API
app.get('/api/inputact/:member_id', async (req, res) => {
    try {
        const { member_id } = req.params;
        const { start_date, end_date, activity_type } = req.query;

        let query = 'SELECT * FROM inputact WHERE member_id = $1';
        let params = [member_id];

        if (start_date) {
            query += ' AND activity_date >= $2';
            params.push(start_date);
        }
        if (end_date) {
            query += ' AND activity_date <= $' + (params.length + 1);
            params.push(end_date);
        }
        if (activity_type) {
            query += ' AND activity_type = $' + (params.length + 1);
            params.push(activity_type);
        }

        query += ' ORDER BY activity_date DESC, created_at DESC';

        try {
            const result = await pool.query(query, params);
            res.json({
                success: true,
                activities: result.rows
            });
        } catch (dbError) {
            console.error('활동 조회 오류:', dbError);
            res.status(500).json({ error: '활동 조회 중 오류가 발생했습니다.' });
        }

    } catch (error) {
        console.error('Activity fetch error:', error);
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
    console.log('✅ PostgreSQL 데이터베이스 연결 준비 완료');
    console.log('📊 데이터베이스: regio');
    console.log('👥 테이블: member, inputact');
});
