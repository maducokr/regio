const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');

// 환경변수 로드 (dotenv가 설치되어 있다면)
try {
    require('dotenv').config();
} catch (error) {
    console.log('dotenv 패키지가 설치되지 않았습니다. 환경변수를 직접 설정하세요.');
}

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// PostgreSQL 연결 설정 (Render / 로컬 모두 지원)
const isProduction = process.env.NODE_ENV === 'production';
const dbPoolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: isProduction ? { rejectUnauthorized: false } : false,
    }
    : {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'regio',
        password: process.env.DB_PASSWORD || '5854',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        ssl: isProduction ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool({
    ...dbPoolConfig,
    // 연결 풀 설정 최적화 (연결 누수 방지)
    max: 2, // 최대 연결 수를 더 줄임 (연결 한계 문제 해결)
    min: 0, // 최소 연결 수
    idleTimeoutMillis: 10000, // 유휴 연결 타임아웃 (10초로 단축)
    connectionTimeoutMillis: 3000, // 연결 타임아웃 (3초로 단축)
    acquireTimeoutMillis: 5000, // 연결 획득 타임아웃 (5초로 단축)
    // 연결 해제 강제 설정
    allowExitOnIdle: true, // 유휴 시 종료 허용
    // 연결 유지 설정
    keepAlive: false, // keepAlive 비활성화
    keepAliveInitialDelayMillis: 0,
    // 추가 연결 최적화 설정
    statement_timeout: 30000, // 쿼리 타임아웃 (30초)
    query_timeout: 30000, // 쿼리 타임아웃 (30초)
    application_name: 'regio-app' // 애플리케이션 이름
});

// 데이터베이스 연결 테스트
pool.on('connect', () => {
    console.log('✅ PostgreSQL 데이터베이스에 연결되었습니다.');
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL 연결 오류:', err);
});

// 데이터베이스 연결 상태 확인 (재시도 로직 포함)
async function testDatabaseConnection(retryCount = 0) {
    const maxRetries = 3;
    let client;
    
    try {
        console.log(`🔄 데이터베이스 연결 테스트 시작... (시도 ${retryCount + 1}/${maxRetries + 1})`);
        
        // 연결 풀에서 클라이언트 획득 (타임아웃 설정)
        client = await Promise.race([
            pool.connect(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Connection timeout')), 3000)
            )
        ]);
        
        const result = await client.query('SELECT NOW()');
        console.log('✅ 데이터베이스 연결 테스트 성공:', result.rows[0]);
        
        // 연결 풀 상태 확인
        console.log('📊 연결 풀 상태:', {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount
        });
        
    } catch (err) {
        console.error('❌ 데이터베이스 연결 테스트 실패:', err.message);
        console.error('에러 코드:', err.code);
        
        // 특정 에러 코드에 대한 재시도 로직
        if ((err.code === '53300' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') && retryCount < maxRetries) {
            const delay = 2000 * (retryCount + 1); // 2초, 4초, 6초
            console.log(`⏳ ${delay}ms 후 재시도...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return testDatabaseConnection(retryCount + 1);
        }
        
        console.log('💡 해결 방법:');
        console.log('1. PostgreSQL이 실행 중인지 확인하세요');
        console.log('2. 데이터베이스 "regio"가 존재하는지 확인하세요');
        console.log('3. 환경변수 DB_PASSWORD를 설정하거나 기본 비밀번호를 확인하세요');
        console.log('4. 연결 수가 한계를 초과했을 수 있습니다. 잠시 후 다시 시도하세요');
        console.log('5. PostgreSQL 서비스를 재시작해보세요');
        console.log('6. pg_hba.conf 파일에서 인증 방식을 확인하세요');
        
    } finally {
        // 연결 해제 보장
        if (client) {
            try {
                client.release();
                console.log('✅ 데이터베이스 클라이언트 연결 해제 완료');
            } catch (releaseErr) {
                console.error('❌ 클라이언트 연결 해제 오류:', releaseErr);
            }
        }
    }
}

// 컬럼 순서 저장 API
app.post('/api/save-column-order', async (req, res) => {
    const { columns, timestamp } = req.body;
    
    if (!columns || !Array.isArray(columns)) {
        return res.status(400).json({
            success: false,
            message: '유효하지 않은 데이터입니다.'
        });
    }
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // 컬럼 정보 테이블이 없으면 생성 (번호 제외)
        await client.query(`
            CREATE TABLE IF NOT EXISTS column_order_history (
                id SERIAL PRIMARY KEY,
                column_name VARCHAR(200) NOT NULL,
                activity_description TEXT,
                original_order INTEGER NOT NULL,
                saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                batch_id VARCHAR(50)
            )
        `);
        
        const batchId = `batch_${Date.now()}`;
        
        // 각 컬럼의 정보를 저장 (번호 제외)
        for (const column of columns) {
            await client.query(`
                INSERT INTO column_order_history 
                (column_name, activity_description, original_order, batch_id)
                VALUES ($1, $2, $3, $4)
            `, [
                column.columnName,
                column.activityDescription,
                column.originalNumber,
                batchId
            ]);
        }
        
        // member 테이블에 컬럼 정보를 저장하는 별도 테이블 생성 (번호 제외)
        await client.query(`
            CREATE TABLE IF NOT EXISTS member_column_order (
                id SERIAL PRIMARY KEY,
                column_name VARCHAR(200) NOT NULL UNIQUE,
                activity_description TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 새로운 컬럼과 기존 컬럼을 구분하여 처리
        const existingColumns = [];
        const newColumns = [];
        
        for (const column of columns) {
            if (column.isNew) {
                newColumns.push(column);
            } else {
                existingColumns.push(column);
            }
        }
        
        // 기존 컬럼 정보 업데이트
        for (const column of existingColumns) {
            await client.query(`
                INSERT INTO member_column_order 
                (column_name, activity_description)
                VALUES ($1, $2)
                ON CONFLICT (column_name) 
                DO UPDATE SET 
                    activity_description = EXCLUDED.activity_description,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                column.columnName,
                column.activityDescription
            ]);
        }
        
        // 새로운 컬럼 추가
        const newColumnResults = [];
        for (const column of newColumns) {
            try {
                // 컬럼명 유효성 검사
                if (!column.columnName || column.columnName.trim() === '') {
                    throw new Error('빈 컬럼명');
                }
                
                // 특수문자나 SQL 인젝션 방지
                const columnName = column.columnName.trim().replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
                
                await client.query(`
                    INSERT INTO member_column_order 
                    (column_name, activity_description)
                    VALUES ($1, $2)
                `, [
                    columnName,
                    column.activityDescription || ''
                ]);
                
                newColumnResults.push({
                    columnName: columnName,
                    success: true
                });
                
                // 새로운 컬럼을 member 테이블에 추가하는 로직
                try {
                    // 먼저 컬럼이 이미 존재하는지 확인
                    const columnExists = await client.query(`
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'member' AND column_name = $1
                    `, [columnName]);
                    
                    if (columnExists.rows.length === 0) {
                        // 컬럼이 존재하지 않으면 추가
                        const alterQuery = `ALTER TABLE member ADD COLUMN "${columnName}" INTEGER DEFAULT 0`;
                        await client.query(alterQuery);
                        console.log(`새로운 컬럼이 member 테이블에 추가됨: ${columnName}`);
                        console.log(`실행된 SQL: ${alterQuery}`);
                    } else {
                        console.log(`컬럼이 이미 존재함: ${columnName}`);
                    }
                } catch (alterError) {
                    console.error(`member 테이블에 컬럼 추가 실패 (${columnName}):`, alterError);
                    console.error(`에러 상세:`, alterError.message);
                    // 컬럼 추가 실패 시에도 계속 진행
                }
                
            } catch (error) {
                console.error(`새로운 컬럼 추가 중 오류 (${column.columnName}):`, error);
                newColumnResults.push({
                    columnName: column.columnName,
                    success: false,
                    error: error.message
                });
                // 새로운 컬럼 추가 실패 시에도 기존 컬럼 업데이트는 계속 진행
            }
        }
        
        await client.query('COMMIT');
        
        const successCount = existingColumns.length + newColumnResults.filter(r => r.success).length;
        const failedNewColumns = newColumnResults.filter(r => !r.success);
        
        let message = `컬럼 정보가 성공적으로 저장되었습니다. (총 ${successCount}개)`;
        if (newColumnResults.length > 0) {
            const successNewCount = newColumnResults.filter(r => r.success).length;
            message += ` (새로운 컬럼 ${successNewCount}개가 member 테이블에 추가됨)`;
        }
        
        // 새로운 컬럼이 추가된 경우 즉시 확인
        let addedColumnsInfo = [];
        if (newColumnResults.filter(r => r.success).length > 0) {
            try {
                const memberColumnsCheck = await client.query(`
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'member' 
                    ORDER BY ordinal_position
                `);
                addedColumnsInfo = memberColumnsCheck.rows;
                console.log('member 테이블 현재 컬럼 목록:', addedColumnsInfo.map(col => col.column_name));
            } catch (checkError) {
                console.error('member 테이블 컬럼 확인 중 오류:', checkError);
            }
        }

        res.json({
            success: true,
            message: message,
            savedCount: successCount,
            newColumnsAdded: newColumnResults.filter(r => r.success).length,
            failedNewColumns: failedNewColumns,
            addedColumnsInfo: addedColumnsInfo,
            batchId: batchId,
            timestamp: timestamp
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('DB 저장 오류:', error);
        res.status(500).json({
            success: false,
            message: '데이터베이스 저장 중 오류가 발생했습니다.',
            error: error.message
        });
    } finally {
        client.release();
    }
});

// 저장된 컬럼 정보 조회 API
app.get('/api/get-column-order', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT column_name, activity_description, updated_at
            FROM member_column_order
            ORDER BY id ASC
        `);
        
        res.json({
            success: true,
            columns: result.rows
        });
        
    } catch (error) {
        console.error('컬럼 정보 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '컬럼 정보 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 저장 히스토리 조회 API
app.get('/api/get-save-history', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT batch_id, saved_at, COUNT(*) as column_count
            FROM column_order_history
            GROUP BY batch_id, saved_at
            ORDER BY saved_at DESC
            LIMIT 10
        `);
        
        res.json({
            success: true,
            history: result.rows
        });
        
    } catch (error) {
        console.error('저장 히스토리 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '저장 히스토리 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 회원 조회 API
app.get('/api/members', async (req, res) => {
    try {
        const currentUserName = req.query.current_user_name;
        
        let query = 'SELECT * FROM member';
        let params = [];
        
        if (currentUserName) {
            // 현재 로그인한 사용자의 정보를 먼저 조회
            const currentUserResult = await pool.query(
                'SELECT * FROM member WHERE name = $1',
                [currentUserName]
            );
            
            if (currentUserResult.rows.length > 0) {
                const currentUser = currentUserResult.rows[0];
                
                // 같은 성당과 Pr의 회원들 조회
                query = `
                    SELECT * FROM member 
                    WHERE church_name = $1 AND pr_name = $2
                    ORDER BY name
                `;
                params = [currentUser.church_name, currentUser.pr_name];
            }
        }
        
        const result = await pool.query(query, params);
        res.json(result.rows);
        
    } catch (err) {
        console.error('회원 조회 오류:', err);
        res.status(500).json({ error: '회원 조회 중 오류가 발생했습니다.' });
    }
});

// 개별 회원 조회 API
app.get('/api/members/:id', async (req, res) => {
    try {
        const memberId = parseInt(req.params.id);
        
        if (isNaN(memberId)) {
            return res.status(400).json({ error: '유효하지 않은 회원 ID입니다.' });
        }
        
        const result = await pool.query(
            'SELECT * FROM member WHERE id = $1',
            [memberId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
        }
        
        res.json(result.rows[0]);
        
    } catch (err) {
        console.error('개별 회원 조회 오류:', err);
        res.status(500).json({ error: '회원 조회 중 오류가 발생했습니다.' });
    }
});

// 회원 정보 수정 API
app.put('/api/members/:id', async (req, res) => {
    try {
        const memberId = parseInt(req.params.id);
        const { name, baptism_name, church_name, pr_name, position, phone_last4, resident_id_front6, phone_full, resident_id_full } = req.body;
        
        if (isNaN(memberId)) {
            return res.status(400).json({ error: '유효하지 않은 회원 ID입니다.' });
        }
        
        // 회원 존재 확인
        const existingMember = await pool.query(
            'SELECT * FROM member WHERE id = $1',
            [memberId]
        );
        
        if (existingMember.rows.length === 0) {
            return res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
        }
        
        // 회원 정보 수정
        const result = await pool.query(
            `UPDATE member SET 
             name = $1, baptism_name = $2, church_name = $3, pr_name = $4, position = $5,
             phone_last4 = $6, resident_id_front6 = $7, phone_full = $8, resident_id_full = $9
             WHERE id = $10
             RETURNING *`,
            [name, baptism_name, church_name, pr_name, position, phone_last4, resident_id_front6, phone_full, resident_id_full, memberId]
        );
        
        console.log('회원 정보 수정 성공:', result.rows[0].name);
        res.json({
            success: true,
            message: '회원 정보가 성공적으로 수정되었습니다.',
            member: result.rows[0]
        });
        
    } catch (err) {
        console.error('회원 정보 수정 오류:', err);
        res.status(500).json({ error: '회원 정보 수정 중 오류가 발생했습니다.' });
    }
});

// 1. 활동종목 조회 API
app.get('/api/categories', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM activity_categories ORDER BY category_group, category_name');
        res.json(result.rows);
    } catch (err) {
        console.error('활동종목 조회 오류:', err);
        res.status(500).json({ error: '활동종목 조회 중 오류가 발생했습니다.' });
    }
});

// 2. 활동종목 컬럼 추가 API
app.post('/api/categories', async (req, res) => {
    try {
        const { category_name, category_group, description } = req.body;

        console.log('활동 카테고리 추가 요청:', {
            category_name,
            category_group,
            description
        });

        // 필수 필드 검증
        if (!category_name || !category_group) {
            return res.status(400).json({ error: '활동종목명과 활동그룹은 필수입니다.' });
        }

        // 중복 확인
        const existingCategory = await pool.query(
            'SELECT id FROM activity_categories WHERE category_name = $1',
            [category_name]
        );

        if (existingCategory.rows.length > 0) {
            return res.status(400).json({ error: '이미 존재하는 활동종목명입니다.' });
        }

        // 새 활동 카테고리 추가
        const result = await pool.query(
            `INSERT INTO activity_categories (category_name, category_group, description) 
             VALUES ($1, $2, $3) 
             RETURNING id, category_name, category_group, description`,
            [category_name, category_group, description || null]
        );

        console.log('활동 카테고리 추가 성공:', result.rows[0]);

        res.status(201).json({
            success: true,
            message: '활동 카테고리가 성공적으로 추가되었습니다.',
            category: result.rows[0]
        });

    } catch (err) {
        console.error('활동 카테고리 추가 오류:', err);
        res.status(500).json({ error: '활동 카테고리 추가 중 오류가 발생했습니다.' });
    }
});

// 3. 활동종목 수정 API
app.put('/api/categories/:id', async (req, res) => {
    try {
        const categoryId = parseInt(req.params.id);
        const { category_name, category_group, description } = req.body;

        console.log('활동 카테고리 수정 요청:', {
            categoryId,
            category_name,
            category_group,
            description
        });

        if (isNaN(categoryId)) {
            return res.status(400).json({ error: '유효하지 않은 카테고리 ID입니다.' });
        }

        // 필수 필드 검증
        if (!category_name || !category_group) {
            return res.status(400).json({ error: '활동종목명과 활동그룹은 필수입니다.' });
        }

        // 카테고리 존재 확인
        const existingCategory = await pool.query(
            'SELECT id FROM activity_categories WHERE id = $1',
            [categoryId]
        );

        if (existingCategory.rows.length === 0) {
            return res.status(404).json({ error: '활동 카테고리를 찾을 수 없습니다.' });
        }

        // 중복 확인 (다른 카테고리와 동일한 이름인지)
        const duplicateCategory = await pool.query(
            'SELECT id FROM activity_categories WHERE category_name = $1 AND id != $2',
            [category_name, categoryId]
        );

        if (duplicateCategory.rows.length > 0) {
            return res.status(400).json({ error: '이미 존재하는 활동종목명입니다.' });
        }

        // 활동 카테고리 수정
        const result = await pool.query(
            `UPDATE activity_categories 
             SET category_name = $1, category_group = $2, description = $3
             WHERE id = $4 
             RETURNING id, category_name, category_group, description`,
            [category_name, category_group, description || null, categoryId]
        );

        console.log('활동 카테고리 수정 성공:', result.rows[0]);

        res.json({
            success: true,
            message: '활동 카테고리가 성공적으로 수정되었습니다.',
            category: result.rows[0]
        });

    } catch (err) {
        console.error('활동 카테고리 수정 오류:', err);
        res.status(500).json({ error: '활동 카테고리 수정 중 오류가 발생했습니다.' });
    }
});

// 4. 활동자료 조회 API (카테고리별)
app.get('/api/activity-records/:categoryId', async (req, res) => {
    try {
        const categoryId = parseInt(req.params.categoryId);
        const memberId = req.query.member_id ? parseInt(req.query.member_id) : null;
        
        if (isNaN(categoryId)) {
            return res.status(400).json({ error: '유효하지 않은 카테고리 ID입니다.' });
        }

        let query = `SELECT ar.id, ar.member_id, ar.category_id, ar.target, ar.count,
                            ar.catechism_guide, ar.group_join, ar.meeting_head, ar.resolution,
                            ar.sacrament, ar.confirmation, ar.baptism, ar.first_communion,
                            ar.year_count, ar.funeral_mass, ar.funeral_attendance, ar.inout_count,
                            ar.conditional_baptism, ar.conditional_communion, ar.membership,
                            ar.establishment, ar.note, ar.created_at, ar.updated_at,
                            TO_CHAR(ar.activity_date, 'YYYY-MM-DD') as activity_date,
                            m.name as member_name 
                     FROM activity_records ar 
                     LEFT JOIN member m ON ar.member_id = m.id 
                     WHERE ar.category_id = $1`;
        let params = [categoryId];

        if (memberId) {
            query += ` AND ar.member_id = $2`;
            params.push(memberId);
        }

        query += ` ORDER BY ar.activity_date DESC`;

        const result = await pool.query(query, params);

        console.log(`활동자료 조회 성공: 카테고리 ${categoryId}, ${result.rows.length}개`);
        res.json(result.rows);

    } catch (err) {
        console.error('활동자료 조회 오류:', err);
        res.status(500).json({ error: '활동자료 조회 중 오류가 발생했습니다.' });
    }
});

// 5. 활동자료 추가 API (동적 필드 지원)
app.post('/api/activity-records', async (req, res) => {
    try {
        const { category_id, member_id, target, count, catechism_guide, group_join, meeting_head, 
                resolution, sacrament, confirmation, baptism, first_communion, 
                year_count, funeral_mass, funeral_attendance, inout_count, conditional_baptism, 
                conditional_communion, membership, establishment, note, activity_date, 
                category_name, field_data } = req.body;

        console.log('활동자료 추가 요청:', { category_id, member_id, category_name, activity_date, field_data });
        
        // 날짜 처리 개선 - 시간대 문제 방지
        let processedDate = activity_date;
        if (activity_date && typeof activity_date === 'string') {
            // YYYY-MM-DD 형식인 경우 그대로 사용
            if (activity_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                processedDate = activity_date;
            } else {
                // 다른 형식인 경우 날짜 부분만 추출
                const dateMatch = activity_date.match(/(\d{4}-\d{2}-\d{2})/);
                if (dateMatch) {
                    processedDate = dateMatch[1];
                }
            }
        }

        // 새로운 동적 필드 방식 처리
        if (category_name && field_data) {
            if (!member_id || !activity_date) {
                return res.status(400).json({ error: '회원 ID와 활동 날짜는 필수입니다.' });
            }

            // 카테고리 ID 조회
            let categoryId = category_id;
            if (!categoryId && category_name) {
                const categoryResult = await pool.query(
                    'SELECT id FROM activity_categories WHERE category_name = $1',
                    [category_name]
                );
                
                if (categoryResult.rows.length === 0) {
                    return res.status(400).json({ error: '존재하지 않는 카테고리입니다.' });
                }
                categoryId = categoryResult.rows[0].id;
            }

            // 동적 필드 데이터를 기존 컬럼에 매핑
            const mappedData = {
                category_id: categoryId,
                member_id: member_id,
                target: field_data.target || null,
                count: field_data.횟수 || field_data.count || 0,
                catechism_guide: field_data.교리반인도 || field_data.catechism_guide || 0,
                group_join: field_data.단체가입 || field_data.group_join || 0,
                meeting_head: field_data.회두 || field_data.meeting_head || 0,
                resolution: field_data.해소 || field_data.resolution || 0,
                sacrament: field_data.성사 || field_data.sacrament || 0,
                confirmation: field_data.견진 || field_data.confirmation || 0,
                baptism: field_data.세례 || field_data.baptism || 0,
                first_communion: field_data.첫영성체 || field_data.first_communion || 0,
                year_count: field_data.연도 || field_data.year_count || 0,
                funeral_mass: field_data.장례미사 || field_data.funeral_mass || 0,
                funeral_attendance: field_data.장지참석 || field_data.funeral_attendance || 0,
                inout_count: field_data.입출관 || field_data.inout_count || 0,
                conditional_baptism: field_data.대세 || field_data.conditional_baptism || 0,
                conditional_communion: field_data.보례 || field_data.conditional_communion || 0,
                membership: field_data.입단 || field_data.membership || 0,
                establishment: field_data.설립 || field_data.establishment || 0,
                note: field_data.note || note || null,
                activity_date: processedDate
            };

            const result = await pool.query(
                `INSERT INTO activity_records 
                 (category_id, member_id, target, count, catechism_guide, group_join, meeting_head, 
                  resolution, sacrament, confirmation, baptism, first_communion, 
                  year_count, funeral_mass, funeral_attendance, inout_count, conditional_baptism, 
                  conditional_communion, membership, establishment, note, activity_date)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22::date)
                 RETURNING *`,
                [
                    mappedData.category_id, mappedData.member_id, mappedData.target, mappedData.count,
                    mappedData.catechism_guide, mappedData.group_join, mappedData.meeting_head,
                    mappedData.resolution, mappedData.sacrament, mappedData.confirmation, mappedData.baptism,
                    mappedData.first_communion, mappedData.year_count, mappedData.funeral_mass,
                    mappedData.funeral_attendance, mappedData.inout_count, mappedData.conditional_baptism, mappedData.conditional_communion,
                    mappedData.membership, mappedData.establishment, mappedData.note, mappedData.activity_date
                ]
            );

            console.log('동적 필드 활동자료 추가 성공:', result.rows[0].id);
            res.json({
                success: true,
                record: result.rows[0]
            });

        } else {
            // 기존 방식 처리 (하위 호환성)
            if (!category_id || !member_id || !activity_date) {
                return res.status(400).json({ error: '카테고리 ID, 회원 ID, 활동 날짜는 필수입니다.' });
            }

            const result = await pool.query(
                `INSERT INTO activity_records 
                 (category_id, member_id, target, count, catechism_guide, group_join, meeting_head, 
                  resolution, sacrament, confirmation, baptism, first_communion, 
                  year_count, funeral_mass, funeral_attendance, inout_count, conditional_baptism, 
                  conditional_communion, membership, establishment, note, activity_date)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22::date)
                 RETURNING *`,
                [category_id, member_id, target, count || 0, catechism_guide || 0, group_join || 0, meeting_head || 0,
                 resolution || 0, sacrament || 0, confirmation || 0, baptism || 0, first_communion || 0,
                 year_count || 0, funeral_mass || 0, funeral_attendance || 0, inout_count || 0, conditional_baptism || 0,
                 conditional_communion || 0, membership || 0, establishment || 0, note, processedDate || new Date().toISOString().split('T')[0]]
            );

            console.log('기존 방식 활동자료 추가 성공:', result.rows[0].id);
            res.json({
                success: true,
                record: result.rows[0]
            });
        }

    } catch (err) {
        console.error('활동자료 추가 오류:', err);
        res.status(500).json({ error: '활동자료 추가 중 오류가 발생했습니다.' });
    }
});

// 6. 활동자료 수정 API
app.put('/api/activity-records/:id', async (req, res) => {
    try {
        const recordId = parseInt(req.params.id);
        const { target, count, catechism_guide, group_join, meeting_head, 
                resolution, sacrament, confirmation, baptism, first_communion, 
                year_count, funeral_mass, funeral_attendance, inout_count, conditional_baptism, 
                conditional_communion, membership, establishment, note, activity_date } = req.body;

        if (isNaN(recordId)) {
            return res.status(400).json({ error: '유효하지 않은 활동자료 ID입니다.' });
        }

        console.log('활동자료 수정 요청:', { recordId, target, activity_date });

        const result = await pool.query(
            `UPDATE activity_records SET 
             target = $1, count = $2, catechism_guide = $3, group_join = $4, meeting_head = $5,
             resolution = $6, sacrament = $7, confirmation = $8, baptism = $9, first_communion = $10,
             year_count = $11, funeral_mass = $12, funeral_attendance = $13, inout_count = $14, conditional_baptism = $15,
             conditional_communion = $16, membership = $17, establishment = $18, note = $19, activity_date = $20::date,
             updated_at = CURRENT_TIMESTAMP
             WHERE id = $21 RETURNING *`,
            [target, count || 0, catechism_guide || 0, group_join || 0, meeting_head || 0,
             resolution || 0, sacrament || 0, confirmation || 0, baptism || 0, first_communion || 0,
             year_count || 0, funeral_mass || 0, funeral_attendance || 0, inout_count || 0, conditional_baptism || 0,
             conditional_communion || 0, membership || 0, establishment || 0, note, activity_date, recordId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: '활동자료를 찾을 수 없습니다.' });
        }

        console.log('활동자료 수정 성공:', result.rows[0].id);
        res.json({
            success: true,
            record: result.rows[0]
        });

    } catch (err) {
        console.error('활동자료 수정 오류:', err);
        res.status(500).json({ error: '활동자료 수정 중 오류가 발생했습니다.' });
    }
});

// 7. 로그인 API
app.post('/api/login', async (req, res) => {
    let client;
    try {
        const { name, password } = req.body;

        console.log('로그인 요청:', { name, password: password ? '***' : 'undefined' });

        if (!name || !password) {
            return res.status(400).json({ error: '성명과 비밀번호를 입력해주세요.' });
        }

        // 연결 풀에서 클라이언트 가져오기 (타임아웃 설정)
        client = await Promise.race([
            pool.connect(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Connection timeout')), 3000)
            )
        ]);
        console.log('✅ 데이터베이스 클라이언트 연결 성공');

        // 사용자 조회
        const result = await client.query(
            'SELECT * FROM member WHERE name = $1 AND passno = $2',
            [name, password]
        );

        if (result.rows.length === 0) {
            console.log('❌ 로그인 실패: 사용자를 찾을 수 없음');
            return res.status(401).json({ error: '성명 또는 비밀번호가 올바르지 않습니다.' });
        }

        const user = result.rows[0];
        console.log('✅ 로그인 성공:', user.name);

        res.json({
            success: true,
            message: '로그인 성공',
            user: {
                id: user.id,
                name: user.name,
                baptism_name: user.baptism_name,
                church_name: user.church_name,
                pr_name: user.pr_name,
                position: user.position
            }
        });

    } catch (err) {
        console.error('❌ 로그인 오류:', err);
        
        // 데이터베이스 연결 관련 오류인지 확인
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
            res.status(503).json({ error: '데이터베이스 연결에 실패했습니다. 잠시 후 다시 시도해주세요.' });
        } else if (err.code === 'ETIMEDOUT' || err.message === 'Connection timeout') {
            res.status(504).json({ error: '데이터베이스 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.' });
        } else if (err.code === '53300') {
            res.status(503).json({ error: '데이터베이스 연결 한계에 도달했습니다. 잠시 후 다시 시도해주세요.' });
        } else {
            res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' });
        }
    } finally {
        // 클라이언트 연결 해제 (강제 해제)
        if (client) {
            try {
                client.release();
                console.log('✅ 데이터베이스 클라이언트 연결 해제');
            } catch (releaseErr) {
                console.error('❌ 클라이언트 연결 해제 오류:', releaseErr);
                // 강제로 연결 해제 시도
                try {
                    client.end();
                } catch (endErr) {
                    console.error('❌ 강제 연결 해제도 실패:', endErr);
                }
            }
        }
    }
});

// 8. 세목별 활동 기록 API (daily_activities 테이블)
app.post('/api/daily-activities', async (req, res) => {
    try {
        const { member_id, activity_date, evangelism_count, care_count, needy_count, legion_count } = req.body;

        console.log('세목별 활동 기록 요청:', { member_id, activity_date, evangelism_count, care_count, needy_count, legion_count });

        if (!member_id || !activity_date) {
            return res.status(400).json({ error: '회원 ID와 활동 날짜는 필수입니다.' });
        }

        // 기존 기록이 있는지 확인
        const existingRecord = await pool.query(
            'SELECT id FROM daily_activities WHERE member_id = $1 AND activity_date = $2',
            [member_id, activity_date]
        );

        let result;
        if (existingRecord.rows.length > 0) {
            // 기존 기록 업데이트
            result = await pool.query(
                `UPDATE daily_activities SET 
                 evangelism_count = $1, care_count = $2, needy_count = $3, legion_count = $4,
                 updated_at = CURRENT_TIMESTAMP
                 WHERE member_id = $5 AND activity_date = $6
                 RETURNING *`,
                [evangelism_count || 0, care_count || 0, needy_count || 0, legion_count || 0, member_id, activity_date]
            );
            console.log('세목별 활동 기록 업데이트 성공:', result.rows[0].id);
        } else {
            // 새 기록 추가
            result = await pool.query(
                `INSERT INTO daily_activities 
                 (member_id, activity_date, evangelism_count, care_count, needy_count, legion_count)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [member_id, activity_date, evangelism_count || 0, care_count || 0, needy_count || 0, legion_count || 0]
            );
            console.log('세목별 활동 기록 추가 성공:', result.rows[0].id);
        }

        res.json({
            success: true,
            record: result.rows[0]
        });

    } catch (err) {
        console.error('세목별 활동 기록 오류:', err);
        res.status(500).json({ error: '세목별 활동 기록 중 오류가 발생했습니다.' });
    }
});

// 9. 기도생활 기록 API (prayer_activities 테이블)
app.post('/api/prayer-activities', async (req, res) => {
    try {
        const { member_id, week_start_date, daily_prayer_count, rosary_count, mass_attendance_count, confession_count } = req.body;

        console.log('기도생활 기록 요청:', { member_id, week_start_date, daily_prayer_count, rosary_count, mass_attendance_count, confession_count });

        if (!member_id || !week_start_date) {
            return res.status(400).json({ error: '회원 ID와 주 시작일은 필수입니다.' });
        }

        // 기존 기록이 있는지 확인
        const existingRecord = await pool.query(
            'SELECT id FROM prayer_activities WHERE member_id = $1 AND week_start_date = $2',
            [member_id, week_start_date]
        );

        let result;
        if (existingRecord.rows.length > 0) {
            // 기존 기록 업데이트
            result = await pool.query(
                `UPDATE prayer_activities SET 
                 daily_prayer_count = $1, rosary_count = $2, mass_attendance_count = $3, confession_count = $4,
                 updated_at = CURRENT_TIMESTAMP
                 WHERE member_id = $5 AND week_start_date = $6
                 RETURNING *`,
                [daily_prayer_count || 0, rosary_count || 0, mass_attendance_count || 0, confession_count || 0, member_id, week_start_date]
            );
            console.log('기도생활 기록 업데이트 성공:', result.rows[0].id);
        } else {
            // 새 기록 추가
            result = await pool.query(
                `INSERT INTO prayer_activities 
                 (member_id, week_start_date, daily_prayer_count, rosary_count, mass_attendance_count, confession_count)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [member_id, week_start_date, daily_prayer_count || 0, rosary_count || 0, mass_attendance_count || 0, confession_count || 0]
            );
            console.log('기도생활 기록 추가 성공:', result.rows[0].id);
        }

        res.json({
            success: true,
            record: result.rows[0]
        });

    } catch (err) {
        console.error('기도생활 기록 오류:', err);
        res.status(500).json({ error: '기도생활 기록 중 오류가 발생했습니다.' });
    }
});

// 10. 지구와 함께 활동 기록 API (community_activities 테이블)
app.post('/api/community-activities', async (req, res) => {
    try {
        const { member_id, week_start_date, community_service_count, environmental_activity_count, social_justice_count, charity_work_count } = req.body;

        console.log('지구와 함께 활동 기록 요청:', { member_id, week_start_date, community_service_count, environmental_activity_count, social_justice_count, charity_work_count });

        if (!member_id || !week_start_date) {
            return res.status(400).json({ error: '회원 ID와 주 시작일은 필수입니다.' });
        }

        // 기존 기록이 있는지 확인
        const existingRecord = await pool.query(
            'SELECT id FROM community_activities WHERE member_id = $1 AND week_start_date = $2',
            [member_id, week_start_date]
        );

        let result;
        if (existingRecord.rows.length > 0) {
            // 기존 기록 업데이트
            result = await pool.query(
                `UPDATE community_activities SET 
                 community_service_count = $1, environmental_activity_count = $2, social_justice_count = $3, charity_work_count = $4,
                 updated_at = CURRENT_TIMESTAMP
                 WHERE member_id = $1 AND week_start_date = $2
                 RETURNING *`,
                [community_service_count || 0, environmental_activity_count || 0, social_justice_count || 0, charity_work_count || 0, member_id, week_start_date]
            );
            console.log('지구와 함께 활동 기록 업데이트 성공:', result.rows[0].id);
        } else {
            // 새 기록 추가
            result = await pool.query(
                `INSERT INTO community_activities 
                 (member_id, week_start_date, community_service_count, environmental_activity_count, social_justice_count, charity_work_count)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [member_id, week_start_date, community_service_count || 0, environmental_activity_count || 0, social_justice_count || 0, charity_work_count || 0]
            );
            console.log('지구와 함께 활동 기록 추가 성공:', result.rows[0].id);
        }

        res.json({
            success: true,
            record: result.rows[0]
        });

    } catch (err) {
        console.error('지구와 함께 활동 기록 오류:', err);
        res.status(500).json({ error: '지구와 함께 활동 기록 중 오류가 발생했습니다.' });
    }
});

// 11. 개인정보 조회 API
app.get('/api/user/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        console.log('개인정보 조회 요청 - 사용자 ID:', userId, '타입:', typeof userId);
        
        if (isNaN(userId)) {
            console.log('유효하지 않은 사용자 ID:', req.params.id);
            return res.status(400).json({ error: '유효하지 않은 사용자 ID입니다.' });
        }

        console.log('데이터베이스 조회 시도 - ID:', userId);
        
        const result = await pool.query(
            `SELECT id, name, baptism_name, church_name, pr_name, position, 
                    phone_last4, resident_id_front6, phone_full, resident_id_full, passno
             FROM member WHERE id = $1`,
            [userId]
        );

        console.log('데이터베이스 조회 결과 - 행 수:', result.rows.length);

        if (result.rows.length === 0) {
            console.log('사용자를 찾을 수 없음 - ID:', userId);
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }

        console.log('개인정보 조회 성공:', result.rows[0].name, 'ID:', result.rows[0].id);
        res.json({
            success: true,
            user: result.rows[0]
        });

    } catch (err) {
        console.error('개인정보 조회 오류:', err);
        res.status(500).json({ error: '개인정보 조회 중 오류가 발생했습니다.' });
    }
});

// 12. 개인정보 수정 API
app.put('/api/user/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        if (isNaN(userId)) {
            return res.status(400).json({ error: '유효하지 않은 사용자 ID입니다.' });
        }

        const {
            name,
            baptism_name,
            church_name,
            pr_name,
            position,
            phone_last4,
            resident_id_front6,
            phone_full,
            resident_id_full
        } = req.body;

        console.log('개인정보 수정 요청:', {
            userId,
            name,
            baptism_name,
            church_name,
            pr_name,
            position,
            phone_last4,
            resident_id_front6,
            phone_full,
            resident_id_full
        });

        // 필수 필드 검증
        if (!name || !phone_last4 || !resident_id_front6) {
            return res.status(400).json({ error: '필수 정보를 모두 입력해주세요.' });
        }

        // 사용자 존재 확인
        const existingUser = await pool.query(
            'SELECT id, name FROM member WHERE id = $1',
            [userId]
        );

        if (existingUser.rows.length === 0) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }

        // 중복 확인 (다른 사용자와 동일한 성명인지)
        const duplicateName = await pool.query(
            'SELECT id, name FROM member WHERE name = $1 AND id != $2',
            [name, userId]
        );

        if (duplicateName.rows.length > 0) {
            return res.status(400).json({ error: '이미 사용 중인 성명입니다.' });
        }

        // 전화번호 끝 4자리 + 주민번호 앞 6자리 조합으로 중복 확인 (다른 사용자와)
        const duplicatePhoneResident = await pool.query(
            'SELECT id, name FROM member WHERE phone_last4 = $1 AND resident_id_front6 = $2 AND id != $3',
            [phone_last4, resident_id_front6, userId]
        );

        if (duplicatePhoneResident.rows.length > 0) {
            return res.status(400).json({ error: '이미 사용 중인 전화번호와 주민번호 조합입니다.' });
        }

        // passno 업데이트 (전화번호 끝 4자리 + 주민번호 앞 6자리)
        const passno = phone_last4 + resident_id_front6;

        // 개인정보 업데이트
        const result = await pool.query(
            `UPDATE member 
             SET name = $1, baptism_name = $2, church_name = $3, pr_name = $4, 
                 position = $5, phone_last4 = $6, resident_id_front6 = $7, 
                 phone_full = $8, resident_id_full = $9, passno = $10
             WHERE id = $11 
             RETURNING id, name, baptism_name, church_name, pr_name, position, 
                       phone_last4, resident_id_front6, phone_full, resident_id_full, passno`,
            [name, baptism_name || null, church_name || null, pr_name || null, 
             position || null, phone_last4, resident_id_front6, phone_full || null, 
             resident_id_full || null, passno, userId]
        );

        console.log('개인정보 수정 성공:', result.rows[0].name);
        res.json({
            success: true,
            message: '개인정보가 성공적으로 수정되었습니다.',
            user: result.rows[0]
        });

    } catch (err) {
        console.error('개인정보 수정 오류:', err);
        
        // 구체적인 에러 메시지 제공
        if (err.code === '23505') {
            if (err.detail && err.detail.includes('name')) {
                res.status(400).json({ error: '이미 사용 중인 성명입니다.' });
            } else {
                res.status(400).json({ error: '중복된 정보가 있습니다.' });
            }
        } else {
            res.status(500).json({ error: '개인정보 수정 중 오류가 발생했습니다.' });
        }
    }
});

