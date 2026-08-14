# Regio 활동 기록 시스템

레지오 활동을 체계적으로 기록하고 관리하는 웹 애플리케이션입니다.

## 주요 기능

### 1. 사용자 관리
- 회원 등록 및 로그인
- 개인정보 수정
- 회원 탈퇴 및 삭제

### 2. 활동 기록
- **기존 활동 기록**: 하드코딩된 카테고리 기반 활동 입력
- **동적 활동 기록**: 사용자 정의 카테고리 기반 활동 입력 (새로운 기능)
- 활동 데이터 저장 및 조회

### 3. 활동 집계
- 기간별 활동 통계
- 회원별 활동 현황
- 카테고리별 활동 분석

### 4. 카테고리 관리 (새로운 기능)
- **새 카테고리 추가**: `modify.html`에서 새로운 활동 카테고리와 필드를 동적으로 추가
- **지정활동 수정**: 기존 카테고리 편집
- **동적 필드 지원**: integer, text, boolean, date, decimal 타입 지원

## 새로운 기능 상세 설명

### 동적 카테고리 추가 시스템

#### 1. 새 카테고리 추가 (`modify.html`)
- **접속 방법**: 메인 페이지 → 햄버거 메뉴 → "새 카테고리 추가"
- **입력 필드**:
  - `category_name`: 카테고리 이름 (예: 기도생활-묵주기도)
  - `field_name`: 필드 이름 (예: 횟수)
  - `field_display_name`: 화면 표시 이름 (예: 횟수(회,단,시간))
  - `field_type`: 필드 타입 (integer, text, boolean, date, decimal)
  - `is_required`: 필수 입력 여부

#### 2. 동적 활동 입력 (`activity-input-dynamic.html`)
- **접속 방법**: 메인 페이지 → 햄버거 메뉴 → "동적 활동기록"
- **특징**:
  - `activity_field_mapping` 테이블에서 카테고리와 필드를 동적으로 로드
  - 사용자가 추가한 새 카테고리도 즉시 사용 가능
  - 필드 타입에 따른 적절한 입력 폼 자동 생성
  - 필수 필드 검증

#### 3. 데이터베이스 구조
```sql
-- 활동 필드 매핑 테이블
CREATE TABLE activity_field_mapping (
    id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL,
    field_name VARCHAR(50) NOT NULL,
    field_display_name VARCHAR(50) NOT NULL,
    field_type VARCHAR(20) DEFAULT 'integer',
    is_required BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_name, field_name)
);
```

## 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정
`.env` 파일을 생성하고 다음 내용을 추가:
```
DB_PASSWORD=your_postgres_password
PORT=3000
```

### 3. 데이터베이스 설정
PostgreSQL에서 `regio` 데이터베이스를 생성하고 테이블을 생성:
```bash
# PostgreSQL 접속
psql -U postgres

# 데이터베이스 생성
CREATE DATABASE regio;

# 테이블 생성 (기본 테이블)
\i create_tables.sql

# 활동 필드 매핑 테이블 생성
\i create_activity_field_mapping_table.sql
```

### 4. 서버 실행
```bash
node server.js
```

### 5. 접속
브라우저에서 `http://localhost:3000` 접속

## API 엔드포인트

### 카테고리 관리
- `POST /api/activity-field-mapping`: 새 카테고리 필드 추가
- `GET /api/activity-field-mapping`: 카테고리 필드 목록 조회

### 활동 기록
- `POST /api/activity-records`: 활동 기록 추가 (동적 필드 지원)
- `GET /api/activity-records`: 활동 기록 조회
- `PUT /api/activity-records/:id`: 활동 기록 수정

### 사용자 관리
- `POST /api/login`: 로그인
- `GET /api/members`: 회원 목록 조회
- `PUT /api/user/:id`: 사용자 정보 수정

## 파일 구조

```
regio/
├── server.js                          # 메인 서버 파일
├── index.html                         # 메인 페이지 (로그인)
├── modify.html                        # 새 카테고리 추가 페이지
├── activity-input-dynamic.html        # 동적 활동 입력 페이지
├── activity-input-test.html           # 기존 활동 입력 페이지
├── activity-report.html               # 활동 집계 페이지
├── create_tables.sql                  # 기본 테이블 생성 스크립트
├── create_activity_field_mapping_table.sql  # 활동 필드 매핑 테이블 생성
└── README.md                          # 프로젝트 문서
```

## 사용 방법

### 1. 새 카테고리 추가
1. 메인 페이지에서 로그인
2. 햄버거 메뉴 → "새 카테고리 추가" 클릭
3. 카테고리 정보 입력:
   - 카테고리 이름: `기도생활-묵주기도`
   - 필드 이름: `횟수`
   - 화면 표시 이름: `횟수(회,단,시간)`
   - 필드 타입: `integer`
   - 필수 입력: 체크
4. "카테고리 추가" 버튼 클릭

### 2. 동적 활동 입력
1. 메인 페이지에서 로그인
2. 햄버거 메뉴 → "동적 활동기록" 클릭
3. 회원 선택
4. 새로 추가한 카테고리가 자동으로 표시됨
5. 각 카테고리의 필드에 데이터 입력
6. "저장" 버튼 클릭

## 기술 스택

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Deployment**: Render.com

## 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.
## 배포 폴더

- **LOCALHOST (개발)**: `d:\\public\\regio` (현재 폴더)
- **HOST 배포**: `d:\\public\\HOSTregio`
- **Render 배포**: `d:\\public\\RENDERregio`

동기화: `node sync-deploy-folders.js` (HOST/RENDER 전체) · `node sync-frontend-to-deploy.js` (프론트만, server 설정 제외)

### 백업 (로컬 + E:)

- 수동: `백업저장.bat` 또는 `node backup-to-regioback.js`
- 자동: Cursor 파일 수정 시·작업 종료 시 훅 (`regioback`)
- 저장 위치:
  1. `d:\public\regio\regioback` (소스 + `db\regio-latest.dump`)
  2. `E:\regioback` (동일 미러, 기본값)
- 경로 변경/해제: `.env` 의 `REGIOBACK_EXTRA` (예: `off` 또는 `E:\regioback,D:\backup\regio`)

### 모의(로컬) vs Deploy

| | 로컬 모의 (`regio`) | Deploy (`piregio` / HOST / Render / 앱) |
|--|--|--|
| 모드 | `app-mode.js` → hostname localhost | `deploy-mode.js` → `REGIO_APP_MODE=deploy` |
| 샘플·TEST 메뉴 | 표시 + 상단 배너 | 숨김 |
| 시드 스크립트 (`assign-*`, `generate-*` 등) | `DB_HOST=localhost` 일 때만 | `lib/local-sample-guard` 로 차단 |
| 샘플 API | 로컬 요청만 | `NODE_ENV=production` 이면 403 |

강제 예외: `ALLOW_SAMPLE_SEED=1`, `ALLOW_SAMPLE_TOOLS=1` (임시용). 모드 확인: `GET /api/runtime-mode`
