@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Instale Node.js 22.13 ou superior em https://nodejs.org e abra este arquivo novamente.
 pause
 exit /b 1
)
call npm run iniciar
pause