// 10. 회원가입 API
app.post('/api/register', async (req, res) => {
    try {
        const {
            name,
            baptism_name,
            church_name,
            pr_name,
            position,
            phone_last4,
            resident_id_front6,
            phone_full,
            resident_id_full
        } = req.body;

        console.log('회원가입 요청:', {
            name,
            church_name,
            pr_name,
            phone_last4,
            resident_id_front6
        });

        // 필수 필드 검증
        if (!name || !church_name || !pr_name || !phone_last4 || !resident_id_front6) {
            return res.status(400).json({ error: '필수 정보를 모두 입력해주세요.' });
        }

        // 전화번호 끝 4자리와 주민번호 앞 6자리 길이 검증
        if (phone_last4.length !== 4) {
            return res.status(400).json({ error: '전화번호 끝 4자리를 정확히 입력해주세요.' });
        }

        if (resident_id_front6.length !== 6) {
            return res.status(400).json({ error: '주민번호 앞 6자리를 정확히 입력해주세요.' });
        }

        // 중복 확인 (성명)
        const existingName = await pool.query(
            'SELECT id FROM member WHERE name = $1',
            [name]
        );

        if (existingName.rows.length > 0) {
            return res.status(400).json({ error: '이미 사용 중인 성명입니다.' });
        }

        // 중복 확인 (전화번호 끝 4자리 + 주민번호 앞 6자리)
        const existingPhoneResident = await pool.query(
            'SELECT id FROM member WHERE phone_last4 = $1 AND resident_id_front6 = $2',
            [phone_last4, resident_id_front6]
        );

        if (existingPhoneResident.rows.length > 0) {
            return res.status(400).json({ error: '이미 사용 중인 전화번호와 주민번호 조합입니다.' });
        }

        // passno 생성 (전화번호 끝 4자리 + 주민번호 앞 6자리)
        const passno = phone_last4 + resident_id_front6;

        // 새 회원 추가
        const result = await pool.query(
            `INSERT INTO member 
             (name, baptism_name, church_name, pr_name, position, phone_last4, 
              resident_id_front6, phone_full, resident_id_full, passno)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id, name, baptism_name, church_name, pr_name, position, 
                       phone_last4, resident_id_front6, phone_full, resident_id_full, passno`,
            [name, baptism_name || null, church_name, pr_name, position || null, 
             phone_last4, resident_id_front6, phone_full || null, resident_id_full || null, passno]
        );

        console.log('회원가입 성공:', result.rows[0].name);
        res.status(201).json({
            success: true,
            message: '회원가입이 완료되었습니다.',
            user: result.rows[0]
        });

    } catch (err) {
        console.error('회원가입 오류:', err);
        
        // 구체적인 에러 메시지 제공
        if (err.code === '23505') {
            if (err.detail && err.detail.includes('name')) {
                res.status(400).json({ error: '이미 사용 중인 성명입니다.' });
            } else {
                res.status(400).json({ error: '중복된 정보가 있습니다.' });
            }
        } else {
            res.status(500).json({ error: '회원가입 중 오류가 발생했습니다.' });
        }
    }
});

