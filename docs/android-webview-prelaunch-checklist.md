# Android WebView 출시 전 점검 (다기종 테스트 → Play Store)

목표: **Play Store 출시 전** Capacitor Android WebView로 각종 폰에서 기능·레이아웃 검증을 끝낸 뒤 AAB 배포.

## 현재 적합도 요약

| 영역 | 상태 | 비고 |
|------|------|------|
| Capacitor 골격 (`mobile/`) | 준비됨 | `android/` 프로젝트는 아직 생성 전 (`npx cap add android`) |
| 원격 WebView 로드 | 설정 필요 | `server.url` 이 placeholder — Render(또는 테스트 HTTPS)로 교체 |
| 모바일 UI (`mobile.css`) | 양호 | safe-area, 터치 44px, 입력 16px, 햄버거 화면 유동폭 |
| 로그인/회원가입(Gmail) | 양호 | WebView에서도 HTTPS+Gmail SMTP 필요 |
| 하드웨어 뒤로가기 | 보강됨 | `webview-android.js` + `@capacitor/app` |
| theme-color / viewport-fit | 보강됨 | 주요 화면 `#4A90E2`, safe-area |
| Play 인앱결제 | **미완** | `billing-bridge.js` TODO — 출시 전 플러그인 연동 필수(유료 시) |
| Privacy / 개인정보 | 확인 필요 | Play 정책·개인정보처리방침 URL 등록 |
| 다기종 실기기 테스트 | **진행 필요** | 아래 매트릭스 |

**결론:** WebView 다기종 테스트 단계로는 **가능**. Play 정식 출시 전에는 `server.url` 확정, `cap add android`, 실기기 매트릭스 통과, (유료면) Billing 연동·정책 문서 완료가 필요.

---

## 권장 테스트 구조

```
[실기기 Android]  Capacitor WebView
        │  HTTPS
        ▼
[RENDERregio 또는 사내 HTTPS 서버]  ← 모의 DB는 로컬 전용, APK는 deploy 모드
```

- Capacitor 네이티브 → `app-mode.js` 가 **deploy** 로 동작 (샘플/TEST 메뉴 숨김)
- 폰에서 **로컬 PC IP**로 테스트할 때만 임시로:
  - `server.url`: `http://192.168.x.x:3000`
  - `cleartext`: `true`
  - 테스트 후 **반드시 HTTPS + cleartext false** 로 되돌림

---

## 기기 매트릭스 (최소)

| 구분 | 권장 해상도/기기 예 | 확인 포인트 |
|------|---------------------|-------------|
| 소형 | 360×640 급 (구형) | 햄버거·입력·표 가로스크롤, 키보드 가림 |
| 표준 | 390×844 급 (일반) | 로그인·활동입력·집계 |
| 대형 | 412×915+ / 폴드 커버 | 여백·터치 영역 |
| 노치/펀치홀 | 최근 중저가 | safe-area, 헤더 잘림 |
| Android 버전 | 8 / 10 / 12 / 14 | WebView Chromium, 파일·카메라 미사용 확인 |
| 네트워크 | Wi‑Fi / LTE | Gmail 인증, API 지연·오프라인 메시지 |

---

## 화면별 스모크 체크리스트

- [ ] 개인정보 동의 → 로그인 (성명+숫자4 / 특수문자+영문3+숫자4)
- [ ] 회원가입: Gmail 인증발송 → 코드 → 인증확인 → 등록 (미인증 시 차단)
- [ ] 비번찾기 Gmail 인증
- [ ] 햄버거: 개인활동기록 / 개인집계 / Pr·평의회 / 배당 / 프로필
- [ ] 모달 열림·닫힘, **물리 뒤로가기**로 모달만 닫히는지
- [ ] 가상키보드: 하단 버튼·입력란이 가려지지 않는지(스크롤)
- [ ] 가로 표: 페이지 전체가 밀리지 않고 표만 가로 스크롤
- [ ] 세션/자동로그인, 로그아웃
- [ ] (해당 시) 탈단·삭제의 Gmail 재인증

---

## 빌드·디버그

```bash
cd mobile
npm install
npx cap add android          # 최초 1회
# capacitor.config.json 의 server.url 설정
npx cap sync android
npx cap open android
```

- `webContentsDebuggingEnabled: true` → Chrome `chrome://inspect` 로 WebView 디버그 (출시 빌드 전 false 권장)
- User-Agent에 `RegioNoteApp` 포함 → 서버/로그 구분 가능

---

## Play Store 직전 (WebView 테스트 통과 후)

1. `server.url` = 운영 Render HTTPS
2. `cleartext: false`, `webContentsDebuggingEnabled: false`
3. 서명 AAB 생성 → 내부/비공개 테스트 트랙
4. 개인정보처리방침·데이터 안전성 양식
5. 인앱결제 사용 시: Billing 플러그인 + `docs/google-play-inapp-setup.md`
6. 스토어 스크린샷: 위 매트릭스 기기에서 촬영

관련: `mobile/README.md`, `docs/google-play-inapp-setup.md`
