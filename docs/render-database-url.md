# Render DATABASE_URL 연결 (ECONNREFUSED 해결)

로그에 `mode: 'DB_HOST', host: 'localhost'` 가 보이면 **Web Service 프로세스에 DATABASE_URL이 없습니다.**  
Postgres 화면에서 URL만 확인한 것과, Web 앱 Environment에 넣은 것은 다릅니다.

## 올바른 순서

1. [Render Dashboard](https://dashboard.render.com) → **PostgreSQL** 선택  
2. 오른쪽 위 **Connect** → **Internal** 탭 → **Internal Database URL** 전체 복사  
   - 형식: `postgresql://USER:PASSWORD@dpg-xxxxx-a/DBNAME` (호스트에 `-a` 등)
3. 같은 계정의 **Web Service** (`regio.onrender.com` 을 제공하는 그 서비스) 선택  
4. 왼쪽 **Environment**  
5. **Add Environment Variable**
   - Key: `DATABASE_URL` (철자 정확히, 앞뒤 공백 없음)
   - Value: 방금 복사한 URL 전체
6. **Save Changes**
7. **Manual Deploy** → **Deploy latest commit** (또는 Clear build cache + deploy)

## 자주 하는 실수

| 실수 | 결과 |
|------|------|
| Postgres 페이지에만 URL 두고 Web Environment에 안 넣음 | localhost 폴백 → ECONNREFUSED |
| Key 이름을 `Internal Database URL` 등으로 넣음 | 코드가 읽지 못함 |
| `DB_HOST=localhost` 가 남아 있음 | 혼동 (URL이 있으면 URL 우선) |
| Web와 DB **region** 이 다름 | Internal URL 연결 실패 가능 → 같은 region 사용 |
| Blueprint `sync: false` 만 있고 값을 비워 둠 | 변수 키만 있고 값 없음 |

## 정상 로그 예시

```
🗄️ DB 연결 대상: {
  mode: 'DATABASE_URL',
  host: 'dpg-xxxxx-a',
  ...
}
✅ 데이터베이스 연결 테스트 성공
```

`DATABASE_URL` 이 없으면 서버가 즉시 `process.exit(1)` 로 배포 실패합니다 (가짜 live 방지).
