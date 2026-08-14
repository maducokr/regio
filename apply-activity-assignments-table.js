require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: +(process.env.DB_PORT || 5432)
});

(async () => {
    const sql = fs.readFileSync(path.join(__dirname, 'create_activity_assignments_table.sql'), 'utf8');
    await pool.query(sql);
    console.log('activity_assignments 테이블 생성 완료');
    await pool.end();
})();
