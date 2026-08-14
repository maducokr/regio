require('./lib/local-sample-guard').assertLocalSampleDb();
const { Client } = require('pg');

// Database configuration
const dbConfig = {
    host: 'localhost',
    port: 5432,
    database: 'regio',
    user: 'postgres',
    password: '5854'
};

// Korean names for generating realistic data
const koreanNames = [
    '김민수', '이영희', '박철수', '최지영', '정현우', '강수진', '윤서연', '임동현', '한미영', '송태호',
    '조은영', '신동욱', '오혜진', '유재석', '백지민', '남궁민', '고은비', '문성준', '양미경', '구자철',
    '손영수', '배수정', '조현우', '홍길동', '김철수', '이영희', '박민수', '최지영', '정현우', '강수진',
    '윤서연', '임동현', '한미영', '송태호', '조은영', '신동욱', '오혜진', '유재석', '백지민', '남궁민',
    '고은비', '문성준', '양미경', '구자철', '손영수', '배수정', '조현우', '홍길동', '김철수', '이영희',
    '박민수', '최지영', '정현우', '강수진', '윤서연', '임동현', '한미영', '송태호', '조은영', '신동욱',
    '오혜진', '유재석', '백지민', '남궁민', '고은비', '문성준', '양미경', '구자철', '손영수', '배수정',
    '조현우', '홍길동', '김철수', '이영희', '박민수', '최지영', '정현우', '강수진', '윤서연', '임동현',
    '한미영', '송태호', '조은영', '신동욱', '오혜진', '유재석', '백지민', '남궁민', '고은비', '문성준',
    '양미경', '구자철', '손영수', '배수정', '조현우', '홍길동', '김철수', '이영희', '박민수', '최지영'
];

// Korean baptismal names
const baptismalNames = [
    '마리아', '요셉', '베드로', '바오로', '요한', '루카', '마르코', '마태오', '안드레아', '야고보',
    '토마스', '필립보', '바르톨로메오', '시몬', '타대오', '마티아', '스테파노', '바르나바', '티모테오', '티토',
    '루카', '마르코', '요한', '마태오', '베드로', '바오로', '요셉', '마리아', '안나', '엘리사벳',
    '가브리엘', '미카엘', '라파엘', '우리엘', '가브리엘라', '미카엘라', '라파엘라', '우리엘라', '세라핌', '케루빔',
    '도미니코', '프란치스코', '이냐시오', '아우구스티노', '토마스', '보나벤투라', '알베르토', '안셀모', '베르나르도', '클라라',
    '테레사', '카타리나', '루치아', '아가타', '아녜스', '체칠리아', '마르가리타', '바르바라', '아폴로니아', '아나스타시아',
    '도로테아', '크리스티나', '카타리나', '마리아나', '이사벨라', '베아트릭스', '클라라', '콜레타', '마르가리타', '안나',
    '엘리사벳', '가브리엘라', '미카엘라', '라파엘라', '우리엘라', '세라핌', '케루빔', '도미니카', '프란치스카', '이냐시아',
    '아우구스티나', '토마사', '보나벤투라', '알베르타', '안셀마', '베르나르다', '클라라', '테레사', '카타리나', '루치아',
    '아가타', '아녜스', '체칠리아', '마르가리타', '바르바라', '아폴로니아', '아나스타시아', '도로테아', '크리스티나', '마리아나'
];

// Church names (10 different churches)
const churchNames = [
    '성모성심성당', '성요셉성당', '성베드로성당', '성바오로성당', '성요한성당',
    '성루카성당', '성마르코성당', '성마태오성당', '성안드레아성당', '성야고보성당'
];

// Pr names for each church (10 different Pr names)
const prNames = [
    '성모성심성당 Pr', '성요셉성당 Pr', '성베드로성당 Pr', '성바오로성당 Pr', '성요한성당 Pr',
    '성루카성당 Pr', '성마르코성당 Pr', '성마태오성당 Pr', '성안드레아성당 Pr', '성야고보성당 Pr'
];

// Generate random 4-digit phone number
function generatePhoneLast4() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// Generate random 6-digit resident ID front
function generateResidentIdFront6() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate password: phone_last4 + resident_id_front6 (10 digits total)
function generatePassword(phoneLast4, residentIdFront6) {
    return phoneLast4 + residentIdFront6;
}

