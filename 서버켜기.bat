@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 레지오 서버 시작기

echo ============================================
echo            레지오 서버 시작
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo https://nodejs.org 에서 Node.js LTS 버전을 설치한 후 다시 실행하세요.
    pause
    exit /b 1
)

if not exist "node_modules\express" (
    echo [1/5] npm 패키지 설치 중... (최초 1회 또는 업그레이드 후 필요)
    call npm install
    if errorlevel 1 (
        echo [오류] npm install 실패. 인터넷 연결을 확인하고 다시 시도하세요.
        pause
        exit /b 1
    )
    echo.
) else (
    echo [1/5] npm 패키지 확인 완료
)

echo [2/5] 이전 서버 정상 종료 시도...
powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/admin/shutdown' -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
timeout /t 1 /nobreak >nul
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [3/5] DB 고아 연결 정리...
node "%~dp0cleanup-db-connections.js" --all-app
if errorlevel 2 (
    echo.
    echo [경고] DB 연결 슬롯이 가득 찼습니다.
    echo        DB연결초기화.bat 을 관리자 권한으로 실행한 뒤 다시 시도하세요.
    pause
    exit /b 1
)

echo [4/5] 서버 시작 중... (이 창과 별도로 서버 창이 열립니다)
start "레지오 서버 (닫으면 서버 종료)" cmd /k "cd /d "%~dp0" && node server.js"

echo      서버 준비 대기 중...
set /a wait_count=0

:waitloop
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 goto serverready
set /a wait_count+=1
if %wait_count% lss 20 goto waitloop

echo.
echo [경고] 서버가 응답하지 않습니다.
echo  - "레지오 서버" 창에 표시된 오류 메시지를 확인하세요.
echo  - PostgreSQL 서비스가 실행 중인지 확인하세요.
echo  - .env 파일의 DB 설정을 확인하세요.
echo.
pause
exit /b 1

:serverready
echo [5/5] 브라우저 여는 중...
start http://localhost:3000/

echo.
echo ============================================
echo  완료! 서버가 켜졌습니다.
echo  - 주소: http://localhost:3000/
echo  - 사용을 마치면 "서버끄기.bat" 을 실행하거나
echo    열려 있는 "레지오 서버" 창을 닫으세요.
echo ============================================
timeout /t 4 /nobreak >nul
