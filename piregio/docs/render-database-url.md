# Render DATABASE_URL 연결 (ECONNREFUSED / ENOTFOUND 해결)

## 증상

- AVD/앱에서 로그인 시 G1~G4 직급 목록만 보임 (이건 **DB가 아니라 화면 고정 목록**)
- `/api/health` → `"ok": false`, `"error": "ENOTFOUND"` 또는 ECONNREFUSED
- 로그인·회원가입·이름 검색 전부 실패

## ENOTFOUND (`host: dpg-xxxxx-a`)

Internal 호스트명만으로는 DNS를 못 찾는 경우가 있습니다.  
**External Database URL**(호스트에 `....region-postgres.render.com` 포함)을 Web Service `DATABASE_URL`에 넣으세요.

1. [Render Dashboard](https://dashboard.render.com) → **PostgreSQL**
2. **Connect** → **External** 탭 → **External Database URL** 전체 복사  
   - 예: `postgresql://USER:PASSWORD@dpg-xxxxx-a.oregon-postgres.render.com/DBNAME`
3. **Web Service** (`regio.onrender.com`) → **Environment**
4. `DATABASE_URL` 값을 위 URL로 **교체** 후 Save
5. **Manual Deploy** (또는 서비스 Restart)

확인: `https://regio.onrender.com/api/health` 가 `"ok": true` 이어야 합니다.

## ECONNREFUSED / localhost

로그에 `mode: 'DB_HOST', host: 'localhost'` 가 보이면 **Web Service 프로세스에 DATABASE_URL이 없습니다.**  
Postgres 화면에서 URL만 확인한 것과, Web 앱 Environment에 넣은 것은 다릅니다.

## 올바른 순서 (신규 연결)

1. [Render Dashboard](https://dashboard.render.com) → **PostgreSQL** 선택  
2. 오른쪽 위 **Connect** → 가능하면 **External Database URL** 전체 복사  
3. 같은 계정의 **Web Service** (`regio.onrender.com` 을 제공하는 그 서비스) 선택  
4. 왼쪽 **Environment**  
5. **Add Environment Variable**
   - Key: `DATABASE_URL` (철자 정확히, 앞뒤 공백 없음)
   - Value: 복사한 `postgresql://...` 전체
6. **Save Changes**
7. **Manual Deploy** → **Deploy latest commit** (또는 Clear build cache + deploy)

## 자주 하는 실수

| 실수 | 결과 |
|------|------|
| Postgres 페이지에만 URL 두고 Web Environment에 안 넣음 | localhost 폴백 → ECONNREFUSED |
| Internal 짧은 호스트만 쓰고 DNS 실패 | ENOTFOUND |
| Key 이름을 `Internal Database URL` 등으로 넣음 | 코드가 읽지 못함 |
| `DB_HOST=localhost` 가 남아 있음 | 혼동 (URL이 있으면 URL 우선) |
| Web와 DB **region** 이 다름 | Internal URL 연결 실패 가능 → External URL 또는 같은 region |
| Blueprint `sync: false` 만 있고 값을 비워 둠 | 변수 키만 있고 값 없음 |

## 정상 로그 / health 예시

```
🗄️ DB 연결 대상: {
  mode: 'DATABASE_URL',
  host: 'dpg-xxxxx-a.oregon-postgres.render.com',
  ...
}
✅ 데이터베이스 연결 테스트 성공
```

```json
{ "ok": true, "database": { "configured": true, "mode": "DATABASE_URL" } }
```

`DATABASE_URL` 이 없으면 서버가 즉시 `process.exit(1)` 로 배포 실패합니다 (가짜 live 방지).
