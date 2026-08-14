const { Pool } = require('pg');
const XLSX = require('xlsx');
const fs = require('fs');
require('dotenv').config();

require('./lib/local-sample-guard').assertLocalSampleDb();
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

// 테스트 데이터 생성 함수들
function generateKoreanNames(count) {
    const surnames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전'];
    const givenNames = [
        '민준', '서준', '도윤', '예준', '시우', '주원', '하준', '지호', '지후', '준서',
        '준우', '현우', '도현', '우진', '민재', '건우', '서진', '현준', '연우', '정우',
        '지원', '승우', '승현', '시현', '재현', '재민', '재원', '재준', '재호', '재후',
        '지은', '서연', '하은', '하윤', '윤서', '지민', '지현', '은지', '예은', '예진',
        '예지', '예원', '예현', '예린', '예빈', '예솔', '예슬', '예아', '예영', '예우',
        '수빈', '수민', '수현', '수진', '수지', '수아', '수영', '수정', '수진', '수빈',
        '민지', '민영', '민수', '민재', '민호', '민후', '민우', '민준', '민석', '민수',
        '현지', '현영', '현수', '현재', '현호', '현후', '현우', '현준', '현석', '현수',
        '지영', '지수', '지재', '지호', '지후', '지우', '지준', '지석', '지수', '지영',
        '서영', '서수', '서재', '서호', '서후', '서우', '서준', '서석', '서수', '서영',
        '하영', '하수', '하재', '하호', '하후', '하우', '하준', '하석', '하수', '하영',
        '윤영', '윤수', '윤재', '윤호', '윤후', '윤우', '윤준', '윤석', '윤수', '윤영'
    ];
    
    const names = [];
    for (let i = 0; i < count; i++) {
        const surname = surnames[Math.floor(Math.random() * surnames.length)];
        const givenName = givenNames[Math.floor(Math.random() * givenNames.length)];
        names.push(surname + givenName);
    }
    return names;
}

function generateBaptismNames(count) {
    const baptismNames = [
        '마리아', '요셉', '베드로', '바오로', '요한', '마태오', '마르코', '루카', '안드레아', '야고보',
        '필립보', '바르톨로메오', '토마스', '마태오', '야고보', '타대오', '시몬', '유다', '마르타', '마리아',
        '엘리사벳', '안나', '루치아', '아가타', '아녜스', '체칠리아', '클라라', '도로테아', '유스티나', '마르가리타',
        '모니카', '로사', '테레사', '카타리나', '베네딕타', '스콜라스티카', '히르데가르트', '클라라', '아녜스', '루치아',
        '프란치스코', '도미니코', '이냐시오', '토마스', '보나벤투라', '알베르토', '안토니오', '빈첸초', '카밀로', '요한',
        '미카엘', '가브리엘', '라파엘', '우리엘', '바라키엘', '예후디엘', '사다키엘', '하나엘', '카마엘', '라지엘',
        '아브라함', '이사악', '야곱', '모세', '다윗', '솔로몬', '이사야', '예레미야', '에제키엘', '다니엘',
        '마태오', '마르코', '루카', '요한', '바오로', '베드로', '야고보', '유다', '요한', '바오로',
        '아우구스티노', '토마스', '보나벤투라', '알베르토', '안토니오', '빈첸초', '카밀로', '요한', '미카엘', '가브리엘',
        '라파엘', '우리엘', '바라키엘', '예후디엘', '사다키엘', '하나엘', '카마엘', '라지엘', '아브라함', '이사악',
        '야곱', '모세', '다윗', '솔로몬', '이사야', '예레미야', '에제키엘', '다니엘', '마태오', '마르코',
        '루카', '요한', '바오로', '베드로', '야고보', '유다', '요한', '바오로', '아우구스티노', '토마스'
    ];
    
    const names = [];
    for (let i = 0; i < count; i++) {
        names.push(baptismNames[Math.floor(Math.random() * baptismNames.length)]);
    }
    return names;
}

