/**
 * Render/빈 DB용 핵심 스키마 자동 준비
 * - member 등 필수 테이블이 없으면 CREATE TABLE IF NOT EXISTS
 * - 기존 DB에는 영향 없음 (IF NOT EXISTS)
 */
async function ensureCoreSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS member (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            baptism_name VARCHAR(100),
            church_name VARCHAR(200),
            curia_name VARCHAR(200),
            curia_officer VARCHAR(50),
            pr_name VARCHAR(100),
            position VARCHAR(100),
            phone_last4 VARCHAR(4),
            resident_id_front6 VARCHAR(6),
            phone_full VARCHAR(20),
            resident_id_full VARCHAR(20),
            passno VARCHAR(64),
            email VARCHAR(255),
            email_verified BOOLEAN DEFAULT false,
            google_id VARCHAR(255),
            comitia_name VARCHAR(200),
            regia_name VARCHAR(200),
            senatus_name VARCHAR(50),
            diocese_name VARCHAR(50),
            gender VARCHAR(10),
            pr_type VARCHAR(20),
            officer_appointed_on DATE,
            pr_meeting_weekday VARCHAR(10),
            pr_meeting_hour SMALLINT,
            pr_meeting_minute SMALLINT,
            pr_meeting_place VARCHAR(100),
            pr_founded_on DATE,
            pr_approved_on DATE,
            curia_officer_elected_on DATE,
            pr_returned_on DATE,
            curia_approved_on DATE,
            curia_meeting_on DATE,
            curia_meeting_place VARCHAR(100),
            activity_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS activity_categories (
            id SERIAL PRIMARY KEY,
            category_name VARCHAR(100) NOT NULL UNIQUE,
            category_group VARCHAR(50) NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS activity_records (
            id SERIAL PRIMARY KEY,
            member_id INTEGER REFERENCES member(id),
            category_id INTEGER REFERENCES activity_categories(id),
            target VARCHAR(200),
            count INTEGER DEFAULT 0,
            catechism_guide INTEGER DEFAULT 0,
            group_join INTEGER DEFAULT 0,
            meeting_head INTEGER DEFAULT 0,
            resolution INTEGER DEFAULT 0,
            sacrament INTEGER DEFAULT 0,
            confirmation INTEGER DEFAULT 0,
            baptism INTEGER DEFAULT 0,
            first_communion INTEGER DEFAULT 0,
            year_count INTEGER DEFAULT 0,
            funeral_mass INTEGER DEFAULT 0,
            memorial_mass INTEGER DEFAULT 0,
            funeral_attendance INTEGER DEFAULT 0,
            conditional_baptism INTEGER DEFAULT 0,
            conditional_communion INTEGER DEFAULT 0,
            membership INTEGER DEFAULT 0,
            establishment INTEGER DEFAULT 0,
            inout_count INTEGER DEFAULT 0,
            note TEXT,
            activity_date DATE DEFAULT CURRENT_DATE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS activity_assignments (
            id SERIAL PRIMARY KEY,
            member_id INTEGER NOT NULL REFERENCES member(id),
            assigner_id INTEGER NOT NULL REFERENCES member(id),
            "활동배당" VARCHAR(200) NOT NULL,
            "활동대상자" TEXT,
            church_name VARCHAR(200),
            pr_name VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS play_purchases (
            id SERIAL PRIMARY KEY,
            member_id INTEGER REFERENCES member(id),
            product_id VARCHAR(100) NOT NULL,
            purchase_token TEXT NOT NULL,
            order_id VARCHAR(200),
            purchase_state VARCHAR(50) DEFAULT 'purchased',
            acknowledged BOOLEAN DEFAULT false,
            purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            verified_at TIMESTAMP,
            raw_payload JSONB,
            UNIQUE (purchase_token)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS member_column_order (
            id SERIAL PRIMARY KEY,
            column_name VARCHAR(200) NOT NULL,
            activity_description TEXT,
            display_order INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS member_meeting_attendance (
            id SERIAL PRIMARY KEY,
            member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
            kind VARCHAR(20) NOT NULL,
            meeting_key VARCHAR(20) NOT NULL,
            attended BOOLEAN NOT NULL DEFAULT false,
            observer BOOLEAN NOT NULL DEFAULT false,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (member_id, kind, meeting_key)
        )
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_member_meeting_attendance_member
        ON member_meeting_attendance (member_id)
    `);

    const check = await pool.query(`
        SELECT to_regclass('public.member') IS NOT NULL AS member_ok
    `);
    if (!check.rows[0].member_ok) {
        throw new Error('member 테이블 생성 후에도 확인할 수 없습니다.');
    }
}

module.exports = {
    ensureCoreSchema
};
