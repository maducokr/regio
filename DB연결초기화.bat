@echo off
chcp 65001 >nul
cd /d "%~dp0"
title DB 연결 초기화

echo ============================================
echo   PostgreSQL 연결 한계 오류 복구
echo ============================================
echo.

echo [1/4] Node 서버 종료 중...
powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/admin/shutdown' -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
timeout /t 1 /nobreak >nul
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/4] 고아 DB 연결 정리 시도...
where node >nul 2>&1
if not errorlevel 1 (
    node "%~dp0cleanup-db-connections.js" --all-app
    if not errorlevel 1 (
        echo      고아 연결 정리만으로 복구되었습니다. PostgreSQL 재시작은 생략합니다.
        goto start_server
    )
)

echo [3/4] PostgreSQL 서비스 재시작 중...
net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo [안내] 관리자 권한이 없어 PostgreSQL 자동 재시작을 건너뜁니다.
    echo        이 파일을 마우스 우클릭 ^> 관리자 권한으로 실행 해주세요.
    echo.
    goto done
)

set "PG_SERVICE="
for %%S in (
    postgresql-x64-17
    postgresql-x64-16
    postgresql-x64-15
    postgresql-x64-14
    postgresql-x64-13
    postgresql-x64-12
) do (
    if not defined PG_SERVICE (
        sc query "%%S" >nul 2>&1
        if not errorlevel 1 set "PG_SERVICE=%%S"
    )
)

if not defined PG_SERVICE (
    echo.
    echo [오류] PostgreSQL 서비스를 찾지 못했습니다.
    echo        services.msc 에서 postgresql 서비스 이름을 확인하세요.
    echo.
    goto done
)

echo      대상 서비스: %PG_SERVICE%
net stop "%PG_SERVICE%"
timeout /t 3 /nobreak >nul
net start "%PG_SERVICE%"
if errorlevel 1 (
    echo.
    echo [오류] PostgreSQL 서비스 시작 실패: %PG_SERVICE%
    echo.
    goto done
)
timeout /t 3 /nobreak >nul
echo      PostgreSQL 재시작 완료.

:start_server
echo [4/4] 서버 다시 시작...
call "%~dp0서버켜기.bat"
goto :eof

:done
echo.
echo PostgreSQL을 직접 재시작한 뒤 서버켜기.bat 을 실행하세요.
pause
exit /b 1