function generateChurchNames(count) {
    const churchNames = [
        '성모성심성당', '성요셉성당', '성베드로성당', '성바오로성당', '성요한성당',
        '성마태오성당', '성마르코성당', '성루카성당', '성안드레아성당', '성야고보성당',
        '성필립보성당', '성바르톨로메오성당', '성토마스성당', '성마태오성당', '성야고보성당',
        '성타대오성당', '성시몬성당', '성유다성당', '성마르타성당', '성마리아성당',
        '성엘리사벳성당', '성안나성당', '성루치아성당', '성아가타성당', '성아녜스성당',
        '성체칠리아성당', '성클라라성당', '성도로테아성당', '성유스티나성당', '성마르가리타성당',
        '성모니카성당', '성로사성당', '성테레사성당', '성카타리나성당', '성베네딕타성당',
        '성스콜라스티카성당', '성히르데가르트성당', '성클라라성당', '성아녜스성당', '성루치아성당',
        '성프란치스코성당', '성도미니코성당', '성이냐시오성당', '성토마스성당', '성보나벤투라성당',
        '성알베르토성당', '성안토니오성당', '성빈첸초성당', '성카밀로성당', '성요한성당',
        '성미카엘성당', '성가브리엘성당', '성라파엘성당', '성우리엘성당', '성바라키엘성당',
        '성예후디엘성당', '성사다키엘성당', '성하나엘성당', '성카마엘성당', '성라지엘성당',
        '성아브라함성당', '성이사악성당', '성야곱성당', '성모세성당', '성다윗성당',
        '성솔로몬성당', '성이사야성당', '성예레미야성당', '성에제키엘성당', '성다니엘성당',
        '성마태오성당', '성마르코성당', '성루카성당', '성요한성당', '성바오로성당',
        '성베드로성당', '성야고보성당', '성유다성당', '성요한성당', '성바오로성당',
        '성아우구스티노성당', '성토마스성당', '성보나벤투라성당', '성알베르토성당', '성안토니오성당',
        '성빈첸초성당', '성카밀로성당', '성요한성당', '성미카엘성당', '성가브리엘성당',
        '성라파엘성당', '성우리엘성당', '성바라키엘성당', '성예후디엘성당', '성사다키엘성당',
        '성하나엘성당', '성카마엘성당', '성라지엘성당', '성아브라함성당', '성이사악성당',
        '성야곱성당', '성모세성당', '성다윗성당', '성솔로몬성당', '성이사야성당',
        '성예레미야성당', '성에제키엘성당', '성다니엘성당', '성마태오성당', '성마르코성당',
        '성루카성당', '성요한성당', '성바오로성당', '성베드로성당', '성야고보성당',
        '성유다성당', '성요한성당', '성바오로성당', '성아우구스티노성당', '성토마스성당',
        '성보나벤투라성당', '성알베르토성당', '성안토니오성당', '성빈첸초성당', '성카밀로성당'
    ];
    
    const names = [];
    for (let i = 0; i < count; i++) {
        // 10명당 동일한 성당명칭 사용
        const index = Math.floor(i / 10);
        names.push(churchNames[index % churchNames.length]);
    }
    return names;
}

function generatePrNames(count) {
    const prNames = [
        '김신부', '이신부', '박신부', '최신부', '정신부',
        '강신부', '조신부', '윤신부', '장신부', '임신부'
    ];
    
    const names = [];
    for (let i = 0; i < count; i++) {
        // 10명당 동일한 PR 이름 사용
        const index = Math.floor(i / 10);
        names.push(prNames[index % prNames.length]);
    }
    return names;
}

function generatePasswords(count) {
    const passwords = [];
    for (let i = 0; i < count; i++) {
        // 8자리 랜덤 비밀번호 생성
        const password = Math.floor(10000000 + Math.random() * 90000000).toString();
        passwords.push(password);
    }
    return passwords;
}

function generateActivityCounts(count) {
    const counts = [];
    for (let i = 0; i < count; i++) {
        // 1~10 사이의 랜덤 숫자
        const count = Math.floor(Math.random() * 10) + 1;
        counts.push(count);
    }
    return counts;
}

