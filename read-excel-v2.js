const XLSX = require('xlsx');
const fs = require('fs');

function readExcelFile() {
    try {
        // 엑셀 파일 읽기
        const workbook = XLSX.readFile('regio_test_data_v2_2025-08-11.xlsx');
        
        console.log('=== 개선된 엑셀 파일 내용 확인 ===\n');
        
        // 시트 이름 확인
        console.log('시트 목록:', workbook.SheetNames);
        
        // 회원정보 시트 읽기
        const memberSheet = workbook.Sheets['회원정보'];
        const memberData = XLSX.utils.sheet_to_json(memberSheet);
        
        console.log(`\n총 회원 수: ${memberData.length}명`);
        
        // 처음 3명의 정보 출력
        console.log('\n=== 처음 3명의 정보 ===');
        memberData.slice(0, 3).forEach((row, index) => {
            console.log(`${index + 1}. ${row['성명']} (${row['세례명']}) - ${row['성당명칭']} - ${row['PR이름']} - ${row['직책']}`);
            console.log(`   비밀번호: ${row['비밀번호']}`);
            console.log(`   전도: ${row['전도활동']}회, 돌봄: ${row['돌봄활동']}회, 구제: ${row['구제활동']}회`);
            console.log(`   레지오: ${row['레지오활동']}회, 기도: ${row['기도생활']}회, 지구: ${row['지구와함께']}회`);
            console.log(`   총활동: ${row['총활동회수']}회, 날짜: ${row['활동날짜']}`);
        });
        
        // 마지막 3명의 정보 출력
        console.log('\n=== 마지막 3명의 정보 ===');
        memberData.slice(-3).forEach((row, index) => {
            console.log(`${index + 1}. ${row['성명']} (${row['세례명']}) - ${row['성당명칭']} - ${row['PR이름']} - ${row['직책']}`);
            console.log(`   비밀번호: ${row['비밀번호']}`);
            console.log(`   전도: ${row['전도활동']}회, 돌봄: ${row['돌봄활동']}회, 구제: ${row['구제활동']}회`);
            console.log(`   레지오: ${row['레지오활동']}회, 기도: ${row['기도생활']}회, 지구: ${row['지구와함께']}회`);
            console.log(`   총활동: ${row['총활동회수']}회, 날짜: ${row['활동날짜']}`);
        });
        
        // 통계 시트 읽기
        const statsSheet = workbook.Sheets['통계'];
        const statsData = XLSX.utils.sheet_to_json(statsSheet);
        
        console.log('\n=== 통계 정보 ===');
        statsData.forEach(row => {
            console.log(`${row['구분']}: ${row['수량']}`);
        });
        
        // 활동별 통계 시트 읽기
        const activitySheet = workbook.Sheets['활동별통계'];
        const activityData = XLSX.utils.sheet_to_json(activitySheet);
        
        console.log('\n=== 활동별 통계 ===');
        activityData.forEach(row => {
            console.log(`${row['활동구분']}: 총 ${row['총회수']}회, 평균 ${row['평균']}회`);
        });
        
        // 서기 직책을 가진 회원들 확인
        const secretaries = memberData.filter(row => row['직책'] === '서기');
        console.log(`\n서기 수: ${secretaries.length}명`);
        
        // 성당별 통계
        const churchStats = {};
        memberData.forEach(row => {
            const church = row['성당명칭'];
            churchStats[church] = (churchStats[church] || 0) + 1;
        });
        
        console.log('\n=== 성당별 회원 수 ===');
        Object.entries(churchStats).forEach(([church, count]) => {
            console.log(`${church}: ${count}명`);
        });
        
        // PR별 통계
        const prStats = {};
        memberData.forEach(row => {
            const pr = row['PR이름'];
            prStats[pr] = (prStats[pr] || 0) + 1;
        });
        
        console.log('\n=== PR별 회원 수 ===');
        Object.entries(prStats).forEach(([pr, count]) => {
            console.log(`${pr}: ${count}명`);
        });
        
        // 활동별 총계
        const totalEvangelism = memberData.reduce((sum, row) => sum + row['전도활동'], 0);
        const totalCare = memberData.reduce((sum, row) => sum + row['돌봄활동'], 0);
        const totalNeedy = memberData.reduce((sum, row) => sum + row['구제활동'], 0);
        const totalLegion = memberData.reduce((sum, row) => sum + row['레지오활동'], 0);
        const totalPrayer = memberData.reduce((sum, row) => sum + row['기도생활'], 0);
        const totalDistrict = memberData.reduce((sum, row) => sum + row['지구와함께'], 0);
        const totalActivity = memberData.reduce((sum, row) => sum + row['총활동회수'], 0);
        
        console.log('\n=== 활동별 총계 ===');
        console.log(`전도활동: ${totalEvangelism}회`);
        console.log(`돌봄활동: ${totalCare}회`);
        console.log(`구제활동: ${totalNeedy}회`);
        console.log(`레지오활동: ${totalLegion}회`);
        console.log(`기도생활: ${totalPrayer}회`);
        console.log(`지구와함께: ${totalDistrict}회`);
        console.log(`총활동: ${totalActivity}회`);
        
        // 활동 날짜 분포
        const dateStats = {};
        memberData.forEach(row => {
            const date = row['활동날짜'];
            dateStats[date] = (dateStats[date] || 0) + 1;
        });
        
        console.log('\n=== 활동 날짜 분포 (처음 10개) ===');
        Object.entries(dateStats).slice(0, 10).forEach(([date, count]) => {
            console.log(`${date}: ${count}명`);
        });
        
        // 비밀번호 형식 확인
        console.log('\n=== 비밀번호 형식 확인 ===');
        memberData.slice(0, 3).forEach((row, index) => {
            const password = row['비밀번호'];
            console.log(`${index + 1}. ${row['성명']}: ${password} (길이: ${password.length}자리)`);
        });
        
    } catch (error) {
        console.error('엑셀 파일 읽기 오류:', error);
    }
}

readExcelFile();
