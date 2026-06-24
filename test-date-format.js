// 날짜 처리 테스트 스크립트
function formatActivityDate(dateString) {
    if (!dateString) return '날짜없음';
    
    // 문자열로 변환
    const dateStr = String(dateString).trim();
    
    // YYYY-MM-DD 형식을 추출하는 정규식 (시간대 정보 무시)
    const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
        const [, year, month, day] = dateMatch;
        return `${year}-${month}-${day}`;
    }
    
    // PostgreSQL에서 반환되는 날짜 형식 처리 (예: "2025-09-09T00:00:00.000Z")
    const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})T/);
    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        return `${year}-${month}-${day}`;
    }
    
    // Date 객체로 파싱 시도 (시간대 변환 방지)
    try {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            // UTC 기준으로 날짜 추출하여 시간대 변환 방지
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    } catch (e) {
        console.warn('날짜 파싱 실패:', dateStr, e);
    }
    
    // 모든 시도 실패
    return '날짜없음';
}

// 테스트 케이스들
const testCases = [
    '2025-09-09',
    '2025-09-09T00:00:00.000Z',
    '2025-09-09T00:00:00',
    '2025-09-09 00:00:00',
    '2025-09-09T15:30:00.000Z',
    '2025-09-10T00:00:00.000Z',
    '2025-09-08T23:59:59.999Z'
];

console.log('날짜 처리 테스트:');
console.log('================');

testCases.forEach(testCase => {
    const result = formatActivityDate(testCase);
    console.log(`입력: ${testCase} -> 출력: ${result}`);
});

console.log('\n예상 결과: 모든 케이스에서 올바른 날짜가 출력되어야 합니다.');
