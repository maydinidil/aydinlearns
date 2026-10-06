@echo off
rem Double-click to study. Sets up anything missing, starts aydinlearns and opens it in your browser.
rem Close this window, or press Ctrl+C, to stop: the app ends the session and makes the backup first.
setlocal
cd /d "%~dp0"
title aydinlearns
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the Node.js 24 LTS from https://nodejs.org, then double-click this file again.
  pause
  exit /b 1
)
node tools\launch.ts %*
if errorlevel 1 pause
