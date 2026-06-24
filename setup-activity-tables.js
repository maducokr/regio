const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL 연결 설정
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '5854',
    database: process.env.DB_NAME || 'regio',
    port: parseInt(process.env.DB_PORT) || 5432,
    ssl: false,
};

// 데이터베이스 연결 풀 생성
const pool = new Pool(dbConfig);

async function setupActivityTables() {
    let client;
    try {
        console.log('활동 기록 테이블 생성 시작...');
        
        client = await pool.connect();
        console.log('데이터베이스 연결 성공!');
        
        // 1. 세목별 활동 기록 테이블 생성
        console.log('세목별 활동 테이블 생성 중...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS daily_activities (
                id SERIAL PRIMARY KEY,
                member_id INTEGER NOT NULL,
                activity_date DATE NOT NULL,
                evangelism_count INTEGER DEFAULT 0,
                care_count INTEGER DEFAULT 0,
                needy_count INTEGER DEFAULT 0,
                legion_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (member_id) REFERENCES member(id) ON DELETE CASCADE,
                UNIQUE(member_id, activity_date)
            )
        `);
        console.log('✓ 세목별 활동 테이블 생성 완료');

        // 2. 기도생활 기록 테이블 생성
        console.log('기도생활 테이블 생성 중...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS prayer_activities (
                id SERIAL PRIMARY KEY,
                member_id INTEGER NOT NULL,
                week_start_date DATE NOT NULL,
                daily_prayer_count INTEGER DEFAULT 0,
                rosary_count INTEGER DEFAULT 0,
                mass_attendance_count INTEGER DEFAULT 0,
                confession_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (member_id) REFERENCES member(id) ON DELETE CASCADE,
                UNIQUE(member_id, week_start_date)
            )
        `);
        console.log('✓ 기도생활 테이블 생성 완료');

        // 3. 지구와 함께 활동 기록 테이블 생성
        console.log('지구와 함께 활동 테이블 생성 중...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS community_activities (
                id SERIAL PRIMARY KEY,
                member_id INTEGER NOT NULL,
                week_start_date DATE NOT NULL,
                community_service_count INTEGER DEFAULT 0,
                environmental_activity_count INTEGER DEFAULT 0,
                social_justice_count INTEGER DEFAULT 0,
                charity_work_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (member_id) REFERENCES member(id) ON DELETE CASCADE,
                UNIQUE(member_id, week_start_date)
            )
        `);
        console.log('✓ 지구와 함께 활동 테이블 생성 완료');

        // 4. 인덱스 생성
        console.log('인덱스 생성 중...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_daily_activities_member_date 
            ON daily_activities(member_id, activity_date)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_prayer_activities_member_week 
            ON prayer_activities(member_id, week_start_date)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_community_activities_member_week 
            ON community_activities(member_id, week_start_date)
        `);
        console.log('✓ 인덱스 생성 완료');

        // 5. updated_at 자동 업데이트를 위한 트리거 함수 확인
        console.log('트리거 함수 확인 중...');
        const triggerFunctionExists = await client.query(`
            SELECT EXISTS (
                SELECT 1 FROM pg_proc 
                WHERE proname = 'update_updated_at_column'
            )
        `);

        if (!triggerFunctionExists.rows[0].exists) {
            console.log('트리거 함수 생성 중...');
            await client.query(`
                CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = CURRENT_TIMESTAMP;
                    RETURN NEW;
                END;
                $$ language 'plpgsql'
            `);
            console.log('✓ 트리거 함수 생성 완료');
        } else {
            console.log('✓ 트리거 함수 이미 존재');
        }

        // 6. 트리거 생성
        console.log('트리거 생성 중...');
        await client.query(`
            DROP TRIGGER IF EXISTS update_daily_activities_updated_at ON daily_activities;
            CREATE TRIGGER update_daily_activities_updated_at 
            BEFORE UPDATE ON daily_activities
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        `);
        
        await client.query(`
            DROP TRIGGER IF EXISTS update_prayer_activities_updated_at ON prayer_activities;
            CREATE TRIGGER update_prayer_activities_updated_at 
            BEFORE UPDATE ON prayer_activities
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        `);
        
        await client.query(`
            DROP TRIGGER IF EXISTS update_community_activities_updated_at ON community_activities;
            CREATE TRIGGER update_community_activities_updated_at 
            BEFORE UPDATE ON community_activities
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        `);
        console.log('✓ 트리거 생성 완료');

        // 7. 주의 시작일을 계산하는 함수 생성
        console.log('주의 시작일 계산 함수 생성 중...');
        await client.query(`
            CREATE OR REPLACE FUNCTION get_week_start_date(input_date DATE)
            RETURNS DATE AS $$
            BEGIN
                RETURN input_date - EXTRACT(DOW FROM input_date)::INTEGER;
            END;
            $$ LANGUAGE plpgsql
        `);
        console.log('✓ 주의 시작일 계산 함수 생성 완료');

        console.log('\n🎉 모든 활동 기록 테이블이 성공적으로 생성되었습니다!');
        console.log('\n생성된 테이블:');
        console.log('- daily_activities (세목별 활동 기록)');
        console.log('- prayer_activities (기도생활 기록)');
        console.log('- community_activities (지구와 함께 활동 기록)');
        
        // 테이블 구조 확인
        console.log('\n📋 테이블 구조 확인:');
        
        const tables = ['daily_activities', 'prayer_activities', 'community_activities'];
        for (const table of tables) {
            const columns = await client.query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = $1 
                ORDER BY ordinal_position
            `, [table]);
            
            console.log(`\n${table}:`);
            columns.rows.forEach(col => {
                console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
            });
        }

    } catch (error) {
        console.error('❌ 테이블 생성 중 오류 발생:', error);
        throw error;
    } finally {
        if (client) {
            client.release();
        }
        await pool.end();
    }
}

// 스크립트 실행
if (require.main === module) {
    setupActivityTables()
        .then(() => {
            console.log('\n✅ 설정 완료!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ 설정 실패:', error);
            process.exit(1);
        });
}

module.exports = { setupActivityTables };
