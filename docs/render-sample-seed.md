# Render DB에 모의자료 올리기

Play Store / Render 실서비스 DB에 **tt 접두 모의회원(id 3~103)** 을 올릴 때 사용합니다.  
구독(인앱결제) 테이블과는 별개이며, 성당·Pr 명칭의 `tt` 로 실회원과 구분합니다.

## 전제

1. Render PostgreSQL에 스키마 적용 (`create_tables.sql` 등)
2. GitHub `maducokr/rregio` → Render Web Service 배포
3. 로컬에서 완성된 모의 DB(또는 시드 스크립트) 준비

## 원격 시드 (주의)

기본은 로컬 DB만 허용합니다. Render에 쓸 때만:

```bash
# PowerShell 예 — DATABASE_URL 또는 DB_* 를 Render External DB로 설정
$env:ALLOW_SAMPLE_SEED="1"
$env:DATABASE_URL="postgresql://..."   # 또는 DB_HOST/DB_USER/...
node assign-sample-church-tt-prefix.js
node assign-sample-pr-curia-tt-prefix.js
# 회원·활동 생성 스크립트는 로컬에서 검증한 뒤 동일 연결로 실행
```

- `ALLOW_SAMPLE_SEED=1` 없이 원격 호스트면 `lib/local-sample-guard.js` 가 차단합니다.
- Render 서버의 `NODE_ENV=production` 이면 샘플명단 API는 기본 차단됩니다 (APK deploy 모드와 일치).
- 모의계정에 Play 구매 레코드를 넣지 마세요.

## 배포 후 확인

- 로그인: `성명+숫자4` / 모의 비번
- 성당·Pr 이 `tt` 로 시작하는지
- `/api/billing/config` → 미설정 시 `enabled: false` (과금 없음)
