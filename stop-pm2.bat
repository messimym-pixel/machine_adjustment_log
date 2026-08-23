@echo off
title Machine Adjustment Log - Stop PM2 Server
cd /d "%~dp0"

echo Stopping PM2 server...
call npx.cmd pm2 stop ecosystem.config.cjs
call npx.cmd pm2 status
pause
