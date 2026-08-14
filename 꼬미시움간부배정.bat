@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 꼬미시움 간부 C1~C4 배정

echo ============================================
echo   꼬미시움 간부 배정 (소속 꾸리아 → C1~C4)
echo ============================================
echo.
echo ※ DB 연결 한계 오류가 나면 먼저
echo    DB연결초기화.bat 을 관리자 권한으로 실행한 뒤
echo    이 파일을 다시 실행하세요.
echo.

echo [1/3] Node 종료 후 고아 연결 정리...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
node "%~dp0cleanup-db-connections.js" --all-app
if errorlevel 1 (
  echo.
  echo [안내] DB 연결이 가득 찼습니다.
  echo        DB연결초기화.bat 을 마우스 우클릭 → 관리자 권한으로 실행 후
  echo        이 파일을 다시 실행하세요.
  echo.
  pause
  exit /b 1
)

echo [2/3] 꾸리아 K → 꼬미시움 C 배정...
node "%~dp0assign-comitia-officers-sample.js"
if errorlevel 1 (
  echo C 배정 실패
  pause
  exit /b 1
)

echo [3/3] 레지아 R 배정 및 C/K 보충...
node "%~dp0assign-regia-officers-sample.js"
if errorlevel 1 (
  echo R 배정 실패
  pause
  exit /b 1
)

echo.
echo 완료. 서버켜기.bat 실행 후 샘플명단출력에서
echo 성명 뒤 파란 C1~C4 배지를 확인하세요.
pause
