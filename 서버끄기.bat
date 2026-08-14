@echo off
chcp 65001 >nul
title 레지오 서버 종료기

echo ============================================
echo            레지오 서버 종료
echo ============================================
echo.

echo [1/3] 서버에 정상 종료 요청 (DB 연결 풀 정리)...
powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/admin/shutdown' -TimeoutSec 5 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo      정상 종료 요청 완료. 대기 중...
    timeout /t 2 /nobreak >nul
) else (
    echo      서버가 응답하지 않아 강제 종료로 진행합니다.
)

echo [2/3] 남은 node 프로세스 종료...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo [3/3] DB 고아 연결 정리...
where node >nul 2>&1
if not errorlevel 1 (
    node "%~dp0cleanup-db-connections.js" --all-app
)

echo.
echo ============================================
echo  서버가 종료되었습니다.
echo ============================================
timeout /t 3 /nobreak >nul
