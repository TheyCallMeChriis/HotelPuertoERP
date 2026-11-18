@echo off
setlocal
cd /d "%~dp0"
set "PG_BIN=%LOCALAPPDATA%\Programs\pgsql\bin"
set "PG_DATA=%LOCALAPPDATA%\Programs\pgsql\data"
set "SILENCIOSO="
set "SINBASE="
for %%A in (%*) do (
  if /i "%%A"=="/silencioso" set "SILENCIOSO=1"
  if /i "%%A"=="/sinbase" set "SINBASE=1"
)

if not defined SILENCIOSO (
  echo.
  echo  ==========================================
  echo   Hotel Puerto Limon - POS-ERP : DETENER
  echo  ==========================================
  echo.
)

rem 1. Close the windows opened by iniciar.bat
taskkill /F /T /FI "WINDOWTITLE eq POS-ERP Backend*" >nul 2>&1
taskkill /F /T /FI "WINDOWTITLE eq POS-ERP Frontend*" >nul 2>&1

rem 2. Stop any process still listening on ports 3000 (web) and 4000 (API)
for /f "tokens=2,5" %%a in ('netstat -ano -p tcp ^| findstr LISTENING') do (
  for %%P in (3000 4000) do (
    echo %%a| findstr /E /C:":%%P" >nul && taskkill /F /T /PID %%b >nul 2>&1
  )
)
if not defined SILENCIOSO echo  Backend y frontend detenidos.

rem 3. Stop PostgreSQL cleanly (iniciar.bat does not stop it)
if not defined SINBASE (
  "%PG_BIN%\pg_ctl.exe" status -D "%PG_DATA%" >nul 2>&1
  if not errorlevel 1 (
    "%PG_BIN%\pg_ctl.exe" stop -D "%PG_DATA%" -m fast -w >nul
    echo  PostgreSQL detenido.
  ) else (
    echo  PostgreSQL ya estaba detenido.
  )
  echo.
  timeout /t 3 >nul
)
exit /b 0
