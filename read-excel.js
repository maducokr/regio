const XLSX = require('xlsx');
const fs = require('fs');

function readExcelFile() {
    try {
        // 엑셀 파일 읽기
        const workbook = XLSX.readFile('regio_test_data_2025-08-11.xlsx');
        
        console.log('=== 엑셀 파일 내용 확인 ===\n');
        
        // 시트 이름 확인
        console.log('시트 목록:', workbook.SheetNames);
        
        // 회원정보 시트 읽기
        const memberSheet = workbook.Sheets['회원정보'];
        const memberData = XLSX.utils.sheet_to_json(memberSheet);
        
        console.log(`\n총 회원 수: ${memberData.length}명`);
        
        // 처음 5명의 정보 출력
        console.log('\n=== 처음 5명의 정보 ===');
        memberData.slice(0, 5).forEach((row, index) => {
            console.log(`${index + 1}. ${row['성명']} (${row['세례명']}) - ${row['성당명칭']} - ${row['PR이름']} - ${row['직책']} - 비밀번호: ${row['비밀번호']} - 활동: ${row['활동회수']}회`);
        });
        
        // 마지막 5명의 정보 출력
        console.log('\n=== 마지막 5명의 정보 ===');
        memberData.slice(-5).forEach((row, index) => {
            console.log(`${index + 1}. ${row['성명']} (${row['세례명']}) - ${row['성당명칭']} - ${row['PR이름']} - ${row['직책']} - 비밀번호: ${row['비밀번호']} - 활동: ${row['활동회수']}회`);
        });
        
        // 통계 시트 읽기
        const statsSheet = workbook.Sheets['통계'];
        const statsData = XLSX.utils.sheet_to_json(statsSheet);
        
        console.log('\n=== 통계 정보 ===');
        statsData.forEach(row => {
            console.log(`${row['구분']}: ${row['수량']}`);
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
        
        // 활동 회수 통계
        const activityCounts = memberData.map(row => row['활동회수']);
        const minActivity = Math.min(...activityCounts);
        const maxActivity = Math.max(...activityCounts);
        const avgActivity = Math.round(activityCounts.reduce((a, b) => a + b, 0) / activityCounts.length);
        
        console.log('\n=== 활동 회수 통계 ===');
        console.log(`최소: ${minActivity}회`);
        console.log(`최대: ${maxActivity}회`);
        console.log(`평균: ${avgActivity}회`);
        console.log(`총합: ${activityCounts.reduce((a, b) => a + b, 0)}회`);
        
    } catch (error) {
        console.error('엑셀 파일 읽기 오류:', error);
    }
}

readExcelFile();