// 회원 관련 데이터 조회 API
app.get('/api/members/:id/related-data', async (req, res) => {
    try {
        const memberId = parseInt(req.params.id);
        
        if (isNaN(memberId)) {
            return res.status(400).json({ error: '유효하지 않은 회원 ID입니다.' });
        }

        // 각 테이블에서 관련 데이터 수 조회
        const activityRecordsResult = await pool.query(
            'SELECT COUNT(*) as count FROM activity_records WHERE member_id = $1',
            [memberId]
        );

        const dailyActivitiesResult = await pool.query(
            'SELECT COUNT(*) as count FROM daily_activities WHERE member_id = $1',
            [memberId]
        );

        const prayerActivitiesResult = await pool.query(
            'SELECT COUNT(*) as count FROM prayer_activities WHERE member_id = $1',
            [memberId]
        );

        const communityActivitiesResult = await pool.query(
            'SELECT COUNT(*) as count FROM community_activities WHERE member_id = $1',
            [memberId]
        );

        res.json({
            activity_records: parseInt(activityRecordsResult.rows[0].count),
            daily_activities: parseInt(dailyActivitiesResult.rows[0].count),
            prayer_activities: parseInt(prayerActivitiesResult.rows[0].count),
            community_activities: parseInt(communityActivitiesResult.rows[0].count)
        });

    } catch (err) {
        console.error('관련 데이터 조회 오류:', err);
        res.status(500).json({ error: '관련 데이터 조회 중 오류가 발생했습니다.' });
    }
});

