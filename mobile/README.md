# Regio Mobile (Google Play / Android WebView)

Capacitor WebView로 Regio 웹앱을 Android APK·AAB로 패키징합니다.  
**Play Store 출시 전** 각종 폰에서 WebView 테스트를 마친 뒤 올리는 흐름을 전제로 합니다.

상세 점검표: [`docs/android-webview-prelaunch-checklist.md`](../docs/android-webview-prelaunch-checklist.md)

## 사전 요구

- Node.js 18+
- [Android Studio](https://developer.android.com/studio)
- JDK 17
- 테스트/운영용 **HTTPS** 서버 (권장: RENDERregio)

## 설정

1. `capacitor.config.json` 의 `server.url` 을 배포(또는 테스트) URL로 변경  
   - 예: `https://your-app.onrender.com`
2. `appId` (`com.regio.note`) 는 Play Console 패키지명과 동일 유지
3. **실기기 LAN 임시 테스트** (같은 Wi‑Fi의 PC Node 서버):
   ```json
   "server": {
     "url": "http://192.168.0.10:3000",
     "cleartext": true,
     "androidScheme": "http"
   }
   ```
   테스트 후 반드시 HTTPS + `"cleartext": false` 로 복구

## 빌드

```bash
cd mobile
npm install
npx cap add android    # 최초 1회 (android/ 생성)
npx cap sync android
npx cap open android
```

Android Studio → 실기기 실행으로 **기종별 테스트** →  
출시 시 **Build → Generate Signed Bundle / APK → AAB**

## WebView UX 보강

- 공통 CSS: 루트 `mobile.css` (safe-area, 터치, 유동 폭)
- 물리 뒤로가기: 루트 `webview-android.js` (모달 우선 닫기)
- User-Agent: `RegioNoteApp/1.0 AndroidWebView` (디버그·로그 구분)
- Chrome 원격 디버그: 설정상 `webContentsDebuggingEnabled` (출시 전 false 권장)

`package.json` 에 `@capacitor/app`, `@capacitor/status-bar` 가 포함되어 있습니다.

```bash
cd mobile
npm install
npx cap sync android
```

## 인앱결제

Play Console 상품 등록 후 Billing 플러그인 연동.  
구매 검증: `billing-bridge.js` → `/api/billing/verify`  
절차: `docs/google-play-inapp-setup.md`

## 모드 주의

Capacitor 네이티브에서는 `app-mode.js` 가 **deploy** 로 동작합니다.  
샘플명단·TEST 메뉴는 APK에서는 숨겨집니다. 모의 데이터 검증은 로컬 브라우저/LAN cleartext 테스트에서 하세요.
