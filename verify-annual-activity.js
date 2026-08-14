require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432', 10)
});

(async () => {
    const year = 2025;
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const members = await pool.query('SELECT COUNT(*)::int c FROM member WHERE id BETWEEN 3 AND 138');
    const acts = await pool.query(
        `SELECT COUNT(*)::int c FROM activity_records ar
         JOIN member m ON m.id = ar.member_id
         WHERE m.id BETWEEN 3 AND 138 AND ar.activity_date BETWEEN $1::date AND $2::date`,
        [start, end]
    );
    const assigns = await pool.query(
        `SELECT COUNT(*)::int c FROM activity_assignments aa
         JOIN member m ON m.id = aa.member_id
         WHERE m.id BETWEEN 3 AND 138 AND aa.created_at::date BETWEEN $1::date AND $2::date`,
        [start, end]
    );
    console.log({ members: members.rows[0].c, activities: acts.rows[0].c, assignments: assigns.rows[0].c });
    await pool.end();
})();