// 회원 삭제 API (외래키 제약 조건 고려)
app.delete('/api/members/:id', async (req, res) => {
    try {
        const memberId = parseInt(req.params.id);
        
        if (isNaN(memberId)) {
            return res.status(400).json({ error: '유효하지 않은 회원 ID입니다.' });
        }

        // 트랜잭션 시작
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // 1. 먼저 관련된 activity_records 삭제
            const activityResult = await client.query(
                'DELETE FROM activity_records WHERE member_id = $1 RETURNING id',
                [memberId]
            );
            console.log(`삭제된 activity_records: ${activityResult.rows.length}개`);

            // 2. 다른 관련 테이블들도 삭제 (필요시)
            const dailyResult = await client.query(
                'DELETE FROM daily_activities WHERE member_id = $1 RETURNING id',
                [memberId]
            );
            console.log(`삭제된 daily_activities: ${dailyResult.rows.length}개`);

            const prayerResult = await client.query(
                'DELETE FROM prayer_activities WHERE member_id = $1 RETURNING id',
                [memberId]
            );
            console.log(`삭제된 prayer_activities: ${prayerResult.rows.length}개`);

            const communityResult = await client.query(
                'DELETE FROM community_activities WHERE member_id = $1 RETURNING id',
                [memberId]
            );
            console.log(`삭제된 community_activities: ${communityResult.rows.length}개`);
            
            // 3. 마지막으로 member 삭제
            const memberResult = await client.query(
                'DELETE FROM member WHERE id = $1 RETURNING id, name',
                [memberId]
            );

            if (memberResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: '삭제할 회원을 찾을 수 없습니다.' });
            }

            await client.query('COMMIT');

            console.log('회원 삭제 성공:', memberResult.rows[0].name);
            res.json({
                success: true,
                message: '회원이 성공적으로 삭제되었습니다.',
                deletedMember: memberResult.rows[0],
                deletedActivities: activityResult.rows.length + dailyResult.rows.length + 
                                  prayerResult.rows.length + communityResult.rows.length
            });

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error('회원 삭제 오류:', err);
        
        if (err.code === '23503') {
            res.status(400).json({ 
                error: '이 회원과 관련된 데이터가 있어 삭제할 수 없습니다. 먼저 관련 데이터를 삭제해주세요.' 
            });
        } else {
            res.status(500).json({ error: '회원 삭제 중 오류가 발생했습니다.' });
        }
    }
});

