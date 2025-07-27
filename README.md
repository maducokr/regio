# Regio 로그인 시스템

Regio Note 애플리케이션의 로그인 시스템입니다.

## 배포 정보

이 애플리케이션은 **Render**에서 호스팅됩니다.

### Render 배포 설정

1. **서비스 타입**: Web Service
2. **런타임**: Node.js
3. **빌드 명령어**: `npm install`
4. **시작 명령어**: `npm start`
5. **포트**: 10000 (환경 변수로 설정)

### 환경 변수

Render 대시보드에서 다음 환경 변수를 설정하세요:

- `NODE_ENV`: `production`
- `PORT`: `10000`
- `DATABASE_URL`: Neon 데이터베이스 연결 문자열 (선택사항)

### 데이터베이스

- **개발/테스트**: 더미 데이터 사용
- **프로덕션**: Neon PostgreSQL 데이터베이스 사용

### 로컬 개발

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

### API 엔드포인트

- `POST /api/login`: 사용자 로그인
- `POST /api/register`: 사용자 등록
- `GET /`: 메인 페이지 (로그인 화면)

### 기술 스택

- **백엔드**: Node.js, Express.js
- **데이터베이스**: Neon PostgreSQL
- **인증**: bcryptjs
- **배포**: Render 