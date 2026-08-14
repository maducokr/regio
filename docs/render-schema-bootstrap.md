# Render DB 스키마 (member does not exist)

DB 연결 성공 후 `relation "member" does not exist` 가 나오면  
연결된 DB(`aifield` 등)에 Regio 테이블이 아직 없는 상태입니다.

## 자동 해결 (권장)

서버 기동 시 `lib/ensure-core-schema.js` 가  
`member`, `activity_categories`, `activity_records` 등을 `CREATE TABLE IF NOT EXISTS` 로 만듭니다.

재배포 후 로그에 다음이 보이면 정상입니다.

```
✅ 핵심 스키마(member 등) 준비 완료
✅ Gmail/Google 인증 스키마 준비 완료
```

## 모의자료

스키마만 생기면 빈 DB입니다. 모의회원(tt 접두)은  
`docs/render-sample-seed.md` 절차로 별도 시드하세요.
