(function (global) {
    'use strict';

    const SECTIONS = [
        { id: 'start', title: '시작하기' },
        { id: 'login', title: '로그인' },
        { id: 'signup', title: '회원가입' },
        { id: 'find-password', title: '비밀번호 찾기' },
        { id: 'menu', title: '햄버거 메뉴' },
        { id: 'activity-input', title: '활동 입력' },
        { id: 'activity-report', title: '활동 집계' },
        { id: 'assignment', title: '활동배당지시' },
        { id: 'sample', title: '샘플·TEST' },
        { id: 'account', title: '계정 관리' },
        { id: 'faq', title: '자주 묻는 질문' }
    ];

    function escHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function isPiregioVariant() {
        return !!document.querySelector('.pi-payment-info');
    }

    function buildPiSection() {
        if (!isPiregioVariant()) return '';
        return `
            <section class="regio-help-section" id="help-pi">
                <h3>Pi 사용료 안내 (piregio)</h3>
                <p>로그인 화면 하단에 Pi 입금 주소와 사용료가 표시됩니다.</p>
                <ul>
                    <li>월 사용료: Pi 5개</li>
                    <li>년 사용료: Pi 50개</li>
                </ul>
                <p class="regio-help-note">입금 주소는 화면에 표시된 문자열을 그대로 복사해 사용하세요.</p>
            </section>
        `;
    }

    function isLocalMockHelp() {
        if (global.RegioAppMode && typeof global.RegioAppMode.isLocal === 'function') {
            return global.RegioAppMode.isLocal();
        }
        try {
            const host = String((global.location && global.location.hostname) || '').toLowerCase();
            return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '' || host.endsWith('.local');
        } catch (_) {
            return false;
        }
    }

    function getSections() {
        const list = SECTIONS.slice().filter((s) => s.id !== 'sample' || isLocalMockHelp());
        if (isPiregioVariant()) {
            list.splice(list.length - 1, 0, { id: 'pi', title: 'Pi 사용료' });
        }
        return list;
    }

    function buildHelpHtml() {
        const sections = getSections();
        return `
            <div class="regio-help-layout">
                <nav class="regio-help-nav" id="regioHelpNav">
                    ${sections.map((s) => `<button type="button" class="regio-help-nav-btn" data-help-section="${s.id}">${escHtml(s.title)}</button>`).join('')}
                </nav>
                <div class="regio-help-body" id="regioHelpBody">
                    <section class="regio-help-section" id="help-start">
                        <h3>Regio Note 이용 안내</h3>
                        <p>Regio Note는 레지오 활동 기록·집계·배당 지시를 돕는 웹 앱입니다. 아래 순서대로 따라 하시면 됩니다.</p>
                        <ol class="regio-help-steps">
                            <li>로그인 화면에서 <strong>개인정보 수집·이용 동의</strong>를 선택합니다.</li>
                            <li><strong>회원가입</strong>으로 계정을 만들거나, 이미 가입했다면 <strong>로그인</strong>합니다.</li>
                            <li>로그인 후 <strong>개인 활동기록</strong> 화면에서 활동을 입력합니다.</li>
                            <li>우측 상단 <strong>≡ 햄버거 메뉴</strong>에서 집계·배당·도움말 등을 이용합니다.</li>
                            <li>작업을 마치면 <strong>작업마침</strong> 또는 메뉴의 <strong>로그아웃</strong>을 눌러 종료합니다.</li>
                        </ol>
                        <p class="regio-help-tip">≡ 메뉴는 화면 오른쪽 위 세 줄 아이콘입니다. 메뉴를 연 뒤 항목을 탭하면 해당 기능으로 이동합니다.</p>
                    </section>

                    <section class="regio-help-section" id="help-login">
                        <h3>로그인 방법</h3>
                        <h4>① 개인정보 동의</h4>
                        <p>로그인·비밀번호 찾기·회원가입 전에 하단 <strong>동의함</strong>을 선택해야 합니다. 동의하지 않으면 입력란이 잠깁니다.</p>
                        <h4>② ID 입력</h4>
                        <p><strong>신규 회원 (G 접두사)</strong></p>
                        <ol class="regio-help-steps">
                            <li>로그인 ID는 <strong>성명+숫자4자리</strong>입니다. (예: <code>김민수7327</code>)</li>
                            <li>ID 입력란을 누르면 직책 목록이 열립니다. 직책 선택 후 성명만 입력하면 후보가 안내되고, 1명이면 ID가 자동 기입됩니다.</li>
                            <li>직책: 단장 G1 · 부단장 G2 · 서기 G3 · 회계 G4 · 행동단원 G5 · 협조단원 G6 · 쁘레또리운 G7 · 아듀또리움 G8</li>
                        </ol>
                        <h4>③ 비밀번호</h4>
                        <p>특수문자+영문3자+숫자4자 (총 8자) 형식입니다. (예: <code>@abc1234</code>) 입력란 옆 <strong>보기</strong>로 확인할 수 있습니다.</p>
                        <h4>④ 로그인 실행</h4>
                        <p>ID와 비밀번호를 모두 입력하면 <strong>로그인</strong> 버튼이 활성화됩니다. 버튼을 누르면 활동 입력 화면으로 이동합니다.</p>
                        <h4>⑤ 편의 기능</h4>
                        <ul>
                            <li><strong>ID 저장</strong>: 다음에 ID를 자동으로 채웁니다.</li>
                            <li><strong>자동 로그인</strong>: 다음 접속 시 자동으로 활동 입력 화면으로 이동합니다. (개인정보 동의가 유지되어 있어야 합니다.)</li>
                            <li><strong>Google 로그인</strong>: Google 계정으로도 로그인할 수 있습니다.</li>
                            <li><strong>비번찾기</strong>: 로그인 패널의 비번찾기 버튼 또는 상단 탭에서 이용합니다.</li>
                        </ul>
                    </section>

                    <section class="regio-help-section" id="help-signup">
                        <h3>회원가입 (등록신청)</h3>
                        <ol class="regio-help-steps">
                            <li>로그인 화면 하단 <strong>회원가입</strong>을 누릅니다. (개인정보 동의 필요)</li>
                            <li>직책을 선택한 뒤 <strong>성명+숫자4자리</strong>를 ID로 입력합니다. (G1~G8는 자동 적용)</li>
                            <li>등록 Gmail 주소로 <strong>인증발송 → 인증코드 입력 → 인증확인</strong>을 완료합니다. (미인증 시 가입 불가)</li>
                            <li>세례명, 성별, 성당, Pr, (해당 시) 꾸리아, 비밀번호(특수문자+영문3+숫자4, 예: @abc1234)를 입력합니다.</li>
                            <li><strong>등록신청</strong>을 누르면 가입이 접수됩니다.</li>
                        </ol>
                        <p class="regio-help-note">협조단원(G6)은 Pr만 입력하면 되며, 꾸리아는 나중에 기록할 수 있습니다.</p>
                    </section>

                    <section class="regio-help-section" id="help-find-password">
                        <h3>비밀번호 찾기</h3>
                        <ol class="regio-help-steps">
                            <li>로그인 화면에서 <strong>비번찾기</strong>를 누르거나 상단 탭을 전환합니다.</li>
                            <li>ID(직책+성명+4자리), 본명(세례명 제외), 성당 중 <strong>2가지 이상</strong>을 입력합니다.</li>
                            <li><strong>인증코드 발송</strong>으로 등록 Gmail에 코드를 받습니다.</li>
                            <li>6자리 코드 입력 후 <strong>인증 후 찾기</strong>를 누르면 비밀번호 안내가 표시됩니다.</li>
                        </ol>
                    </section>

                    <section class="regio-help-section" id="help-menu">
                        <h3>햄버거 메뉴 (≡) 항목 설명</h3>
                        <p>화면 오른쪽 위 ≡ 를 누르면 아래 메뉴가 열립니다. 로그인·권한에 따라 일부 항목은 보이지 않을 수 있습니다.</p>
                        <table class="regio-help-table">
                            <thead><tr><th>메뉴</th><th>설명</th><th>조건</th></tr></thead>
                            <tbody>
                                <tr><td>개인 활동기록</td><td>활동 입력·저장 화면</td><td>로그인</td></tr>
                                <tr><td>개인활동집계</td><td>본인 활동을 기간별로 조회</td><td>로그인</td></tr>
                                <tr><td>서기회의록집계</td><td>서기용 회의록·활동 집계</td><td>로그인</td></tr>
                                <tr><td>Pr 보고</td><td>월례보고(쁘레시디움 양식) 또는 사업보고 선택</td><td>로그인</td></tr>
                                <tr><td>평의회보고</td><td>꾸리아 선택 후 월례보고/종합보고</td><td>로그인</td></tr>
                                <tr><td>꾸리아직급등록</td><td>꾸리아 단장~회계(K1~K4) 등록</td><td>G1~G4</td></tr>
                                <tr><td>활동배당지시</td><td>단원에게 활동 배당 입력</td><td>G1~G4 직책</td></tr>
                                ${isLocalMockHelp() ? `
                                <tr><td>TEST 자료입력</td><td>테스트 회원 100명 생성·삭제 (로컬 모의 전용)</td><td>관리자·로컬</td></tr>
                                <tr><td>TEST 자료 PDF 출력</td><td>TEST 자료 화면 확인 후 PDF 저장 (로컬 모의 전용)</td><td>로그인·로컬</td></tr>
                                <tr><td>샘플명단출력</td><td>샘플 회원 명단·PDF (로컬 모의 전용)</td><td>로컬</td></tr>
                                <tr><td>1연간샘플활동출력</td><td>2025년 샘플활동자료 (로컬 모의 전용)</td><td>로컬</td></tr>
                                ` : ''}
                                <tr><td>지정활동 수정</td><td>활동 종목·필드 설정</td><td>관리자</td></tr>
                                <tr><td>새 카테고리 추가</td><td>새 활동 카테고리 등록</td><td>관리자</td></tr>
                                <tr><td>프로필 수정</td><td>프로필·연락처 수정</td><td>로그인 (샘플회원 제외)</td></tr>
                                <tr><td>도움말</td><td>이 안내 화면</td><td>항상</td></tr>
                                <tr><td>탈단</td><td>회원 탈단 신청</td><td>로그인 (샘플회원 제외)</td></tr>
                                <tr><td>삭제</td><td>회원 DB 삭제 (관리용)</td><td>관리자</td></tr>
                                <tr><td>로그아웃</td><td>로그인 정보 삭제 후 종료</td><td>로그인</td></tr>
                            </tbody>
                        </table>
                        <p class="regio-help-note">관리자: <strong>김학숭</strong> 계정(또는 maducokr@gmail.com)으로 로그인한 경우에만 지정활동 수정·삭제 등이 표시됩니다.${isLocalMockHelp() ? ' TEST·샘플 메뉴는 로컬 모의 환경에서만 보입니다.' : ' Deploy(실서비스)에서는 실제 회원 DB만 사용하며 샘플·TEST 메뉴는 없습니다.'}</p>
                    </section>

                    <section class="regio-help-section" id="help-activity-input">
                        <h3>개인 활동기록 (활동 입력)</h3>
                        <ol class="regio-help-steps">
                            <li>로그인하면 활동 입력 화면으로 이동합니다. (← 버튼으로 로그인 화면 복귀)</li>
                            <li><strong>회원 선택</strong>: 활동을 기록할 회원을 고릅니다.</li>
                            <li><strong>활동 날짜</strong>: 날짜를 누르면 년·월·일 스크롤 휠에서 선택합니다. (기본: 오늘)</li>
                            <li><strong>활동 종목</strong>: 목록에서 종목을 고르면 입력 칸(횟수·단·시간·명 등)이 나타납니다.</li>
                            <li>필요 시 <strong>메모및 행사</strong>를 누릅니다.
                                <ul>
                                    <li><strong>메모</strong>: 메모 / 주요활동내역 / 질의 / 건의 네 칸에 입력합니다. (월례보고에는 주요활동내역·질의·건의만 반영되고, 메모 칸은 월례 양식에 넣지 않습니다.)</li>
                                    <li><strong>행사</strong>: 단체행사·기타행사·교육·피정및연수 중 선택합니다. 표에는 <strong>구분</strong>(실시/계획)·<strong>제목</strong>·주관·일자·장소·내용·참석을 입력합니다. 단체·기타행사의 제목은 아치에스·야외행사·Pr친목회·연차총친목회·토론대회·성모의밤·위령미사·단장간담회·직접기재 중에서 고릅니다. 기타행사·교육·피정및연수의 주관은 Pr·꾸리아·꼬미시움·레지아·본당·직접기재 중에서 고릅니다.</li>
                                    <li>단체행사는 Pr·꾸리아·꼬미시움·레지아·본당을 고르면 표 왼쪽 위와 주관에 해당 단체가 표시됩니다. 월례·종합·사업보고의 행사 집계는 이 <strong>주관</strong> 기준으로 모읍니다.</li>
                                </ul>
                            </li>
                            <li><strong>활동 저장하기</strong>를 눌러 저장합니다.</li>
                        </ol>
                        <p class="regio-help-tip">같은 화면에서 여러 활동을 연속으로 입력할 수 있습니다.</p>
                    </section>

                    <section class="regio-help-section" id="help-activity-report">
                        <h3>활동 집계·보고</h3>
                        <p>햄버거 메뉴에서 원하는 종류를 선택합니다.</p>
                        <ul>
                            <li><strong>개인활동집계</strong>: 본인 활동만 조회</li>
                            <li><strong>서기회의록집계</strong>: 서기용 회의록·기간별 집계 (1일/1주/한달/일년 버튼)</li>
                            <li><strong>Pr 보고</strong>: <em>월례보고</em>(쁘레시디움 양식·간부·단원현황·행사·주요활동내역·질의/건의) 또는 <em>사업보고</em>(기간별 활동 집계)</li>
                            <li><strong>평의회보고</strong>: 꾸리아 선택 → <em>월례보고</em> 또는 <em>종합보고</em></li>
                        </ul>
                        <ol class="regio-help-steps">
                            <li>종합보고·사업보고(기간별 집계)에서는 기간 버튼(1일·1주·한달·일년) 또는 날짜를 설정한 뒤 조회합니다.</li>
                            <li>월례보고는 연·월과 명칭(성당·Pr 또는 평의회명)을 넣고 <strong>조회</strong>합니다. PDF 출력도 가능합니다.</li>
                            <li>행사·교육은 개인활동의 <strong>주관</strong>에 표시된 평의회 자료 기준으로 집계됩니다.</li>
                            <li>Pr 단원현황은 금월 인원을 기록하며, 전월 자료가 있으면 전월·증가·감소를 표시합니다.</li>
                        </ol>
                    </section>

                    <section class="regio-help-section" id="help-assignment">
                        <h3>활동배당지시</h3>
                        <p>G1(단장)·G2(부단장)·G3(서기)·G4(회계) 로그인 회원만 이용할 수 있습니다.</p>
                        <ol class="regio-help-steps">
                            <li>햄버거 메뉴 → <strong>활동배당지시</strong></li>
                            <li>배당할 회원, 활동 종목, 대상자 등을 입력합니다.</li>
                            <li>저장하면 해당 회원의 배당 내역에 반영됩니다.</li>
                        </ol>
                    </section>

                    ${isLocalMockHelp() ? `
                    <section class="regio-help-section" id="help-sample">
                        <h3>샘플·TEST 기능 (로컬 모의 전용)</h3>
                        <p class="regio-help-note">이 기능은 <strong>로컬 모의 환경</strong>에서만 제공됩니다. Deploy(실서비스)·앱스토어 빌드에서는 메뉴·API가 숨겨지며 실제 회원 DB만 사용합니다.</p>
                        <h4>샘플명단출력 / 1연간샘플활동출력</h4>
                        <p>로그인 없이 이용 가능합니다. 메뉴 선택 → 화면에서 내용 확인 → <strong>PDF 출력</strong> 버튼으로 저장합니다.</p>
                        <p class="regio-help-tip">샘플명단출력 PDF의 <strong>회원 3~103번</strong> 성명·비번으로 로그인하면, 해당 명단으로 햄버거에서 허락된 메뉴를 테스트할 수 있습니다.</p>
                        <h4>TEST 자료 PDF 출력</h4>
                        <ol class="regio-help-steps">
                            <li>로그인 후 메뉴에서 선택합니다.</li>
                            <li>화면에 ①개인 1주 ②소속 Pr 1개월 ③소속 꾸리아 1개월 자료가 표시됩니다.</li>
                            <li>확인 후 <strong>PDF 출력</strong>을 누르면 파일이 저장됩니다.</li>
                        </ol>
                        <h4>TEST 자료입력 (관리자)</h4>
                        <p>테스트 회원 100명 생성·PDF·삭제를 관리합니다. 실험 후 <strong>100명 삭제</strong>로 정리하세요.</p>
                        <p class="regio-help-note">모의 테스터(회원 3~103번)는 탈단 메뉴가 제공되지 않습니다. 프로필 수정은 테스트용으로 이용 가능합니다.</p>
                    </section>
                    ` : ''}

                    ${buildPiSection()}

                    <section class="regio-help-section" id="help-account">
                        <h3>계정·개인정보 관리</h3>
                        <ul>
                            <li><strong>프로필 수정</strong>: 햄버거 메뉴 → 프로필 항목 수정 (Gmail 재인증 필요할 수 있음)</li>
                            <li><strong>탈단</strong>: 본인 확인 후 탈단 절차 진행</li>
                            <li><strong>작업마침</strong> (로그인 화면): 로그아웃과 동일하게 세션을 종료합니다.</li>
                            <li><strong>로그아웃</strong>: 메뉴에서 로그인 정보를 지우고 처음 화면으로 돌아갑니다.</li>
                        </ul>
                        <p>개인정보 처리 방침은 로그인 화면 하단 <strong>개인정보 수집 및 이용 동의문</strong> 링크에서 확인할 수 있습니다.</p>
                    </section>

                    <section class="regio-help-section" id="help-faq">
                        <h3>자주 묻는 질문</h3>
                        <dl class="regio-help-faq">
                            <dt>로그인 버튼이 비활성화돼요.</dt>
                            <dd>개인정보 동의, ID, 비밀번호를 모두 입력했는지 확인하세요. 비밀번호는 특수문자+영문3+숫자4 형식입니다. (예: @abc1234)</dd>
                            <dt>메뉴 항목이 안 보여요.</dt>
                            <dd>로그인 여부·직책(G1~G4)·관리자 계정에 따라 표시되는 메뉴가 다릅니다. 위 「햄버거 메뉴」 표를 참고하세요.</dd>
                            <dt>다른 페이지에서 메뉴를 눌렀는데 로그인 화면으로 가요.</dt>
                            <dd>TEST PDF 등 일부 기능은 로그인 화면(index)에서 이어서 실행됩니다. 로그인 후 자동으로 다시 열립니다.</dd>
                            <dt>「API를 찾을 수 없습니다」 오류가 나요.</dt>
                            <dd>서버가 꺼져 있거나 재시작이 필요합니다. PC에서 서버켜기.bat 실행 후 다시 시도하세요.</dd>
                            <dt>자동 로그인이 안 돼요.</dt>
                            <dd>「자동 로그인」체크와 개인정보 동의가 모두 필요합니다. ← 로그인 화면으로 돌아올 때는 1회 건너뜁니다.</dd>
                        </dl>
                    </section>
                </div>
            </div>
        `;
    }

    function ensureHelpStyles() {
        if (document.getElementById('regio-help-styles')) return;
        const style = document.createElement('style');
        style.id = 'regio-help-styles';
        style.textContent = `
            #regioHelpModal { position:fixed; inset:0; background:rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; z-index:10050; padding:12px; }
            #regioHelpModal .regio-help-dialog { background:#fff; border-radius:12px; width:min(960px,100%); max-height:92vh; display:flex; flex-direction:column; box-shadow:0 12px 40px rgba(0,0,0,0.25); overflow:hidden; }
            #regioHelpModal .regio-help-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #eee; background:linear-gradient(135deg,#4A90E2,#357ABD); color:#fff; }
            #regioHelpModal .regio-help-header h2 { margin:0; font-size: 12px; font-weight:700; }
            #regioHelpModal .regio-help-close { background:rgba(255,255,255,0.2); border:none; color:#fff; width:36px; height:36px; border-radius:8px; font-size: 18px; line-height:1; cursor:pointer; }
            #regioHelpModal .regio-help-close:hover { background:rgba(255,255,255,0.35); }
            #regioHelpModal .regio-help-layout { display:flex; flex:1; min-height:0; overflow:hidden; }
            #regioHelpModal .regio-help-nav { width:168px; flex-shrink:0; border-right:1px solid #eee; overflow-y:auto; padding:10px 8px; background:#f8f9fa; }
            #regioHelpModal .regio-help-nav-btn { display:block; width:100%; text-align:left; border:none; background:transparent; padding:10px 12px; margin-bottom:4px; border-radius:8px; font-size: 12px; color:#333; cursor:pointer; }
            #regioHelpModal .regio-help-nav-btn:hover { background:#e9ecef; }
            #regioHelpModal .regio-help-nav-btn.is-active { background:#4A90E2; color:#fff; font-weight:600; }
            #regioHelpModal .regio-help-body { flex:1; overflow-y:auto; padding:20px 22px; font-size: 12px; line-height:1.65; color:#333; }
            #regioHelpModal .regio-help-section { display:none; }
            #regioHelpModal .regio-help-section.is-active { display:block; }
            #regioHelpModal .regio-help-section h3 { margin:0 0 12px; font-size: 12px; color:#357ABD; }
            #regioHelpModal .regio-help-section h4 { margin:16px 0 8px; font-size: 12px; color:#444; }
            #regioHelpModal .regio-help-steps { margin:8px 0 12px 20px; }
            #regioHelpModal .regio-help-steps li { margin-bottom:6px; }
            #regioHelpModal ul { margin:8px 0 12px 20px; }
            #regioHelpModal code { background:#f1f3f5; padding:2px 6px; border-radius:4px; font-size: 12px; }
            #regioHelpModal .regio-help-tip { background:#e8f4fd; border-left:4px solid #4A90E2; padding:10px 12px; border-radius:0 8px 8px 0; margin:12px 0; font-size: 12px; }
            #regioHelpModal .regio-help-note { background:#fff8e6; border-left:4px solid #ffc107; padding:10px 12px; border-radius:0 8px 8px 0; margin:12px 0; font-size: 12px; color:#664d03; }
            #regioHelpModal .regio-help-table { width:100%; border-collapse:collapse; font-size: 12px; margin:12px 0; }
            #regioHelpModal .regio-help-table th, #regioHelpModal .regio-help-table td { border:1px solid #dee2e6; padding:8px 10px; text-align:left; vertical-align:top; }
            #regioHelpModal .regio-help-table th { background:#4A90E2; color:#fff; }
            #regioHelpModal .regio-help-table tr:nth-child(even) { background:#f8f9fa; }
            #regioHelpModal .regio-help-faq dt { font-weight:700; margin-top:14px; color:#333; }
            #regioHelpModal .regio-help-faq dd { margin:4px 0 0 0; color:#555; }
            @media (max-width:720px) {
                #regioHelpModal .regio-help-layout { flex-direction:column; }
                #regioHelpModal .regio-help-nav { width:100%; border-right:none; border-bottom:1px solid #eee; display:flex; flex-wrap:wrap; gap:4px; max-height:120px; }
                #regioHelpModal .regio-help-nav-btn { width:auto; flex:1 1 auto; min-width:calc(50% - 4px); text-align:center; padding:8px 6px; font-size:12px; }
            }
        `;
        document.head.appendChild(style);
    }

    function scrollToHelpSection(sectionId) {
        const modal = document.getElementById('regioHelpModal');
        if (!modal) return;
        const targetId = sectionId === 'pi' ? 'help-pi' : `help-${sectionId}`;
        modal.querySelectorAll('.regio-help-section').forEach((el) => {
            el.classList.toggle('is-active', el.id === targetId);
        });
        modal.querySelectorAll('.regio-help-nav-btn').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.helpSection === sectionId);
        });
        const body = modal.querySelector('#regioHelpBody');
        if (body) body.scrollTop = 0;
    }

    function closeUserHelp() {
        const modal = document.getElementById('regioHelpModal');
        if (modal) modal.remove();
    }

    function showUserHelp(initialSection) {
        ensureHelpStyles();
        closeUserHelp();

        const overlay = document.createElement('div');
        overlay.id = 'regioHelpModal';
        overlay.innerHTML = `
            <div class="regio-help-dialog" role="dialog" aria-modal="true" aria-labelledby="regioHelpTitle">
                <div class="regio-help-header">
                    <h2 id="regioHelpTitle">Regio Note 도움말</h2>
                    <button type="button" class="regio-help-close" id="regioHelpCloseBtn" aria-label="닫기">&times;</button>
                </div>
                ${buildHelpHtml()}
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#regioHelpCloseBtn').addEventListener('click', closeUserHelp);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeUserHelp();
        });
        overlay.querySelector('#regioHelpNav').addEventListener('click', (e) => {
            const btn = e.target.closest('.regio-help-nav-btn');
            if (!btn) return;
            scrollToHelpSection(btn.dataset.helpSection);
        });

        const startSection = initialSection || 'start';
        scrollToHelpSection(startSection);
    }

    document.addEventListener('click', (e) => {
        const item = e.target.closest('[data-action="help"]');
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll('.dropdown-menu.show').forEach((menu) => menu.classList.remove('show'));
        showUserHelp();
    }, true);

    global.showUserHelp = showUserHelp;
    global.RegioUserHelp = { show: showUserHelp, close: closeUserHelp };
})(typeof window !== 'undefined' ? window : global);
