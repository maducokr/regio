# Google Play APK + 인앱결제 사전 준비 가이드

Regio는 **웹(Express) + Android APK(Capacitor)** 구조로 Play Store 배포를 준비할 수 있습니다.

## 현재 준비된 것

| 항목 | 위치 |
|------|------|
| Play 결제 DB 테이블 | `create_play_billing_table.sql` |
| 서버 검증 모듈(스텁) | `lib/google-play-billing.js` |
| 결제 API | `/api/billing/config`, `/api/billing/verify` |
| 앱 브릿지 | `billing-bridge.js` |
| Android APK 골격 | `mobile/` (Capacitor) |

## 배포 아키텍처 (권장)

```
[Google Play APK]  ──HTTPS──►  [RENDERregio 서버]
     │                              │
     │ Play Billing                 │ purchaseToken 검증
     ▼                              ▼
 Google Play                  PostgreSQL (play_purchases)
```

- **LOCALHOST (`regio`)**: 개발
- **RENDERregio**: Play 앱이 접속할 API 서버
- **APK**: Capacitor WebView → Render URL 로드

## Play Console 절차 (APK 완성 후)

1. [Google Play Console](https://play.google.com/console) 개발자 등록 (1회 $25)
2. 앱 생성 — 패키지명: `com.regio.note` (변경 시 `mobile/capacitor.config.json` 동기화)
3. **수익 창출 → 제품** 에 인앱 상품 ID 등록  
   예: `regio_premium_monthly`, `regio_premium_yearly`
4. **API 액세스** → Google Cloud 서비스 계정 연결 → **재무 데이터 보기** 권한
5. 서비스 계정 JSON → Render 환경변수 `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
6. 내부 테스트 트랙에 APK 업로드 → 라이선스 테스트 계정으로 결제 테스트

## Render 환경변수 (인앱결제)

```
GOOGLE_PLAY_PACKAGE_NAME=com.regio.note
GOOGLE_PLAY_PRODUCT_IDS=regio_premium_monthly,regio_premium_yearly
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

설정 전에는 `/api/billing/config` → `enabled: false` (기존 기능 영향 없음)

## DB 적용

```bash
psql -U postgres -d regio -f create_play_billing_table.sql
```

## Android APK 빌드 (준비 완료 후)

```bash
cd mobile
npm install
npx cap add android          # 최초 1회 (Android Studio 필요)
# capacitor.config.json 의 server.url 을 Render URL 로 설정
npx cap sync android
npx cap open android         # Android Studio → Build → Signed APK/AAB
```

Play Store 업로드는 **AAB(Android App Bundle)** 권장.

## 인앱결제 플러그인 (APK 단계)

Capacitor용 Billing 플러그인 중 하나 선택:

- `@capacitor-community/in-app-purchases`
- 또는 Cordova `cordova-plugin-purchase` + Capacitor 호환

연동 후 `billing-bridge.js` 의 `purchase()` / `getProducts()` TODO 구현.

## Google 로그인 vs Play 결제

| 기능 | 사용 API |
|------|----------|
| Gmail 로그인 / OAuth | `GOOGLE_CLIENT_ID` (이미 구현) |
| Play 인앱결제 검증 | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (별도) |

서로 다른 설정입니다. Play 결제는 **반드시 서버에서 purchaseToken 검증** 후 권한을 부여하세요.

## 체크리스트

- [ ] Play Console 개발자 계정
- [ ] 인앱 상품 ID 등록
- [ ] 서비스 계정 + Android Publisher API
- [ ] Render에 billing 환경변수
- [ ] `play_purchases` 테이블 생성
- [ ] Capacitor Android 빌드
- [ ] Billing Plugin 연동
- [ ] 내부 테스트 결제 확인
