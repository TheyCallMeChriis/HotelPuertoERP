@echo off
title Sistema POS-ERP - Hotel Puerto Limon
echo ======================================================
echo    INICIANDO SISTEMA POS-ERP HOTEL PUERTO LIMON
echo ======================================================

REM 1. Iniciar PostgreSQL si está detenido
"C:\Users\chris\AppData\Local\Programs\pgsql\bin\pg_ctl.exe" -D "C:\Users\chris\AppData\Local\Programs\pgsql\data" status >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [*] Iniciando servidor PostgreSQL local...
    "C:\Users\chris\AppData\Local\Programs\pgsql\bin\pg_ctl.exe" -D "C:\Users\chris\AppData\Local\Programs\pgsql\data" -l "C:\Users\chris\AppData\Local\Programs\pgsql\logfile.txt" start
) else (
    echo [*] PostgreSQL ya se encuentra en ejecucion.
)

REM 2. Iniciar Backend
echo [*] Iniciando Backend API (Puerto 4000)...
start "Backend POS-ERP" cmd /k "cd /d %~dp0backend && npm run dev"

REM 3. Iniciar Frontend
echo [*] Iniciando Frontend React (Puerto 3000)...
start "Frontend POS-ERP" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ======================================================
echo    SISTEMA LISTO Y EN EJECUCION
echo    Abra en su navegador: http://localhost:3000
echo ======================================================
pause
