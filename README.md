# Regio 로그인 시스템

Neon PostgreSQL 데이터베이스와 Netlify를 사용한 Regio 로그인 시스템입니다.

## 🚀 주요 기능

- 사용자 로그인 (성명 + 폰번호끝4자+주민번호앞6자)
- 사용자 등록 (모달 폼)
- Neon PostgreSQL 데이터베이스 연동
- Netlify 서버리스 함수
- 반응형 모바일 디자인

## 📋 프로젝트 구조

```
regio/
├── index.html              # 메인 로그인 페이지
├── netlify.toml            # Netlify 설정
├── package.json            # 프로젝트 의존성
├── database/
│   └── schema.sql          # 데이터베이스 스키마
├── netlify/
│   └── functions/
│       ├── login.js        # 로그인 API
│       └── register.js     # 등록 API
└── README.md               # 프로젝트 문서
```

## 🛠️ 설치 및 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. Neon 데이터베이스 설정

1. [Neon Console](https://console.neon.tech)에서 새 프로젝트 생성
2. 데이터베이스 이름을 `regio`로 설정
3. 비밀번호를 `5854`로 설정
4. `database/schema.sql` 파일의 내용을 Neon SQL Editor에서 실행

### 3. 환경 변수 설정

Netlify 대시보드에서 다음 환경 변수를 설정:

```
DATABASE_URL=postgresql://username:5854@hostname/regio?sslmode=require
```

### 4. 로컬 개발

```bash
npm run dev
```

### 5. 배포

```bash
npm run deploy
```

## 🗄️ 데이터베이스 스키마

### member 테이블

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| id | SERIAL | 기본키 |
| name | VARCHAR(100) | 성명 (고유값) |
| phone_last4 | VARCHAR(4) | 전화번호 끝 4자리 |
| resident_id_front6 | VARCHAR(6) | 주민번호 앞 6자리 |
| phone_full | VARCHAR(20) | 전체 전화번호 (선택) |
| resident_id_full | VARCHAR(14) | 전체 주민번호 (선택) |
| password_hash | VARCHAR(255) | 비밀번호 해시 |
| created_at | TIMESTAMP | 생성일시 |
| updated_at | TIMESTAMP | 수정일시 |

## 🔐 보안

- 비밀번호는 bcrypt로 해시화되어 저장
- 입력값 검증 및 SQL 인젝션 방지
- CORS 설정으로 보안 강화

## 📱 API 엔드포인트

### 로그인
- **POST** `/api/login`
- **Body**: `{ "name": "성명", "password": "폰번호끝4자+주민번호앞6자" }`

### 등록
- **POST** `/api/register`
- **Body**: `{ "name": "성명", "phone_last4": "1234", "resident_id_front6": "123456" }`

## 🎨 사용자 인터페이스

- 모바일 친화적 반응형 디자인
- 직관적인 로그인 폼
- 모달 기반 등록 폼
- 실시간 입력 검증

## 🔧 개발 도구

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Netlify Functions (Node.js)
- **Database**: Neon PostgreSQL
- **Deployment**: Netlify

## 📝 라이선스

MIT License

## 🤝 기여

이슈나 풀 리퀘스트를 통해 기여해주세요. 