@echo off
title Machine Adjustment Log - Restart PM2 Server
cd /d "%~dp0"

echo Restarting PM2 server...
call npx.cmd pm2 restart ecosystem.config.cjs
call npx.cmd pm2 status
pause
