-- 활동배당지시 저장 테이블
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
);

CREATE INDEX IF NOT EXISTS idx_activity_assignments_member_id ON activity_assignments(member_id);
CREATE INDEX IF NOT EXISTS idx_activity_assignments_assigner_id ON activity_assignments(assigner_id);
