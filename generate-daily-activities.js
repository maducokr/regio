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

// Generate random number between min and max (inclusive)
function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate random target names
function generateTarget() {
    const targets = [
        '김씨', '이씨', '박씨', '최씨', '정씨', '강씨', '조씨', '윤씨', '장씨', '임씨',
        '한씨', '오씨', '서씨', '신씨', '권씨', '황씨', '안씨', '송씨', '류씨', '전씨',
        '고씨', '문씨', '양씨', '손씨', '배씨', '백씨', '허씨', '유씨', '남씨', '심씨',
        '노씨', '하씨', '곽씨', '성씨', '차씨', '주씨', '우씨', '구씨', '나씨', '민씨'
    ];
    return targets[Math.floor(Math.random() * targets.length)];
}

// Generate random note
function generateNote() {
    const notes = [
        '정상적으로 진행됨', '좋은 반응을 보임', '지속적인 관심 필요', '성공적으로 완료',
        '추가 후속 조치 필요', '만족스러운 결과', '개선 사항 발견', '예상보다 좋은 결과',
        '다음 단계 준비 중', '지원이 필요한 상황', '자발적 참여 증가', '커뮤니티 반응 긍정적'
    ];
    return notes[Math.floor(Math.random() * notes.length)];
}

// Generate date range from 2024-06-01 to 2024-07-30
function generateDateRange() {
    const startDate = new Date('2024-06-01');
    const endDate = new Date('2024-07-30');
    const dates = [];
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d).toISOString().split('T')[0]);
    }
    
    return dates;
}

async function generateDailyActivities() {
    const client = new Client(dbConfig);
    
    try {
        await client.connect();
        console.log('Connected to PostgreSQL database');
        
        // Get all members
        const membersQuery = 'SELECT id, name FROM member ORDER BY id';
        const membersResult = await client.query(membersQuery);
        const members = membersResult.rows;
        
        console.log(`Found ${members.length} members`);
        
        // Get all activity categories
        const categoriesQuery = 'SELECT id, category_name FROM activity_categories ORDER BY id';
        const categoriesResult = await client.query(categoriesQuery);
        const categories = categoriesResult.rows;
        
        console.log(`Found ${categories.length} activity categories`);
        
        // Generate date range
        const dates = generateDateRange();
        console.log(`Generating activities for ${dates.length} days (${dates[0]} to ${dates[dates.length - 1]})`);
        
        let totalActivities = 0;
        let totalRecords = 0;
        
        // Generate activities for each member for each day
        for (const member of members) {
            console.log(`\nGenerating activities for member: ${member.name} (ID: ${member.id})`);
            
            for (const date of dates) {
                // Generate 2-10 random categories for this day
                const numCategories = getRandomNumber(2, 10);
                const selectedCategories = [];
                
                // Randomly select categories
                while (selectedCategories.length < numCategories) {
                    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
                    if (!selectedCategories.find(cat => cat.id === randomCategory.id)) {
                        selectedCategories.push(randomCategory);
                    }
                }
                
                // Generate activity record for each selected category
                for (const category of selectedCategories) {
                    const count = getRandomNumber(1, 10);
                    const target = generateTarget();
                    const note = generateNote();
                    
                    // Generate random values for other fields
                    const catechism_guide = Math.random() > 0.7 ? getRandomNumber(0, 3) : 0;
                    const group_join = Math.random() > 0.8 ? getRandomNumber(0, 2) : 0;
                    const meeting_head = Math.random() > 0.9 ? getRandomNumber(0, 1) : 0;
                    const resolution = Math.random() > 0.8 ? getRandomNumber(0, 2) : 0;
                    const sacrament = Math.random() > 0.9 ? getRandomNumber(0, 1) : 0;
                    const confirmation = Math.random() > 0.9 ? getRandomNumber(0, 1) : 0;
                    const baptism = Math.random() > 0.9 ? getRandomNumber(0, 1) : 0;
                    const first_communion = Math.random() > 0.9 ? getRandomNumber(0, 1) : 0;
                    const year_count = Math.random() > 0.8 ? getRandomNumber(2020, 2024) : 0;
                    const funeral_mass = Math.random() > 0.95 ? getRandomNumber(0, 1) : 0;
                    const funeral_attendance = Math.random() > 0.9 ? getRandomNumber(0, 1) : 0;
                    const conditional_baptism = Math.random() > 0.9 ? getRandomNumber(0, 1) : 0;
                    const conditional_communion = Math.random() > 0.9 ? getRandomNumber(0, 1) : 0;
                    const membership = Math.random() > 0.8 ? getRandomNumber(0, 2) : 0;
                    const establishment = Math.random() > 0.95 ? getRandomNumber(0, 1) : 0;
                    
                    const insertQuery = `
                        INSERT INTO activity_records (
                            category_id, target, count, catechism_guide, group_join,
                            meeting_head, resolution, sacrament, confirmation, baptism,
                            first_communion, year_count, funeral_mass, funeral_attendance,
                            conditional_baptism, conditional_communion, membership,
                            establishment, note, activity_date
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                    `;
                    
                    const values = [
                        category.id, target, count, catechism_guide, group_join,
                        meeting_head, resolution, sacrament, confirmation, baptism,
                        first_communion, year_count, funeral_mass, funeral_attendance,
                        conditional_baptism, conditional_communion, membership,
                        establishment, note, date
                    ];
                    
                    await client.query(insertQuery, values);
                    totalActivities += count;
                    totalRecords++;
                }
            }
        }
        
        console.log(`\n=== Activity Generation Complete ===`);
        console.log(`Total activity records created: ${totalRecords}`);
        console.log(`Total activity count: ${totalActivities}`);
        console.log(`Date range: ${dates[0]} to ${dates[dates.length - 1]} (${dates.length} days)`);
        console.log(`Members: ${members.length}`);
        console.log(`Categories: ${categories.length}`);
        
        // Show some statistics
        const statsQuery = `
            SELECT 
                COUNT(*) as total_records,
                SUM(count) as total_activities,
                COUNT(DISTINCT activity_date) as unique_dates,
                COUNT(DISTINCT category_id) as unique_categories,
                AVG(count) as avg_activities_per_record
            FROM activity_records
        `;
        
        const statsResult = await client.query(statsQuery);
        const stats = statsResult.rows[0];
        
        console.log(`\n=== Database Statistics ===`);
        console.log(`Total records in database: ${stats.total_records}`);
        console.log(`Total activities in database: ${stats.total_activities}`);
        console.log(`Unique dates: ${stats.unique_dates}`);
        console.log(`Unique categories used: ${stats.unique_categories}`);
        console.log(`Average activities per record: ${parseFloat(stats.avg_activities_per_record).toFixed(2)}`);
        
        // Show sample of recent activities
        const sampleQuery = `
            SELECT 
                ar.activity_date,
                m.name as member_name,
                ac.category_name,
                ar.target,
                ar.count,
                ar.note
            FROM activity_records ar
            JOIN activity_categories ac ON ar.category_id = ac.id
            CROSS JOIN member m
            ORDER BY ar.activity_date DESC, ar.id DESC
            LIMIT 10
        `;
        
        const sampleResult = await client.query(sampleQuery);
        console.log(`\n=== Sample Recent Activities ===`);
        sampleResult.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.activity_date} - ${row.member_name} - ${row.category_name} - ${row.target} (${row.count}회) - ${row.note}`);
        });
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
        console.log('\nDatabase connection closed');
    }
}

// Run the script
generateDailyActivities().catch(console.error);
