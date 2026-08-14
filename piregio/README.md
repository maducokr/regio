# PiRegio — 프론트엔드 (Pi Network)

Pi Network 백엔드와 연동하는 **프론트엔드 전용** 패키지입니다.

> 상위 `regio/` 폴더의 기존 Node.js + PostgreSQL 백엔드 구조는 **변경하지 않고 그대로** 유지됩니다.

## 폴더 구성

```
piregio/
├── api-config.js          # Pi 백엔드 API URL 설정
├── mobile.css             # 모바일 공통 스타일
├── index.html             # 로그인/메인
├── activity-input-test.html
├── activity-assignment.html
├── activity-report.html
├── withdraw.html
├── delete-member.html
├── modify.html
├── newcategory.html
├── activity-category-editor.html
├── auth-ui.js
├── admin-menu.js
├── profile-modal.js
├── sensitive-action-auth.js
└── regio/
    ├── index.html
    ├── actinput1.html
    └── actinput2.html
```

## Pi 백엔드 연결

1. `index.html` 등 각 페이지 `<head>`에 `api-config.js`가 로드됩니다.
2. Pi 백엔드 URL을 설정합니다:

```html
<script>
  window.PIREGIO_API_BASE = 'https://your-pi-backend.example.com';
</script>
<script src="api-config.js"></script>
```

3. `PIREGIO_API_BASE`가 비어 있으면 `/api/...` 요청은 **현재 호스트**로 전송됩니다 (동일 출처 프록시 사용 시).

## 로컬 미리보기

정적 파일만 확인할 때:

```bash
npx serve piregio
```

API 호출은 Pi 백엔드 또는 기존 `regio` 서버가 실행 중이어야 합니다.

## 기존 regio 프로젝트와의 관계

| 항목 | `regio/` (원본) | `piregio/` (본 폴더) |
|------|-----------------|----------------------|
| server.js | ✅ 유지 | ❌ 없음 |
| lib/, SQL, 마이그레이션 스크립트 | ✅ 유지 | ❌ 없음 |
| HTML / CSS / 클라이언트 JS | ✅ 유지 | ✅ 복사본 |

원본 수정 시 `piregio/`에 필요한 파일만 다시 복사하면 됩니다.
