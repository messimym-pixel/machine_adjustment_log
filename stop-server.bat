@echo off
title Machine Adjustment Log - Stop All Servers
cd /d "%~dp0"

echo ======================================================================
echo         Machine Adjustment Log - Stopping All Servers
echo ======================================================================
echo.

:: ── Stop Port 3001 (Backend / Node server) ────────────────────────────
echo [1/2] Stopping Backend Server (Port 3001)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    echo   Found PID %%a on port 3001 - Killing...
    taskkill /PID %%a /F >nul 2>&1
)

:: ── Stop Port 5173 (Vite default) ─────────────────────────────────────
echo [2/2] Stopping Vite Dev Server (Port 5173)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    echo   Found PID %%a on port 5173 - Killing...
    taskkill /PID %%a /F >nul 2>&1
)

:: ── Stop Port 5174 (Vite fallback if 5173 was busy) ───────────────────
echo        Stopping Vite Dev Server (Port 5174 fallback)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174 " ^| findstr "LISTENING"') do (
    echo   Found PID %%a on port 5174 - Killing...
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo ======================================================================
echo [RESULT] Checking remaining ports...
echo ======================================================================

netstat -ano | findstr ":3001 :5173 :5174" | findstr "LISTENING"
if %ERRORLEVEL% neq 0 (
    echo   All servers stopped successfully!
) else (
    echo   WARNING: Some ports are still in use (see above)
)

echo.
pause
