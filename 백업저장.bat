@echo off

chcp 65001 >nul

cd /d "%~dp0"

echo [regioback] 소스 + DB 백업 중...

echo   1차: %~dp0regioback

echo   2차: E:\regioback  (REGIOBACK_EXTRA 로 변경 가능)

node backup-to-regioback.js

if errorlevel 1 (

  echo [regioback] 백업 실패 ^(DB 연결/pg_dump 확인^)

  exit /b 1

)

echo [regioback] 완료:

echo   소스: %~dp0regioback

echo   소스: E:\regioback

echo   DB  : %~dp0regioback\db\regio-latest.dump

echo   DB  : E:\regioback\db\regio-latest.dump

exit /b 0


