/**
 * 모의/샘플 시드 스크립트 보호
 * - 로컬 DB(localhost/127.0.0.1)에서만 실행 허용
 * - 배포 DB 오기록을 막기 위해 ALLOW_SAMPLE_SEED=1 이 아니면 원격 호스트 거부
 */
function isLocalDbHost(host) {
    const h = String(host || '').trim().toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '';
}

function assertLocalSampleDb(options = {}) {
    const host = options.host != null
        ? options.host
        : (process.env.DB_HOST || 'localhost');
    const allowRemote = String(process.env.ALLOW_SAMPLE_SEED || '').trim() === '1';

    if (isLocalDbHost(host) || allowRemote) {
        if (!isLocalDbHost(host) && allowRemote) {
            console.warn('⚠ ALLOW_SAMPLE_SEED=1 — 원격 DB에 샘플 시드를 허용합니다:', host);
        }
        return;
    }

    console.error('❌ 샘플/모의 시드 스크립트는 로컬 DB에서만 실행할 수 있습니다.');
    console.error(`   현재 DB_HOST=${host}`);
    console.error('   Deploy DB에 쓰지 않도록 차단했습니다.');
    console.error('   (로컬이 아닌 환경에서 꼭 필요하면 ALLOW_SAMPLE_SEED=1 을 설정하세요.)');
    process.exit(1);
}

module.exports = {
    isLocalDbHost,
    assertLocalSampleDb
};
