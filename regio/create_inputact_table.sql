-- Create or modify inputact table for Legion Maria Activity Report

-- Drop existing table if needed (backup data first if necessary)
-- DROP TABLE IF EXISTS inputact;

-- Create inputact table
CREATE TABLE IF NOT EXISTS inputact (
    id SERIAL PRIMARY KEY,
    
    -- User information
    member_name VARCHAR(100) NOT NULL,
    member_password VARCHAR(100) NOT NULL,
    submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Category 1: Evangelism
    -- Outside evangelism
    evangelism_outside_target VARCHAR(200),
    evangelism_outside_count INTEGER DEFAULT 0,
    evangelism_outside_note TEXT,
    
    -- Dropout evangelism
    evangelism_dropout_target VARCHAR(200),
    evangelism_dropout_count INTEGER DEFAULT 0,
    evangelism_dropout_note TEXT,
    
    -- Home visit evangelism
    evangelism_visit_target VARCHAR(200),
    evangelism_visit_count INTEGER DEFAULT 0,
    evangelism_visit_note TEXT,
    
    -- Candidate evangelism
    evangelism_candidate_target VARCHAR(200),
    evangelism_candidate_count INTEGER DEFAULT 0,
    evangelism_candidate_note TEXT,
    
    -- Letter evangelism
    evangelism_letter_target VARCHAR(200),
    evangelism_letter_count INTEGER DEFAULT 0,
    evangelism_letter_note TEXT,
    
    -- Cooperation evangelism
    evangelism_cooperation_target VARCHAR(200),
    evangelism_cooperation_count INTEGER DEFAULT 0,
    evangelism_cooperation_note TEXT,
    
    -- Category 2: Member Care
    -- New member care
    care_new_member_target VARCHAR(200),
    care_new_member_count INTEGER DEFAULT 0,
    care_new_member_note TEXT,
    
    -- Home visit care
    care_visit_target VARCHAR(200),
    care_visit_count INTEGER DEFAULT 0,
    care_visit_note TEXT,
    
    -- Inactive member care
    care_inactive_target VARCHAR(200),
    care_inactive_count INTEGER DEFAULT 0,
    care_inactive_note TEXT,
    
    -- Marriage preparation care
    care_marriage_target VARCHAR(200),
    care_marriage_count INTEGER DEFAULT 0,
    care_marriage_note TEXT,
    
    -- Confession preparation care
    care_confession_target VARCHAR(200),
    care_confession_count INTEGER DEFAULT 0,
    care_confession_note TEXT,
    
    -- Transfer member care
    care_transfer_target VARCHAR(200),
    care_transfer_count INTEGER DEFAULT 0,
    care_transfer_note TEXT,
    
    -- Confirmation preparation care
    care_confirmation_target VARCHAR(200),
    care_confirmation_count INTEGER DEFAULT 0,
    care_confirmation_note TEXT,
    
    -- Baptism preparation care
    care_baptism_target VARCHAR(200),
    care_baptism_count INTEGER DEFAULT 0,
    care_baptism_note TEXT,
    
    -- Soldier care
    care_soldier_target VARCHAR(200),
    care_soldier_count INTEGER DEFAULT 0,
    care_soldier_note TEXT,
    
    -- Youth care
    care_youth_target VARCHAR(200),
    care_youth_count INTEGER DEFAULT 0,
    care_youth_note TEXT,
    
    -- Category 3: Care for the Needy
    -- Business difficulty care
    care_business_target VARCHAR(200),
    care_business_count INTEGER DEFAULT 0,
    care_business_note TEXT,
    
    -- Sick care
    care_sick_target VARCHAR(200),
    care_sick_count INTEGER DEFAULT 0,
    care_sick_note TEXT,
    
    -- Outside sick care
    care_outside_sick_target VARCHAR(200),
    care_outside_sick_count INTEGER DEFAULT 0,
    care_outside_sick_note TEXT,
    
    -- Outside business care
    care_outside_business_target VARCHAR(200),
    care_outside_business_count INTEGER DEFAULT 0,
    care_outside_business_note TEXT,
    
    -- Disaster victim care
    care_disaster_target VARCHAR(200),
    care_disaster_count INTEGER DEFAULT 0,
    care_disaster_note TEXT,
    
    -- Multicultural family care
    care_multicultural_target VARCHAR(200),
    care_multicultural_count INTEGER DEFAULT 0,
    care_multicultural_note TEXT,
    
    -- Hospital service
    care_hospital_target VARCHAR(200),
    care_hospital_count INTEGER DEFAULT 0,
    care_hospital_note TEXT,
    
    -- Welfare facility visit
    care_welfare_target VARCHAR(200),
    care_welfare_count INTEGER DEFAULT 0,
    care_welfare_note TEXT,
    
    -- General care
    care_general_target VARCHAR(200),
    care_general_count INTEGER DEFAULT 0,
    care_general_note TEXT,
    
    -- Category 4: Legion Activities
    -- Youth legion guidance
    legion_youth_target VARCHAR(200),
    legion_youth_count INTEGER DEFAULT 0,
    legion_youth_note TEXT,
    
    -- Active member recruitment
    legion_recruit_target VARCHAR(200),
    legion_recruit_count INTEGER DEFAULT 0,
    legion_recruit_note TEXT,
    
    -- Assistant member recruitment
    legion_assistant_target VARCHAR(200),
    legion_assistant_count INTEGER DEFAULT 0,
    legion_assistant_note TEXT,
    
    -- Care
    legion_care_target VARCHAR(200),
    legion_care_count INTEGER DEFAULT 0,
    legion_care_note TEXT,
    
    -- Pr establishment guidance
    legion_pr_target VARCHAR(200),
    legion_pr_count INTEGER DEFAULT 0,
    legion_pr_note TEXT,
    
    -- Absent member care
    legion_absent_target VARCHAR(200),
    legion_absent_count INTEGER DEFAULT 0,
    legion_absent_note TEXT,
    
    -- Manual study
    legion_study_target VARCHAR(200),
    legion_study_count INTEGER DEFAULT 0,
    legion_study_note TEXT,
    
    -- Council cooperation
    legion_council_target VARCHAR(200),
    legion_council_count INTEGER DEFAULT 0,
    legion_council_note TEXT,
    
    -- Category 5: Prayer Life with District
    -- Prayer activity counts
    prayer_mass_count INTEGER DEFAULT 0,           -- Mass attendance
    prayer_adoration_count INTEGER DEFAULT 0,      -- Eucharistic adoration
    prayer_rosary_count INTEGER DEFAULT 0,         -- Rosary prayer
    prayer_stations_count INTEGER DEFAULT 0,       -- Stations of the Cross
    prayer_bible_read_count INTEGER DEFAULT 0,     -- Bible reading
    prayer_bible_write_count INTEGER DEFAULT 0,    -- Bible writing
    prayer_office_count INTEGER DEFAULT 0,         -- Divine Office
    
    -- District activity count
    district_activity_count INTEGER DEFAULT 0      -- District activity
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_inputact_member_name ON inputact(member_name);
CREATE INDEX IF NOT EXISTS idx_inputact_submission_date ON inputact(submission_date);
