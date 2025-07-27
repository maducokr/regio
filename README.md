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
- `DB_NAME`: `regio`
- `DB_PASSWORD`: `5854`
- `DB_HOST`: PostgreSQL 호스트 주소
- `DB_USER`: PostgreSQL 사용자명 (기본값: postgres)
- `DB_PORT`: PostgreSQL 포트 (기본값: 5432)

### 데이터베이스

- **데이터베이스명**: `regio`
- **비밀번호**: `5854`
- **테이블**:
  - `member`: 회원 정보
  - `inputact`: 활동 입력 데이터

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
- `POST /api/inputact`: 활동 입력
- `GET /api/inputact/:member_id`: 활동 조회
- `GET /`: 메인 페이지 (로그인 화면)

### 데이터베이스 스키마

#### member 테이블
- `id`: 기본키 (SERIAL)
- `name`: 성명 (VARCHAR(100), UNIQUE)
- `phone_last4`: 전화번호 끝 4자리 (VARCHAR(4))
- `resident_id_front6`: 주민번호 앞 6자리 (VARCHAR(6))
- `phone_full`: 전체 전화번호 (VARCHAR(20))
- `resident_id_full`: 전체 주민번호 (VARCHAR(14))
- `password_hash`: 비밀번호 해시 (VARCHAR(255))
- `created_at`: 생성일시 (TIMESTAMP)
- `updated_at`: 수정일시 (TIMESTAMP)

#### inputact 테이블
- `id`: 기본키 (SERIAL)
- `member_id`: 회원 ID (INTEGER, 외래키)
- `activity_date`: 활동 날짜 (DATE)
- `activity_type`: 활동 유형 (VARCHAR(50))
- `activity_description`: 활동 설명 (TEXT)
- `hours_spent`: 소요 시간 (DECIMAL(4,2))
- `location`: 장소 (VARCHAR(200))
- `notes`: 메모 (TEXT)
- `created_at`: 생성일시 (TIMESTAMP)
- `updated_at`: 수정일시 (TIMESTAMP)

### 기술 스택

- **백엔드**: Node.js, Express.js
- **데이터베이스**: PostgreSQL
- **인증**: bcryptjs
- **배포**: Render 