// Generate random full phone number
function generateFullPhone() {
    const prefixes = ['010', '011', '016', '017', '018', '019'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const middle = Math.floor(1000 + Math.random() * 9000);
    const last = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${middle}-${last}`;
}

// Generate random full resident ID
function generateFullResidentId() {
    const front = generateResidentIdFront6();
    const back = Math.floor(1000000 + Math.random() * 9000000);
    return `${front}-${back}`;
}

async function clearAndRegenerateMembers() {
    const client = new Client(dbConfig);
    
    try {
        await client.connect();
        console.log('Connected to PostgreSQL database');
        
        // Clear existing data
        console.log('Clearing existing member data...');
        await client.query('DELETE FROM member');
        console.log('Existing data cleared');
        
        // First, let's check if we need to add additional columns to the member table
        const checkTableQuery = `
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'member' 
            AND table_schema = 'public'
        `;
        
        const columns = await client.query(checkTableQuery);
        const columnNames = columns.rows.map(row => row.column_name);
        
        // Add missing columns if they don't exist
        if (!columnNames.includes('baptismal_name')) {
            await client.query('ALTER TABLE member ADD COLUMN baptismal_name VARCHAR(100)');
            console.log('Added baptismal_name column');
        }
        
        if (!columnNames.includes('church_name')) {
            await client.query('ALTER TABLE member ADD COLUMN church_name VARCHAR(100)');
            console.log('Added church_name column');
        }
        
        if (!columnNames.includes('position')) {
            await client.query('ALTER TABLE member ADD COLUMN position VARCHAR(50)');
            console.log('Added position column');
        }
        
        if (!columnNames.includes('password')) {
            await client.query('ALTER TABLE member ADD COLUMN password VARCHAR(20)');
            console.log('Added password column');
        }
        
        if (!columnNames.includes('pr_name')) {
            await client.query('ALTER TABLE member ADD COLUMN pr_name VARCHAR(100)');
            console.log('Added pr_name column');
        }
        
        // Generate and insert 100 members
        for (let i = 0; i < 100; i++) {
            const name = koreanNames[i];
            const baptismalName = baptismalNames[i];
            const churchIndex = Math.floor(i / 10);
            const churchName = churchNames[churchIndex]; // Same church for 10 members
            const prName = prNames[churchIndex]; // Same Pr name for 10 members
            const position = i < 10 ? '서기' : '행동'; // First 10 are secretaries, rest are action members
            const phoneLast4 = generatePhoneLast4();
            const residentIdFront6 = generateResidentIdFront6();
            const phoneFull = generateFullPhone();
            const residentIdFull = generateFullResidentId();
            const password = generatePassword(phoneLast4, residentIdFront6); // 10-digit password
            
            const insertQuery = `
                INSERT INTO member (
                    name, baptismal_name, church_name, position, 
                    phone_last4, resident_id_front6, phone_full, 
                    resident_id_full, password, passno, pr_name
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `;
            
            const values = [
                name, baptismalName, churchName, position,
                phoneLast4, residentIdFront6, phoneFull,
                residentIdFull, password, password, prName // passno also uses the same password
            ];
            
            await client.query(insertQuery, values);
            console.log(`Inserted member ${i + 1}/100: ${name} (${position}) at ${churchName} - Pr: ${prName} - Password: ${password}`);
        }
        
        // Verify the insertion
        const countQuery = 'SELECT COUNT(*) as total FROM member';
        const countResult = await client.query(countQuery);
        console.log(`\nTotal members in database: ${countResult.rows[0].total}`);
        
        // Show some sample data
        const sampleQuery = 'SELECT name, baptismal_name, church_name, position, pr_name, password FROM member ORDER BY id DESC LIMIT 10';
        const sampleResult = await client.query(sampleQuery);
        console.log('\nSample of inserted members:');
        sampleResult.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.name} (${row.baptismal_name}) - ${row.position} at ${row.church_name} - Pr: ${row.pr_name} - Password: ${row.password}`);
        });
        
        // Show statistics
        const statsQuery = `
            SELECT 
                church_name,
                pr_name,
                COUNT(*) as total_members,
                COUNT(CASE WHEN position = '서기' THEN 1 END) as secretaries,
                COUNT(CASE WHEN position = '행동' THEN 1 END) as action_members
            FROM member 
            GROUP BY church_name, pr_name
            ORDER BY church_name
        `;
        
        const statsResult = await client.query(statsQuery);
        console.log('\nChurch and Pr statistics:');
        statsResult.rows.forEach(row => {
            console.log(`${row.church_name} (${row.pr_name}): ${row.total_members} total (${row.secretaries} secretaries, ${row.action_members} action members)`);
        });
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
        console.log('\nDatabase connection closed');
    }
}

// Run the script
clearAndRegenerateMembers().catch(console.error);