// 데이터베이스 테이블 구조 업데이트
async function updateTableStructure() {
    const client = await pool.connect();
    try {
        // 기존 테이블 구조 확인
        const tableExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'member'
            );
        `);
        
        if (tableExists.rows[0].exists) {
            // 기존 테이블에 새로운 컬럼들 추가
            const columns = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'member' 
                AND table_schema = 'public'
            `);
            
            const existingColumns = columns.rows.map(col => col.column_name);
            console.log('기존 컬럼들:', existingColumns);
            
            // 필요한 컬럼들 추가
            const requiredColumns = [
                { name: 'baptism_name', type: 'VARCHAR(100)' },
                { name: 'church_name', type: 'VARCHAR(100)' },
                { name: 'pr_name', type: 'VARCHAR(100)' },
                { name: 'position', type: 'VARCHAR(100)' },
                { name: 'phone_last4', type: 'VARCHAR(4)' },
                { name: 'resident_id_front6', type: 'VARCHAR(6)' },
                { name: 'phone_full', type: 'VARCHAR(20)' },
                { name: 'resident_id_full', type: 'VARCHAR(20)' },
                { name: 'password', type: 'VARCHAR(255)' },
                { name: 'activity_count', type: 'INTEGER DEFAULT 0' },
                { name: 'created_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
                { name: 'updated_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
            ];
            
            for (const column of requiredColumns) {
                if (!existingColumns.includes(column.name)) {
                    console.log(`컬럼 추가: ${column.name}`);
                    await client.query(`ALTER TABLE member ADD COLUMN ${column.name} ${column.type}`);
                }
            }
            
            // passno 컬럼을 BIGINT로 변경
            try {
                await client.query('ALTER TABLE member ALTER COLUMN passno TYPE BIGINT');
                console.log('passno 컬럼을 BIGINT로 변경 완료');
            } catch (error) {
                console.log('passno 컬럼 변경 실패 (이미 BIGINT일 수 있음):', error.message);
            }
        } else {
            // 새 테이블 생성
            await client.query(`
                CREATE TABLE member (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL UNIQUE,
                    baptism_name VARCHAR(100),
                    church_name VARCHAR(100),
                    pr_name VARCHAR(100),
                    position VARCHAR(100),
                    phone_last4 VARCHAR(4),
                    resident_id_front6 VARCHAR(6),
                    phone_full VARCHAR(20),
                    resident_id_full VARCHAR(20),
                    password VARCHAR(255),
                    passno BIGINT,
                    activity_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        }
        
        console.log('테이블 구조 업데이트 완료');
    } catch (error) {
        console.error('테이블 구조 업데이트 오류:', error);
        throw error;
    } finally {
        client.release();
    }
}

// 테스트 데이터 생성 및 삽입
async function generateAndInsertTestData() {
    const client = await pool.connect();
    try {
        // 기존 데이터 삭제
        await client.query('DELETE FROM member');
        console.log('기존 데이터 삭제 완료');
        
        // 테스트 데이터 생성
        const names = generateKoreanNames(100);
        const baptismNames = generateBaptismNames(100);
        const churchNames = generateChurchNames(100);
        const prNames = generatePrNames(100);
        const passwords = generatePasswords(100);
        const activityCounts = generateActivityCounts(100);
        
        // 데이터 삽입
        for (let i = 0; i < 100; i++) {
            const phoneLast4 = Math.floor(1000 + Math.random() * 9000).toString();
            const residentIdFront6 = Math.floor(100000 + Math.random() * 900000).toString();
            // passno를 문자열로 결합하여 BIGINT로 변환
            const passno = BigInt(phoneLast4 + residentIdFront6);
            
            // 서기 직책은 처음 10명에게만 부여
            const position = i < 10 ? '서기' : '일반';
            
            await client.query(`
                INSERT INTO member (
                    name, baptism_name, church_name, pr_name, position, 
                    phone_last4, resident_id_front6, password, passno, activity_count
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                names[i], baptismNames[i], churchNames[i], prNames[i], position,
                phoneLast4, residentIdFront6, passwords[i], passno.toString(), activityCounts[i]
            ]);
        }
        
        console.log('테스트 데이터 삽입 완료');
        
        // 생성된 데이터 반환
        return {
            names,
            baptismNames,
            churchNames,
            prNames,
            passwords,
            activityCounts
        };
        
    } catch (error) {
        console.error('테스트 데이터 생성 오류:', error);
        throw error;
    } finally {
        client.release();
    }
}

// 엑셀 파일 생성
function createExcelFile(data) {
    const workbook = XLSX.utils.book_new();
    
    // 회원 정보 시트
    const memberData = [];
    for (let i = 0; i < 100; i++) {
        memberData.push({
            '번호': i + 1,
            '성명': data.names[i],
            '세례명': data.baptismNames[i],
            '성당명칭': data.churchNames[i],
            'PR이름': data.prNames[i],
            '직책': i < 10 ? '서기' : '일반',
            '비밀번호': data.passwords[i],
            '활동회수': data.activityCounts[i]
        });
    }
    
    const memberSheet = XLSX.utils.json_to_sheet(memberData);
    XLSX.utils.book_append_sheet(workbook, memberSheet, '회원정보');
    
    // 통계 시트
    const statsData = [
        { '구분': '총 회원 수', '수량': 100 },
        { '구분': '서기 수', '수량': 10 },
        { '구분': '일반 회원 수', '수량': 90 },
        { '구분': '성당 수', '수량': 10 },
        { '구분': 'PR 수', '수량': 10 },
        { '구분': '평균 활동 회수', '수량': Math.round(data.activityCounts.reduce((a, b) => a + b, 0) / 100) }
    ];
    
    const statsSheet = XLSX.utils.json_to_sheet(statsData);
    XLSX.utils.book_append_sheet(workbook, statsSheet, '통계');
    
    // 파일 저장
    const fileName = `regio_test_data_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    
    console.log(`엑셀 파일 생성 완료: ${fileName}`);
    return fileName;
}

// 메인 실행 함수
async function main() {
    try {
        console.log('테스트 데이터 생성 시작...');
        
        // 테이블 구조 업데이트
        await updateTableStructure();
        
        // 테스트 데이터 생성 및 삽입
        const data = await generateAndInsertTestData();
        
        // 엑셀 파일 생성
        const fileName = createExcelFile(data);
        
        console.log('모든 작업이 완료되었습니다!');
        console.log(`생성된 엑셀 파일: ${fileName}`);
        
    } catch (error) {
        console.error('오류 발생:', error);
    } finally {
        await pool.end();
    }
}

// 스크립트 실행
if (require.main === module) {
    main();
}

module.exports = { main };