// member 테이블의 컬럼 목록 조회 API
app.get('/api/get-member-columns', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'member'
            ORDER BY ordinal_position
        `);
        
        res.json({
            success: true,
            columns: result.rows
        });
        
    } catch (error) {
        console.error('member 테이블 컬럼 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: 'member 테이블 컬럼 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 즉시 활동 입력 API (개선된 버전)
app.post('/api/activities/input', async (req, res) => {
    let client;
    try {
        const { member_id, category_name, field_name, field_value, activity_date, note } = req.body;

        console.log('🚀 즉시 활동 입력 요청:', { member_id, category_name, field_name, field_value, activity_date });

        // 빠른 입력 검증
        if (!member_id || !category_name || !field_name || !activity_date) {
            return res.status(400).json({ 
                success: false,
                error: '필수 정보가 누락되었습니다.',
                missing_fields: {
                    member_id: !member_id,
                    category_name: !category_name,
                    field_name: !field_name,
                    activity_date: !activity_date
                }
            });
        }

        // 허용된 필드명 목록 (SQL 인젝션 방지)
        const allowedFields = [
            'target', 'count', 'catechism_guide', 'group_join', 'meeting_head',
            'resolution', 'sacrament', 'confirmation', 'baptism', 'first_communion',
            'year_count', 'funeral_mass', 'funeral_attendance', 'conditional_baptism',
            'conditional_communion', 'membership', 'establishment', 'inout_count'
        ];

        if (!allowedFields.includes(field_name)) {
            return res.status(400).json({ 
                success: false,
                error: '유효하지 않은 필드명입니다.',
                allowed_fields: allowedFields
            });
        }

        // 연결 풀에서 클라이언트 획득
        client = await pool.connect();
        console.log('✅ DB 클라이언트 연결 성공');

        // 트랜잭션 시작
        await client.query('BEGIN');

        // 회원 존재 확인 (빠른 검증)
        const memberResult = await client.query(
            'SELECT id, name FROM member WHERE id = $1',
            [member_id]
        );

        if (memberResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ 
                success: false,
                error: '회원을 찾을 수 없습니다.',
                member_id: member_id
            });
        }

        // 카테고리 ID 조회 또는 생성
        let categoryResult = await client.query(
            'SELECT id FROM activity_categories WHERE category_name = $1',
            [category_name]
        );

        let categoryId;
        if (categoryResult.rows.length === 0) {
            // 카테고리 자동 생성
            const insertCategoryResult = await client.query(
                'INSERT INTO activity_categories (category_name, category_group, description) VALUES ($1, $2, $3) RETURNING id',
                [category_name, '기타', `${category_name} 활동`]
            );
            categoryId = insertCategoryResult.rows[0].id;
            console.log('✅ 새 카테고리 생성:', category_name, 'ID:', categoryId);
        } else {
            categoryId = categoryResult.rows[0].id;
        }

        // 기존 기록 확인 및 업데이트/삽입
        const existingRecord = await client.query(
            'SELECT id, note FROM activity_records WHERE member_id = $1 AND category_id = $2 AND activity_date = $3::date',
            [member_id, categoryId, activity_date]
        );

        let result;
        if (existingRecord.rows.length > 0) {
            // 기존 기록 업데이트
            const updateQuery = `
                UPDATE activity_records 
                SET ${field_name} = $1, note = COALESCE($2, note), updated_at = CURRENT_TIMESTAMP
                WHERE member_id = $3 AND category_id = $4 AND activity_date = $5::date
                RETURNING *
            `;
            result = await client.query(updateQuery, [
                field_value, 
                note, 
                member_id, 
                categoryId, 
                activity_date
            ]);
            console.log('✅ 활동 기록 업데이트 성공:', result.rows[0].id);
        } else {
            // 새 기록 추가
            const insertQuery = `
                INSERT INTO activity_records 
                (member_id, category_id, ${field_name}, note, activity_date)
                VALUES ($1, $2, $3, $4, $5::date)
                RETURNING *
            `;
            result = await client.query(insertQuery, [
                member_id, 
                categoryId, 
                field_value, 
                note, 
                activity_date
            ]);
            console.log('✅ 새 활동 기록 추가 성공:', result.rows[0].id);
        }

        // 트랜잭션 커밋
        await client.query('COMMIT');

        // 즉시 응답 반환
        res.json({
            success: true,
            message: '활동이 즉시 저장되었습니다!',
            record: result.rows[0],
            timestamp: new Date().toISOString(),
            processing_time: Date.now()
        });

    } catch (err) {
        // 트랜잭션 롤백
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackErr) {
                console.error('❌ 롤백 오류:', rollbackErr);
            }
        }
        
        console.error('❌ 즉시 활동 입력 오류:', err);
        res.status(500).json({ 
            success: false,
            error: '활동 입력 중 오류가 발생했습니다.',
            details: err.message,
            timestamp: new Date().toISOString()
        });
    } finally {
        // 클라이언트 연결 해제
        if (client) {
            try {
                client.release();
                console.log('✅ DB 클라이언트 연결 해제');
            } catch (releaseErr) {
                console.error('❌ 클라이언트 연결 해제 오류:', releaseErr);
            }
        }
    }
});

// 실시간 활동 입력 API (즉시 저장)
app.post('/api/activities/realtime', async (req, res) => {
    let client;
    try {
        const { member_id, category_name, field_name, field_value, activity_date } = req.body;

        console.log('⚡ 실시간 활동 입력:', { member_id, category_name, field_name, field_value });

        // 최소한의 검증
        if (!member_id || !category_name || !field_name || !activity_date) {
            return res.status(400).json({ 
                success: false,
                error: '필수 정보 누락'
            });
        }

        // 연결 획득
        client = await pool.connect();
        
        // 트랜잭션 시작
        await client.query('BEGIN');

        // 카테고리 ID 조회/생성
        let categoryResult = await client.query(
            'SELECT id FROM activity_categories WHERE category_name = $1',
            [category_name]
        );

        let categoryId;
        if (categoryResult.rows.length === 0) {
            const insertResult = await client.query(
                'INSERT INTO activity_categories (category_name, category_group, description) VALUES ($1, $2, $3) RETURNING id',
                [category_name, '기타', `${category_name} 활동`]
            );
            categoryId = insertResult.rows[0].id;
        } else {
            categoryId = categoryResult.rows[0].id;
        }

        // UPSERT (기존 기록이 있으면 업데이트, 없으면 삽입)
        const upsertQuery = `
            INSERT INTO activity_records (member_id, category_id, ${field_name}, activity_date)
            VALUES ($1, $2, $3, $4::date)
            ON CONFLICT (member_id, category_id, activity_date)
            DO UPDATE SET 
                ${field_name} = EXCLUDED.${field_name},
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;

        const result = await client.query(upsertQuery, [
            member_id, categoryId, field_value, activity_date
        ]);

        await client.query('COMMIT');

        // 즉시 응답
        res.json({
            success: true,
            message: '실시간 저장 완료',
            record_id: result.rows[0].id,
            timestamp: Date.now()
        });

    } catch (err) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('❌ 실시간 입력 오류:', err);
        res.status(500).json({ 
            success: false,
            error: '실시간 저장 실패'
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// 날짜 디버깅 API (디버깅용)
app.get('/api/debug/dates', async (req, res) => {
    try {
        const { member_id, category_name } = req.query;
        
        let query = `
            SELECT 
                ar.id,
                ar.activity_date,
                ar.activity_date::text as activity_date_text,
                TO_CHAR(ar.activity_date AT TIME ZONE 'UTC', 'YYYY-MM-DD') as activity_date_formatted,
                EXTRACT(YEAR FROM ar.activity_date) as year,
                EXTRACT(MONTH FROM ar.activity_date) as month,
                EXTRACT(DAY FROM ar.activity_date) as day,
                ac.category_name,
                m.name as member_name
            FROM activity_records ar
            LEFT JOIN activity_categories ac ON ar.category_id = ac.id
            LEFT JOIN member m ON ar.member_id = m.id
            WHERE 1=1
        `;
        
        let params = [];
        let paramIndex = 1;
        
        if (member_id) {
            query += ` AND ar.member_id = $${paramIndex}`;
            params.push(member_id);
            paramIndex++;
        }
        
        if (category_name) {
            query += ` AND ac.category_name = $${paramIndex}`;
            params.push(category_name);
            paramIndex++;
        }
        
        query += ` ORDER BY ar.activity_date DESC LIMIT 10`;
        
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            records: result.rows,
            debug_info: {
                query: query,
                params: params,
                count: result.rows.length
            }
        });
        
    } catch (err) {
        console.error('날짜 디버깅 API 오류:', err);
        res.status(500).json({ error: '날짜 디버깅 중 오류가 발생했습니다.' });
    }
});

