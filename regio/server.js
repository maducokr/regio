const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3003;

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// PostgreSQL 연결 설정
const dbConfig = {
    host: 'localhost',
    user: 'postgres',
    password: '5854',
    database: 'regio',
    port: 5432
};

// PostgreSQL 연결 풀 생성
const pool = new Pool(dbConfig);

// 데이터베이스 테이블 생성 함수
async function createTables() {
    try {
        const client = await pool.connect();
        
        // 레지오 활동 보고서 테이블 생성
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS legion_activity_reports (
                id SERIAL PRIMARY KEY,
                member_name VARCHAR(100) NOT NULL,
                member_password VARCHAR(100) NOT NULL,
                submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                -- 종목 1: 복음선교
                evangelism_outsider_target VARCHAR(200),
                evangelism_outsider_count INTEGER DEFAULT 0,
                evangelism_outsider_remarks INTEGER DEFAULT 0,
                
                evangelism_dropout_target VARCHAR(200),
                evangelism_dropout_count INTEGER DEFAULT 0,
                evangelism_dropout_remarks INTEGER DEFAULT 0,
                
                evangelism_visit_target VARCHAR(200),
                evangelism_visit_count INTEGER DEFAULT 0,
                evangelism_visit_remarks INTEGER DEFAULT 0,
                
                evangelism_catechumen_target VARCHAR(200),
                evangelism_catechumen_count INTEGER DEFAULT 0,
                evangelism_catechumen_remarks INTEGER DEFAULT 0,
                
                evangelism_correspondence_target VARCHAR(200),
                evangelism_correspondence_count INTEGER DEFAULT 0,
                evangelism_correspondence_remarks INTEGER DEFAULT 0,
                
                evangelism_cooperation_target VARCHAR(200),
                evangelism_cooperation_count INTEGER DEFAULT 0,
                evangelism_cooperation_remarks INTEGER DEFAULT 0,
                
                -- 종목 2: 교우돌봄
                care_newconvert_target VARCHAR(200),
                care_newconvert_count INTEGER DEFAULT 0,
                care_newconvert_remarks INTEGER DEFAULT 0,
                
                care_homevisit_target VARCHAR(200),
                care_homevisit_count INTEGER DEFAULT 0,
                care_homevisit_remarks INTEGER DEFAULT 0,
                
                care_inactive_target VARCHAR(200),
                care_inactive_count INTEGER DEFAULT 0,
                care_inactive_remarks INTEGER DEFAULT 0,
                
                care_marriage_target VARCHAR(200),
                care_marriage_count INTEGER DEFAULT 0,
                care_marriage_remarks INTEGER DEFAULT 0,
                
                care_confession_target VARCHAR(200),
                care_confession_count INTEGER DEFAULT 0,
                care_confession_remarks INTEGER DEFAULT 0,
                
                care_transfer_target VARCHAR(200),
                care_transfer_count INTEGER DEFAULT 0,
                care_transfer_remarks INTEGER DEFAULT 0,
                
                care_confirmation_target VARCHAR(200),
                care_confirmation_count INTEGER DEFAULT 0,
                care_confirmation_remarks INTEGER DEFAULT 0,
                
                care_infantbaptism_target VARCHAR(200),
                care_infantbaptism_count INTEGER DEFAULT 0,
                care_infantbaptism_remarks INTEGER DEFAULT 0,
                
                care_soldier_target VARCHAR(200),
                care_soldier_count INTEGER DEFAULT 0,
                care_soldier_remarks INTEGER DEFAULT 0,
                
                care_youth_target VARCHAR(200),
                care_youth_count INTEGER DEFAULT 0,
                care_youth_remarks INTEGER DEFAULT 0,
                
                -- 종목 3: 어려운자돌봄
                needy_business_target VARCHAR(200),
                needy_business_count INTEGER DEFAULT 0,
                needy_business_remarks INTEGER DEFAULT 0,
                
                needy_sick_target VARCHAR(200),
                needy_sick_count INTEGER DEFAULT 0,
                needy_sick_remarks INTEGER DEFAULT 0,
                
                needy_outsider_sick_target VARCHAR(200),
                needy_outsider_sick_count INTEGER DEFAULT 0,
                needy_outsider_sick_remarks INTEGER DEFAULT 0,
                
                needy_outsider_business_target VARCHAR(200),
                needy_outsider_business_count INTEGER DEFAULT 0,
                needy_outsider_business_remarks INTEGER DEFAULT 0,
                
                needy_disaster_target VARCHAR(200),
                needy_disaster_count INTEGER DEFAULT 0,
                needy_disaster_remarks INTEGER DEFAULT 0,
                
                needy_multicultural_target VARCHAR(200),
                needy_multicultural_count INTEGER DEFAULT 0,
                needy_multicultural_remarks INTEGER DEFAULT 0,
                
                needy_hospital_target VARCHAR(200),
                needy_hospital_count INTEGER DEFAULT 0,
                needy_hospital_remarks INTEGER DEFAULT 0,
                
                needy_welfare_target VARCHAR(200),
                needy_welfare_count INTEGER DEFAULT 0,
                needy_welfare_remarks INTEGER DEFAULT 0,
                
                needy_emergency_target VARCHAR(200),
                needy_emergency_count INTEGER DEFAULT 0,
                needy_emergency_remarks INTEGER DEFAULT 0,
                
                -- 종목 4: 레지오활동
                legion_junior_target VARCHAR(200),
                legion_junior_count INTEGER DEFAULT 0,
                legion_junior_remarks INTEGER DEFAULT 0,
                
                legion_active_target VARCHAR(200),
                legion_active_count INTEGER DEFAULT 0,
                legion_active_remarks INTEGER DEFAULT 0,
                
                legion_auxiliary_target VARCHAR(200),
                legion_auxiliary_count INTEGER DEFAULT 0,
                legion_auxiliary_remarks INTEGER DEFAULT 0,
                
                legion_praesidium_target VARCHAR(200),
                legion_praesidium_count INTEGER DEFAULT 0,
                legion_praesidium_remarks INTEGER DEFAULT 0,
                
                legion_absent_target VARCHAR(200),
                legion_absent_count INTEGER DEFAULT 0,
                legion_absent_remarks INTEGER DEFAULT 0,
                
                legion_handbook_target VARCHAR(200),
                legion_handbook_count INTEGER DEFAULT 0,
                legion_handbook_remarks INTEGER DEFAULT 0,
                
                legion_council_target VARCHAR(200),
                legion_council_count INTEGER DEFAULT 0,
                legion_council_remarks INTEGER DEFAULT 0,
                
                -- 종목 5: 기도생활지구와함께
                prayer_together_mass_count INTEGER DEFAULT 0,
                refuse_count INTEGER DEFAULT 0,
                prayer_together_adoration_count INTEGER DEFAULT 0,
                save_count INTEGER DEFAULT 0,
                prayer_together_confession_count INTEGER DEFAULT 0,
                repair_count INTEGER DEFAULT 0,
                prayer_together_rosary_count INTEGER DEFAULT 0,
                rethink_count INTEGER DEFAULT 0,
                bibleread_count INTEGER DEFAULT 0,
                rewrite_count INTEGER DEFAULT 0,
                biblewrite_count INTEGER DEFAULT 0,
                replay_count INTEGER DEFAULT 0,
                divine_mercy_count INTEGER DEFAULT 0,
                reuse_count INTEGER DEFAULT 0
            );
        `;
        
        await client.query(createTableSQL);
        client.release();
        console.log('데이터베이스 테이블이 성공적으로 생성되었습니다.');
    } catch (error) {
        console.error('테이블 생성 오류:', error);
    }
}

// 레지오 활동 보고서 저장 API
app.post('/api/save-legion-report', async (req, res) => {
    try {
        const {
            member_name,
            member_password,
            // 종목 1: 복음선교
            evangelism_outsider_target, evangelism_outsider_count, evangelism_outsider_remarks,
            evangelism_dropout_target, evangelism_dropout_count, evangelism_dropout_remarks,
            evangelism_visit_target, evangelism_visit_count, evangelism_visit_remarks,
            evangelism_catechumen_target, evangelism_catechumen_count, evangelism_catechumen_remarks,
            evangelism_correspondence_target, evangelism_correspondence_count, evangelism_correspondence_remarks,
            evangelism_cooperation_target, evangelism_cooperation_count, evangelism_cooperation_remarks,
            
            // 종목 2: 교우돌봄
            care_newconvert_target, care_newconvert_count, care_newconvert_remarks,
            care_homevisit_target, care_homevisit_count, care_homevisit_remarks,
            care_inactive_target, care_inactive_count, care_inactive_remarks,
            care_marriage_target, care_marriage_count, care_marriage_remarks,
            care_confession_target, care_confession_count, care_confession_remarks,
            care_transfer_target, care_transfer_count, care_transfer_remarks,
            care_confirmation_target, care_confirmation_count, care_confirmation_remarks,
            care_infantbaptism_target, care_infantbaptism_count, care_infantbaptism_remarks,
            care_soldier_target, care_soldier_count, care_soldier_remarks,
            care_youth_target, care_youth_count, care_youth_remarks,
            
            // 종목 3: 어려운자돌봄
            needy_business_target, needy_business_count, needy_business_remarks,
            needy_sick_target, needy_sick_count, needy_sick_remarks,
            needy_outsider_sick_target, needy_outsider_sick_count, needy_outsider_sick_remarks,
            needy_outsider_business_target, needy_outsider_business_count, needy_outsider_business_remarks,
            needy_disaster_target, needy_disaster_count, needy_disaster_remarks,
            needy_multicultural_target, needy_multicultural_count, needy_multicultural_remarks,
            needy_hospital_target, needy_hospital_count, needy_hospital_remarks,
            needy_welfare_target, needy_welfare_count, needy_welfare_remarks,
            needy_emergency_target, needy_emergency_count, needy_emergency_remarks,
            
            // 종목 4: 레지오활동
            legion_junior_target, legion_junior_count, legion_junior_remarks,
            legion_active_target, legion_active_count, legion_active_remarks,
            legion_auxiliary_target, legion_auxiliary_count, legion_auxiliary_remarks,
            legion_praesidium_target, legion_praesidium_count, legion_praesidium_remarks,
            legion_absent_target, legion_absent_count, legion_absent_remarks,
            legion_handbook_target, legion_handbook_count, legion_handbook_remarks,
            legion_council_target, legion_council_count, legion_council_remarks,
            
            // 종목 5: 기도생활지구와함께
            prayer_together_mass_count, refuse_count,
            prayer_together_adoration_count, save_count,
            prayer_together_confession_count, repair_count,
            prayer_together_rosary_count, rethink_count,
            bibleread_count, rewrite_count,
            biblewrite_count, replay_count,
            divine_mercy_count, reuse_count
        } = req.body;

        const client = await pool.connect();
        
        const insertSQL = `
            INSERT INTO legion_activity_reports (
                member_name, member_password,
                
                -- 종목 1: 복음선교
                evangelism_outsider_target, evangelism_outsider_count, evangelism_outsider_remarks,
                evangelism_dropout_target, evangelism_dropout_count, evangelism_dropout_remarks,
                evangelism_visit_target, evangelism_visit_count, evangelism_visit_remarks,
                evangelism_catechumen_target, evangelism_catechumen_count, evangelism_catechumen_remarks,
                evangelism_correspondence_target, evangelism_correspondence_count, evangelism_correspondence_remarks,
                evangelism_cooperation_target, evangelism_cooperation_count, evangelism_cooperation_remarks,
                
                -- 종목 2: 교우돌봄
                care_newconvert_target, care_newconvert_count, care_newconvert_remarks,
                care_homevisit_target, care_homevisit_count, care_homevisit_remarks,
                care_inactive_target, care_inactive_count, care_inactive_remarks,
                care_marriage_target, care_marriage_count, care_marriage_remarks,
                care_confession_target, care_confession_count, care_confession_remarks,
                care_transfer_target, care_transfer_count, care_transfer_remarks,
                care_confirmation_target, care_confirmation_count, care_confirmation_remarks,
                care_infantbaptism_target, care_infantbaptism_count, care_infantbaptism_remarks,
                care_soldier_target, care_soldier_count, care_soldier_remarks,
                care_youth_target, care_youth_count, care_youth_remarks,
                
                -- 종목 3: 어려운자돌봄
                needy_business_target, needy_business_count, needy_business_remarks,
                needy_sick_target, needy_sick_count, needy_sick_remarks,
                needy_outsider_sick_target, needy_outsider_sick_count, needy_outsider_sick_remarks,
                needy_outsider_business_target, needy_outsider_business_count, needy_outsider_business_remarks,
                needy_disaster_target, needy_disaster_count, needy_disaster_remarks,
                needy_multicultural_target, needy_multicultural_count, needy_multicultural_remarks,
                needy_hospital_target, needy_hospital_count, needy_hospital_remarks,
                needy_welfare_target, needy_welfare_count, needy_welfare_remarks,
                needy_emergency_target, needy_emergency_count, needy_emergency_remarks,
                
                -- 종목 4: 레지오활동
                legion_junior_target, legion_junior_count, legion_junior_remarks,
                legion_active_target, legion_active_count, legion_active_remarks,
                legion_auxiliary_target, legion_auxiliary_count, legion_auxiliary_remarks,
                legion_praesidium_target, legion_praesidium_count, legion_praesidium_remarks,
                legion_absent_target, legion_absent_count, legion_absent_remarks,
                legion_handbook_target, legion_handbook_count, legion_handbook_remarks,
                legion_council_target, legion_council_count, legion_council_remarks,
                
                -- 종목 5: 기도생활지구와함께
                prayer_together_mass_count, refuse_count,
                prayer_together_adoration_count, save_count,
                prayer_together_confession_count, repair_count,
                prayer_together_rosary_count, rethink_count,
                bibleread_count, rewrite_count,
                biblewrite_count, replay_count,
                divine_mercy_count, reuse_count
            ) VALUES ($1, $2, 
                $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
                $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54,
                $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72,
                $73, $74, $75, $76, $77, $78, $79, $80, $81, $82, $83, $84, $85, $86, $87, $88, $89, $90
            )
        `;

        const values = [
            member_name || '익명',
            member_password || '5854',
            
            // 종목 1: 복음선교
            evangelism_outsider_target || '', parseInt(evangelism_outsider_count) || 0, parseInt(evangelism_outsider_remarks) || 0,
            evangelism_dropout_target || '', parseInt(evangelism_dropout_count) || 0, parseInt(evangelism_dropout_remarks) || 0,
            evangelism_visit_target || '', parseInt(evangelism_visit_count) || 0, parseInt(evangelism_visit_remarks) || 0,
            evangelism_catechumen_target || '', parseInt(evangelism_catechumen_count) || 0, parseInt(evangelism_catechumen_remarks) || 0,
            evangelism_correspondence_target || '', parseInt(evangelism_correspondence_count) || 0, parseInt(evangelism_correspondence_remarks) || 0,
            evangelism_cooperation_target || '', parseInt(evangelism_cooperation_count) || 0, parseInt(evangelism_cooperation_remarks) || 0,
            
            // 종목 2: 교우돌봄
            care_newconvert_target || '', parseInt(care_newconvert_count) || 0, parseInt(care_newconvert_remarks) || 0,
            care_homevisit_target || '', parseInt(care_homevisit_count) || 0, parseInt(care_homevisit_remarks) || 0,
            care_inactive_target || '', parseInt(care_inactive_count) || 0, parseInt(care_inactive_remarks) || 0,
            care_marriage_target || '', parseInt(care_marriage_count) || 0, parseInt(care_marriage_remarks) || 0,
            care_confession_target || '', parseInt(care_confession_count) || 0, parseInt(care_confession_remarks) || 0,
            care_transfer_target || '', parseInt(care_transfer_count) || 0, parseInt(care_transfer_remarks) || 0,
            care_confirmation_target || '', parseInt(care_confirmation_count) || 0, parseInt(care_confirmation_remarks) || 0,
            care_infantbaptism_target || '', parseInt(care_infantbaptism_count) || 0, parseInt(care_infantbaptism_remarks) || 0,
            care_soldier_target || '', parseInt(care_soldier_count) || 0, parseInt(care_soldier_remarks) || 0,
            care_youth_target || '', parseInt(care_youth_count) || 0, parseInt(care_youth_remarks) || 0,
            
            // 종목 3: 어려운자돌봄
            needy_business_target || '', parseInt(needy_business_count) || 0, parseInt(needy_business_remarks) || 0,
            needy_sick_target || '', parseInt(needy_sick_count) || 0, parseInt(needy_sick_remarks) || 0,
            needy_outsider_sick_target || '', parseInt(needy_outsider_sick_count) || 0, parseInt(needy_outsider_sick_remarks) || 0,
            needy_outsider_business_target || '', parseInt(needy_outsider_business_count) || 0, parseInt(needy_outsider_business_remarks) || 0,
            needy_disaster_target || '', parseInt(needy_disaster_count) || 0, parseInt(needy_disaster_remarks) || 0,
            needy_multicultural_target || '', parseInt(needy_multicultural_count) || 0, parseInt(needy_multicultural_remarks) || 0,
            needy_hospital_target || '', parseInt(needy_hospital_count) || 0, parseInt(needy_hospital_remarks) || 0,
            needy_welfare_target || '', parseInt(needy_welfare_count) || 0, parseInt(needy_welfare_remarks) || 0,
            needy_emergency_target || '', parseInt(needy_emergency_count) || 0, parseInt(needy_emergency_remarks) || 0,
            
            // 종목 4: 레지오활동
            legion_junior_target || '', parseInt(legion_junior_count) || 0, parseInt(legion_junior_remarks) || 0,
            legion_active_target || '', parseInt(legion_active_count) || 0, parseInt(legion_active_remarks) || 0,
            legion_auxiliary_target || '', parseInt(legion_auxiliary_count) || 0, parseInt(legion_auxiliary_remarks) || 0,
            legion_praesidium_target || '', parseInt(legion_praesidium_count) || 0, parseInt(legion_praesidium_remarks) || 0,
            legion_absent_target || '', parseInt(legion_absent_count) || 0, parseInt(legion_absent_remarks) || 0,
            legion_handbook_target || '', parseInt(legion_handbook_count) || 0, parseInt(legion_handbook_remarks) || 0,
            legion_council_target || '', parseInt(legion_council_count) || 0, parseInt(legion_council_remarks) || 0,
            
            // 종목 5: 기도생활지구와함께
            parseInt(prayer_together_mass_count) || 0, parseInt(refuse_count) || 0,
            parseInt(prayer_together_adoration_count) || 0, parseInt(save_count) || 0,
            parseInt(prayer_together_confession_count) || 0, parseInt(repair_count) || 0,
            parseInt(prayer_together_rosary_count) || 0, parseInt(rethink_count) || 0,
            parseInt(bibleread_count) || 0, parseInt(rewrite_count) || 0,
            parseInt(biblewrite_count) || 0, parseInt(replay_count) || 0,
            parseInt(divine_mercy_count) || 0, parseInt(reuse_count) || 0
        ];

        const result = await client.query(insertSQL, values);
        client.release();

        res.json({
            success: true,
            message: '활동 보고서가 성공적으로 저장되었습니다.',
            id: result.rows[0].id
        });

    } catch (error) {
        console.error('데이터 저장 오류:', error);
        res.status(500).json({
            success: false,
            message: '데이터 저장 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 메인 페이지 라우트
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'actinput.html'));
});

// 서버 시작
app.listen(PORT, async () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
    await createTables();
});

module.exports = app;
