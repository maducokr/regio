# Render DB에 모의자료 올리기

Play Store / Render 실서비스 DB에 **tt 접두 모의회원(id 3~103)** 을 올릴 때 사용합니다.  
구독(인앱결제) 테이블과는 별개이며, 성당·Pr 명칭의 `tt` 로 실회원과 구분합니다.

## 빠른 업로드 (권장)

1. Render Dashboard → **PostgreSQL** → Connect → **External Database URL** 복사  
2. 프로젝트 루트에 `.env.render` 파일 생성 (git 제외됨):

```
RENDER_DATABASE_URL=postgresql://USER:PASSWORD@dpg-xxxxx-a.REGION-postgres.render.com/DBNAME
```

3. 실행:

```bash
node upload-sample-via-pg.js
```

또는 (최신 server 배포 후 HTTP 방식):

```bash
# Render Web Service Manual Deploy 로 최신 main 반영 후
node upload-sample-to-render.js
```

## 전제

1. Render PostgreSQL에 스키마 적용 (서버 기동 시 자동)
2. 로컬에 모의회원(id 3~103, tt 성당/Pr) 준비

## 배포 후 확인

- `https://regio.onrender.com/api/members` 가 빈 배열이 아닌지
- 로그인: `성명+숫자4` / 모의 비번
- 성당·Pr 이 `tt` 로 시작하는지
