@echo off
title Machine Adjustment Log - PM2 Server Status
cd /d "%~dp0"

echo ======================================================================
echo                     PM2 Server Status & Logs
echo ======================================================================
echo.
call npx.cmd pm2 status
echo.
pause
