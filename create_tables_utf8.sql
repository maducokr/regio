-- PostgreSQL Regio Activity Database Table Creation Script

-- 1. Activity Categories Table
CREATE TABLE activity_categories (
    id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    category_group VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Activity Records Table
CREATE TABLE activity_records (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES activity_categories(id),
    target VARCHAR(200), -- Target
    count INTEGER DEFAULT 0, -- Count
    count_unit VARCHAR(10) DEFAULT '회', -- Count Unit
    catechism_guide INTEGER DEFAULT 0, -- Catechism Guide
    group_join INTEGER DEFAULT 0, -- Group Join
    meeting_head INTEGER DEFAULT 0, -- Meeting Head
    resolution INTEGER DEFAULT 0, -- Resolution
    sacrament INTEGER DEFAULT 0, -- Sacrament
    confirmation INTEGER DEFAULT 0, -- Confirmation
    baptism INTEGER DEFAULT 0, -- Baptism
    first_communion INTEGER DEFAULT 0, -- First Communion
    year_count INTEGER DEFAULT 0, -- Year Count
    funeral_mass INTEGER DEFAULT 0, -- Funeral Mass
    memorial_mass INTEGER DEFAULT 0, -- Memorial Mass
    funeral_attendance INTEGER DEFAULT 0, -- Funeral Attendance
    conditional_baptism INTEGER DEFAULT 0, -- Conditional Baptism
    conditional_communion INTEGER DEFAULT 0, -- Conditional Communion
    membership INTEGER DEFAULT 0, -- Membership
    establishment INTEGER DEFAULT 0, -- Establishment
    note TEXT, -- Note
    activity_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Insert Category Data
INSERT INTO activity_categories (category_name, category_group, description) VALUES
-- Prayer Life
('Prayer Life-Rosary', 'Prayer Life', 'Rosary prayer activity'),
('Prayer Life-Weekday Mass', 'Prayer Life', 'Weekday mass attendance'),
('Prayer Life-Stations of the Cross', 'Prayer Life', 'Stations of the Cross prayer'),
('Prayer Life-Bible Reading', 'Prayer Life', 'Bible reading activity'),
('Prayer Life-Bible Writing', 'Prayer Life', 'Bible writing activity'),
('Prayer Life-Little Office', 'Prayer Life', 'Little Office prayer'),
('Prayer Life-Eucharistic Adoration', 'Prayer Life', 'Eucharistic adoration activity'),
('Prayer Life-Other', 'Prayer Life', 'Other prayer activities'),

-- With the Earth
('With the Earth-Refuse', 'With the Earth', 'Refuse unnecessary consumption'),
('With the Earth-Reduce', 'With the Earth', 'Resource conservation activities'),
('With the Earth-Repair', 'With the Earth', 'Repair and reuse items'),
('With the Earth-Rethink', 'With the Earth', 'Rethink consumption patterns'),
('With the Earth-Reuse', 'With the Earth', 'Reuse and recycling activities'),
('With the Earth-Recycle', 'With the Earth', 'Recycling activities'),

-- Gospel Mission
('Gospel Mission-Outreach to Non-Catholics', 'Gospel Mission', 'Outreach to non-Catholics'),
('Gospel Mission-Catechism Dropout Support', 'Gospel Mission', 'Support for catechism dropouts'),
('Gospel Mission-Home and Street Evangelization', 'Gospel Mission', 'Home and street evangelization'),
('Gospel Mission-Catechumen Management', 'Gospel Mission', 'Catechumen management activities'),
('Gospel Mission-Correspondence Catechist', 'Gospel Mission', 'Correspondence catechist management'),
('Gospel Mission-Catechism Class Support', 'Gospel Mission', 'Catechism class support activities'),

-- Member Care
('Member Care-New Communicant Care', 'Member Care', 'Care for new communicants'),
('Member Care-Home Visitation', 'Member Care', 'Home visitation to members'),
('Member Care-Lapsed Member Visitation', 'Member Care', 'Visitation to lapsed members'),
('Member Care-Marriage Obstacle Care', 'Member Care', 'Care for marriage obstacles'),
('Member Care-Sacrament of Reconciliation', 'Member Care', 'Sacrament of reconciliation support'),
('Member Care-New Member Care', 'Member Care', 'Care for new members'),
('Member Care-Confirmation Support', 'Member Care', 'Confirmation support'),
('Member Care-Infant Baptism Support', 'Member Care', 'Infant baptism support'),
('Member Care-Military Care', 'Member Care', 'Military member care'),
('Member Care-Youth Care', 'Member Care', 'Youth care activities'),

-- Care for the Needy
('Care for the Needy-Member Funeral Care', 'Care for the Needy', 'Member funeral care'),
('Care for the Needy-Member Patient Care', 'Care for the Needy', 'Member patient care'),
('Care for the Needy-Non-member Patient Care', 'Care for the Needy', 'Non-member patient care'),
('Care for the Needy-Non-member Funeral Care', 'Care for the Needy', 'Non-member funeral care'),
('Care for the Needy-Disaster Victims', 'Care for the Needy', 'Care for disaster and accident victims'),
('Care for the Needy-Multicultural Families', 'Care for the Needy', 'Multicultural family care'),
('Care for the Needy-Hospital Service', 'Care for the Needy', 'Hospital service activities'),
('Care for the Needy-Welfare Facility Visits', 'Care for the Needy', 'Welfare facility visits'),
('Care for the Needy-Conditional Baptism Care', 'Care for the Needy', 'Conditional baptism care'),

-- Legion Activities
('Legion Activities-Youth Legion Guidance', 'Legion Activities', 'Youth legion guidance'),
('Legion Activities-Active Member Recruitment', 'Legion Activities', 'Active member recruitment'),
('Legion Activities-Auxiliary Member Care', 'Legion Activities', 'Auxiliary member recruitment and care'),
('Legion Activities-Pr Establishment', 'Legion Activities', 'Pr establishment support'),
('Legion Activities-Absent Member Care', 'Legion Activities', 'Absent member care'),
('Legion Activities-Handbook Study', 'Legion Activities', 'Handbook study activities'),
('Legion Activities-Council Support', 'Legion Activities', 'Council work support'),

-- Parish Cooperation
('Parish Cooperation-Parish Apostolate', 'Parish Cooperation', 'Parish apostolate activities'),
('Parish Cooperation-Event Support', 'Parish Cooperation', 'Event preparation and support'),
('Parish Cooperation-Sunday School Care', 'Parish Cooperation', 'Sunday school care'),
('Parish Cooperation-Small Community Activities', 'Parish Cooperation', 'Small community activities'),
('Parish Cooperation-Administrative Support', 'Parish Cooperation', 'Administrative support'),
('Parish Cooperation-Member Recruitment', 'Parish Cooperation', 'Member recruitment'),
('Parish Cooperation-Liturgical Support', 'Parish Cooperation', 'Liturgical support'),
('Parish Cooperation-Retreat Support', 'Parish Cooperation', 'Retreat participation support'),

-- Others
('Others-Cleaning and Beautification', 'Others', 'Cleaning and beautification activities'),
('Others-Publication Distribution', 'Others', 'Publication distribution activities'),
('Others-Ecological Activities', 'Others', 'Ecological and environmental protection activities'),
('Others-Special Activities', 'Others', 'Special activities'),
('Others-Contact Activities', 'Others', 'Contact activities'),
('Others-Vehicle Service', 'Others', 'Vehicle service and traffic control'),
('Others-Other', 'Others', 'Other activities');

-- 4. Create Indexes
CREATE INDEX idx_activity_records_category_id ON activity_records(category_id);
CREATE INDEX idx_activity_records_activity_date ON activity_records(activity_date);
CREATE INDEX idx_activity_records_created_at ON activity_records(created_at);

-- 5. Update Trigger Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 6. Create Update Trigger
CREATE TRIGGER update_activity_records_updated_at 
    BEFORE UPDATE ON activity_records 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 7. Create View (Category Statistics)
CREATE VIEW activity_summary AS
SELECT 
    ac.category_group,
    ac.category_name,
    COUNT(ar.id) as total_records,
    SUM(ar.count) as total_count,
    SUM(ar.catechism_guide) as total_catechism_guide,
    SUM(ar.group_join) as total_group_join,
    SUM(ar.meeting_head) as total_meeting_head,
    SUM(ar.resolution) as total_resolution,
    SUM(ar.sacrament) as total_sacrament,
    SUM(ar.confirmation) as total_confirmation,
    SUM(ar.baptism) as total_baptism,
    SUM(ar.first_communion) as total_first_communion,
    SUM(ar.year_count) as total_year_count,
    SUM(ar.funeral_mass) as total_funeral_mass,
    SUM(ar.memorial_mass) as total_memorial_mass,
    SUM(ar.funeral_attendance) as total_funeral_attendance,
    SUM(ar.conditional_baptism) as total_conditional_baptism,
    SUM(ar.conditional_communion) as total_conditional_communion,
    SUM(ar.membership) as total_membership,
    SUM(ar.establishment) as total_establishment
FROM activity_categories ac
LEFT JOIN activity_records ar ON ac.id = ar.category_id
GROUP BY ac.category_group, ac.category_name, ac.id
ORDER BY ac.category_group, ac.category_name;
