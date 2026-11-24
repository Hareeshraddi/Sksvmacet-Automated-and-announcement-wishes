@echo off
setlocal
title SKSVMACET Wishing SMS - Launcher
cd /d "%~dp0"

echo ==================================================
echo   SKSVMACET WISHING SMS PROJECT
echo ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed.
  echo Download it from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "server\.env" (
  if exist "server\.env.example" (
    echo [SETUP] Creating server\.env from .env.example
    copy /y "server\.env.example" "server\.env" >nul
  )
)

if not exist "server\node_modules" (
  echo [SETUP] Installing backend dependencies, please wait...
  pushd "server"
  call npm install
  popd
)

if not exist "client\node_modules" (
  echo [SETUP] Installing frontend dependencies, please wait...
  pushd "client"
  call npm install
  popd
)

echo.
echo [1/3] Starting backend  ... http://localhost:4000
start "SKSVMACET Backend (4000)" /D "%~dp0server" cmd /k "npm start"

echo [2/3] Starting frontend ... http://localhost:5173
start "SKSVMACET Frontend (5173)" /D "%~dp0client" cmd /k "npm run dev"

echo [3/3] Opening the app in your browser...
ping -n 7 127.0.0.1 >nul
start "" "http://localhost:5173"

echo.
echo Both servers are running in their own windows.
echo Close those two windows to stop the app.
echo.
echo Login: admin@college.local  /  ChangeMe123!
echo.
pause
endlocal
