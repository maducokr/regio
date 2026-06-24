# PostgreSQL 연결 문제 해결 가이드

## 문제 상황
- 에러 코드: 53300 (too many connections)
- 패스워드 입력창이 반복해서 나타남
- 데이터베이스 연결 실패

## 해결 방법

### 1. PostgreSQL 서비스 재시작 (관리자 권한 필요)
```cmd
# 관리자 권한으로 PowerShell 실행 후
net stop postgresql-x64-17
net start postgresql-x64-17
```

### 2. PostgreSQL 설정 파일 수정
PostgreSQL 설치 경로에서 `postgresql.conf` 파일을 찾아서 수정:

```
# 기본 경로 (PostgreSQL 17)
C:\Program Files\PostgreSQL\17\data\postgresql.conf

# 다음 설정들을 찾아서 수정:
max_connections = 100          # 기본값: 100
shared_buffers = 256MB         # 기본값: 128MB
effective_cache_size = 1GB     # 기본값: 4GB
```

### 3. pg_hba.conf 파일 확인
```
# 기본 경로
C:\Program Files\PostgreSQL\17\data\pg_hba.conf

# 다음 라인이 있는지 확인:
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
```

### 4. 현재 연결 상태 확인
```sql
-- PostgreSQL에 연결 후 실행
SELECT count(*) FROM pg_stat_activity;
SELECT * FROM pg_stat_activity WHERE state = 'active';
```

### 5. 연결 강제 종료
```sql
-- 특정 연결 종료
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid();

-- 또는 모든 연결 종료 (주의!)
SELECT pg_terminate_backend(pid) FROM pg_stat_activity;
```

### 6. 애플리케이션 설정 최적화
현재 수정된 설정:
- 최대 연결 수: 2개로 제한
- 연결 타임아웃: 3초
- 유휴 타임아웃: 10초
- keepAlive 비활성화

### 7. 임시 해결책
1. 컴퓨터 재시작
2. PostgreSQL 서비스 재시작
3. 애플리케이션 재시작

### 8. 근본적 해결책
1. PostgreSQL 설정 최적화
2. 연결 풀 크기 조정
3. 애플리케이션 코드 개선
4. 모니터링 도구 설치

## 테스트 명령어
```bash
# 연결 테스트
node test-connection-simple.js

# 서버 시작
npm start
```

## 추가 도구
- pgAdmin: PostgreSQL 관리 도구
- psql: 명령줄 도구
- pg_stat_statements: 쿼리 성능 모니터링
