const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'regio',
    password: '5854',
    port: 5432
});

async function checkColumns() {
    try {
        const result = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'member'
            ORDER BY ordinal_position
        `);
        
        console.log('Member 테이블 컬럼:');
        result.rows.forEach(row => {
            console.log(`- ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
        });
        
        // passno 컬럼이 있는지 확인
        const hasPassno = result.rows.some(row => row.column_name === 'passno');
        console.log(`\npassno 컬럼 존재: ${hasPassno ? 'YES' : 'NO'}`);
        
        if (!hasPassno) {
            console.log('\npassno 컬럼을 추가해야 합니다.');
        }
        
    } catch (error) {
        console.error('오류:', error.message);
    } finally {
        await pool.end();
    }
}

checkColumns();
