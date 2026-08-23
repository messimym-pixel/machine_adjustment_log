@echo off
title Machine Adjustment Log - PM2 Production Server
cd /d "%~dp0"

echo ======================================================================
echo       Machine Adjustment Log - Starting PM2 Offline Production Server
echo ======================================================================
echo.

:: Check if src/dist exists
if not exist "src\dist" (
    echo Building frontend production assets...
    cd src
    call npm.cmd run build
    cd ..
)

echo Starting application using PM2...
call npx.cmd pm2 start ecosystem.config.cjs

echo.
echo ======================================================================
echo [PM2 STATUS]
call npx.cmd pm2 status
echo ======================================================================
echo.
echo Server is running on Port 3001!
echo Access locally: http://localhost:3001
echo.
pause