// 날짜 수정 API (강제 수정용)
app.post('/api/debug/fix-dates', async (req, res) => {
    try {
        const { member_id } = req.body;
        
        console.log('날짜 수정 요청:', { member_id, type: typeof member_id });
        
        if (!member_id) {
            return res.status(400).json({ error: '회원 ID가 필요합니다.' });
        }
        
        const memberId = parseInt(member_id);
        if (isNaN(memberId)) {
            return res.status(400).json({ error: '유효하지 않은 회원 ID입니다.' });
        }
        
        // 먼저 수정할 기록들을 확인
        const checkResult = await pool.query(`
            SELECT id, activity_date, TO_CHAR(activity_date, 'YYYY-MM-DD') as current_date
            FROM activity_records 
            WHERE member_id = $1
            ORDER BY activity_date DESC
        `, [memberId]);
        
        console.log('수정 전 기록들:', checkResult.rows);
        
        if (checkResult.rows.length === 0) {
            return res.json({
                success: true,
                message: '수정할 기록이 없습니다.',
                records: []
            });
        }
        
        // 해당 회원의 모든 활동 기록의 날짜를 +1일로 수정
        const updateResult = await pool.query(`
            UPDATE activity_records 
            SET activity_date = activity_date + INTERVAL '1 day'
            WHERE member_id = $1
            RETURNING id, activity_date, TO_CHAR(activity_date, 'YYYY-MM-DD') as new_date
        `, [memberId]);
        
        console.log('수정 후 기록들:', updateResult.rows);
        
        res.json({
            success: true,
            message: `${updateResult.rows.length}개의 기록이 수정되었습니다.`,
            before_records: checkResult.rows,
            after_records: updateResult.rows
        });
        
    } catch (err) {
        console.error('날짜 수정 오류 상세:', err);
        res.status(500).json({ 
            error: '날짜 수정 중 오류가 발생했습니다.',
            details: err.message,
            stack: err.stack
        });
    }
});

