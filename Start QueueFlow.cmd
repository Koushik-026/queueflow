@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 or later, then open this file again.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<24){console.error('QueueFlow needs Node.js 24 or later.');process.exit(1)}"
if errorlevel 1 goto failed
if not exist node_modules\express\package.json (
  call npm ci
  if errorlevel 1 goto failed
)
call npm run build
if errorlevel 1 goto failed
echo.
echo Open http://127.0.0.1:3100 after the ready message appears.
echo Choose Try the live demo to begin without an account.
echo Keep this window open while using QueueFlow. Ctrl+C stops the server.
echo.
call npm start
goto end
:failed
echo.
echo QueueFlow could not start. Read the error above, then try again.
:end
pause
