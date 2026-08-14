require('dotenv').config();
const { Pool } = require('pg');

const memberName = process.argv[2] || 'T고은비17';
const likePattern = process.argv[3] || null;

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'regio',
    password: process.env.DB_PASSWORD || '5854',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

(async () => {
    const memberResult = await pool.query(
        'SELECT id, name, church_name, pr_name, curia_name FROM member WHERE name = $1',
        [memberName]
    );

    if (memberResult.rows.length === 0 && likePattern) {
        const likeResult = await pool.query(
            'SELECT id, name, church_name, pr_name, curia_name FROM member WHERE name LIKE $1 ORDER BY name LIMIT 20',
            [likePattern]
        );
        console.log(`'${likePattern}' 검색 결과:`, likeResult.rows);
    }

    if (memberResult.rows.length === 0) {
        console.log(`회원 '${memberName}' 을(를) 찾을 수 없습니다.`);
        await pool.end();
        return;
    }

    const member = memberResult.rows[0];
    console.log('회원 정보:', member);

    const stats = await pool.query(
        `SELECT COUNT(*)::int AS total,
                MIN(activity_date)::text AS first_date,
                MAX(activity_date)::text AS last_date
         FROM activity_records WHERE member_id = $1`,
        [member.id]
    );
    console.log('activity_records 통계:', stats.rows[0]);

    const sample = await pool.query(
        `SELECT ar.id, ar.activity_date::text, ac.category_name, ar.count
         FROM activity_records ar
         LEFT JOIN activity_categories ac ON ar.category_id = ac.id
         WHERE ar.member_id = $1
         ORDER BY ar.activity_date
         LIMIT 5`,
        [member.id]
    );
    console.log('샘플 5건:', sample.rows);

    await pool.end();
})().catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
});