// 간단한 날짜 수정 API (모든 회원)
app.post('/api/debug/fix-all-dates', async (req, res) => {
    try {
        console.log('전체 날짜 수정 요청');
        
        // 모든 활동 기록의 날짜를 +1일로 수정
        const updateResult = await pool.query(`
            UPDATE activity_records 
            SET activity_date = activity_date + INTERVAL '1 day'
            RETURNING id, member_id, activity_date, TO_CHAR(activity_date, 'YYYY-MM-DD') as new_date
        `);
        
        console.log('수정된 기록들:', updateResult.rows);
        
        res.json({
            success: true,
            message: `${updateResult.rows.length}개의 기록이 수정되었습니다.`,
            records: updateResult.rows
        });
        
    } catch (err) {
        console.error('전체 날짜 수정 오류:', err);
        res.status(500).json({ 
            error: '전체 날짜 수정 중 오류가 발생했습니다.',
            details: err.message
        });
    }
});

// 데이터베이스 테이블 확인 API (디버깅용)
app.get('/api/debug/check-tables', async (req, res) => {
    try {
        const tables = ['member', 'activity_categories', 'activity_records'];
        const results = {};
        
        for (const table of tables) {
            try {
                const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
                results[table] = {
                    exists: true,
                    count: result.rows[0].count
                };
            } catch (err) {
                results[table] = {
                    exists: false,
                    error: err.message
                };
            }
        }
        
        // activity_records 테이블 구조 확인
        try {
            const columnsResult = await pool.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'activity_records'
                ORDER BY ordinal_position
            `);
            results.activity_records_columns = columnsResult.rows;
        } catch (err) {
            results.activity_records_columns = { error: err.message };
        }
        
        res.json({
            success: true,
            tables: results
        });
        
    } catch (error) {
        console.error('데이터베이스 테이블 확인 오류:', error);
        res.status(500).json({
            success: false,
            error: '데이터베이스 테이블 확인 중 오류가 발생했습니다.',
            details: error.message
        });
    }
});

// 활동집계 API
app.get('/api/activities/summary', async (req, res) => {
    try {
        const { start_date, end_date, member_id } = req.query;
        
        if (!start_date || !end_date) {
            return res.status(400).json({ error: '시작일과 종료일은 필수입니다.' });
        }

        let query = `
            SELECT 
                ar.id,
                ar.member_id,
                ar.category_id,
                ar.target,
                ar.count,
                ar.catechism_guide,
                ar.group_join,
                ar.meeting_head,
                ar.resolution,
                ar.sacrament,
                ar.confirmation,
                ar.baptism,
                ar.first_communion,
                ar.year_count,
                ar.funeral_mass,
                ar.funeral_attendance,
                ar.conditional_baptism,
                ar.conditional_communion,
                ar.membership,
                ar.establishment,
                ar.inout_count,
                ar.note,
                ar.activity_date::text as activity_date,
                TO_CHAR(ar.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
                ac.category_name,
                m.name as member_name
            FROM activity_records ar
            LEFT JOIN activity_categories ac ON ar.category_id = ac.id
            LEFT JOIN member m ON ar.member_id = m.id
            WHERE ar.activity_date::date BETWEEN $1::date AND $2::date
        `;
        
        let params = [start_date, end_date];
        let paramIndex = 3;

        if (member_id) {
            query += ` AND ar.member_id = $${paramIndex}`;
            params.push(member_id);
        }

        query += ` ORDER BY ar.activity_date DESC, ar.id DESC`;

        const result = await pool.query(query, params);
        
        console.log(`활동집계 조회: ${start_date} ~ ${end_date}, 회원ID: ${member_id || '전체'}, 결과: ${result.rows.length}개`);
        
        // 날짜 처리 개선 - 시간대 변환 없이 원본 날짜 유지
        const processedRows = result.rows.map(row => {
            if (row.activity_date) {
                // PostgreSQL에서 반환되는 날짜를 YYYY-MM-DD 형식으로 변환
                const dateStr = String(row.activity_date);
                const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
                if (dateMatch) {
                    row.activity_date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
                }
            }
            return row;
        });
        
        res.json(processedRows);

    } catch (err) {
        console.error('활동집계 조회 오류:', err);
        res.status(500).json({ error: '활동집계 조회 중 오류가 발생했습니다.' });
    }
});

// 활동 필드 매핑 추가 API
app.post('/api/activity-field-mapping', async (req, res) => {
    try {
        const { category_name, field_name, field_display_name, field_type, is_required } = req.body;
        
        console.log('새 카테고리 활동 추가 요청:', { category_name, field_name, field_display_name, field_type, is_required });

        // 필수 필드 검증
        if (!category_name || !field_name || !field_display_name || !field_type) {
            return res.status(400).json({
                success: false,
                error: '모든 필수 필드를 입력해주세요.'
            });
        }

        // 테이블 존재 여부 확인 및 생성
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS activity_field_mapping (
                    id SERIAL PRIMARY KEY,
                    category_name VARCHAR(100) NOT NULL,
                    field_name VARCHAR(50) NOT NULL,
                    field_display_name VARCHAR(50) NOT NULL,
                    field_type VARCHAR(20) DEFAULT 'integer',
                    is_required BOOLEAN DEFAULT false,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(category_name, field_name)
                )
            `);
            console.log('activity_field_mapping 테이블 확인/생성 완료');
        } catch (tableErr) {
            console.error('테이블 생성 오류:', tableErr);
            return res.status(500).json({
                success: false,
                error: '데이터베이스 테이블 생성 중 오류가 발생했습니다.'
            });
        }

        // 중복 검사
        const existingMapping = await pool.query(
            'SELECT id FROM activity_field_mapping WHERE category_name = $1 AND field_name = $2',
            [category_name, field_name]
        );

        if (existingMapping.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: '이미 존재하는 카테고리와 필드 조합입니다.'
            });
        }

        // activity_categories 테이블에 카테고리 추가 (없으면)
        const categoryGroup = category_name.split('-')[0]; // 기도생활, 레지오활동 등
        const categoryDescription = `${category_name} 활동`;
        
        try {
            await pool.query(`
                INSERT INTO activity_categories (category_name, category_group, description)
                VALUES ($1, $2, $3)
                ON CONFLICT (category_name) DO NOTHING
            `, [category_name, categoryGroup, categoryDescription]);
            console.log('activity_categories 테이블에 카테고리 추가 완료:', category_name);
        } catch (categoryErr) {
            console.log('activity_categories 테이블에 카테고리가 이미 존재하거나 추가 실패:', categoryErr.message);
        }

        // activity_field_mapping 테이블에 데이터 추가
        const result = await pool.query(`
            INSERT INTO activity_field_mapping 
            (category_name, field_name, field_display_name, field_type, is_required)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, category_name, field_name, field_display_name, field_type, is_required, created_at
        `, [category_name, field_name, field_display_name, field_type, is_required]);

        console.log('새 카테고리 활동 추가 성공:', result.rows[0]);

        res.json({
            success: true,
            message: '새 카테고리 활동이 성공적으로 추가되었습니다.',
            mapping: result.rows[0]
        });

    } catch (err) {
        console.error('새 카테고리 활동 추가 오류:', err);
        res.status(500).json({ 
            success: false,
            error: '새 카테고리 활동 추가 중 오류가 발생했습니다.' 
        });
    }
});

