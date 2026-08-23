@echo off
title Machine Adjustment Log - Network Server
cd /d "%~dp0"

echo ======================================================================
echo           Machine Adjustment Log - Starting System (SQLite + Web)
echo ======================================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found! Please install Node.js 18 or newer.
    pause
    exit /b 1
)


echo [1/2] Checking dependencies...
if not exist "server\node_modules" (
    echo Installing server dependencies...
    cd server
    call npm.cmd install
    cd ..
)

if not exist "src\node_modules" (
    echo Installing frontend dependencies...
    cd src
    call npm.cmd install
    cd ..
)

echo.
echo [2/2] Starting SQLite Backend Server (Port 3001)...
start "Backend API Server (SQLite)" cmd /k "cd /d ""%~dp0server"" && node server.js"

echo.
echo Starting Web Dashboard on LAN (Port 5173)...
cd /d "%~dp0src"
call npm.cmd run dev

pause