// 활동 필드 매핑 조회 API
app.get('/api/activity-field-mapping', async (req, res) => {
    try {
        // 테이블 존재 여부 확인
        const tableExists = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'activity_field_mapping'
            )
        `);

        if (!tableExists.rows[0].exists) {
            return res.json({
                success: true,
                mappings: [],
                message: '테이블이 존재하지 않습니다. 새 카테고리를 추가해주세요.'
            });
        }

        const result = await pool.query(`
            SELECT * FROM activity_field_mapping 
            ORDER BY category_name, field_name
        `);
        
        console.log(`활동 필드 매핑 조회: ${result.rows.length}개`);
        
        res.json({
            success: true,
            mappings: result.rows
        });

    } catch (err) {
        console.error('활동 필드 매핑 조회 오류:', err);
        res.status(500).json({ 
            success: false,
            error: '활동 필드 매핑 조회 중 오류가 발생했습니다.' 
        });
    }
});

// 메인 페이지 서빙
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 연결 풀 초기화 함수
async function initializeConnectionPool() {
    try {
        console.log('🔄 연결 풀 초기화 중...');
        
        // 기존 연결 풀 종료
        if (pool && !pool.ended) {
            await pool.end();
            console.log('✅ 기존 연결 풀 종료 완료');
        }
        
        // 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('✅ 연결 풀 초기화 완료');
        
    } catch (err) {
        console.error('❌ 연결 풀 초기화 오류:', err);
    }
}

// 서버 시작
app.listen(PORT, async () => {
    console.log(`🚀 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
    console.log('📁 메인 페이지: http://localhost:3000/');
    console.log('📁 활동종목 편집: http://localhost:3000/activity-category-editor.html');
    console.log('📁 새 카테고리 활동 추가: http://localhost:3000/modify.html');
    
    // 연결 풀 초기화
    await initializeConnectionPool();
    
    // 데이터베이스 연결 테스트 실행
    await testDatabaseConnection();
});

// 에러 핸들링
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

// 서버 종료 시 연결 풀 정리
process.on('SIGINT', async () => {
    console.log('🔄 서버 종료 중... 연결 풀을 정리합니다.');
    try {
        await pool.end();
        console.log('✅ 데이터베이스 연결 풀이 정리되었습니다.');
        process.exit(0);
    } catch (err) {
        console.error('❌ 연결 풀 정리 중 오류:', err);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    console.log('🔄 서버 종료 중... 연결 풀을 정리합니다.');
    try {
        await pool.end();
        console.log('✅ 데이터베이스 연결 풀이 정리되었습니다.');
        process.exit(0);
    } catch (err) {
        console.error('❌ 연결 풀 정리 중 오류:', err);
        process.exit(1);
    }
});
