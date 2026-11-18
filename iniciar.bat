@echo off
setlocal
title POS-ERP - Iniciar
cd /d "%~dp0"

rem === PostgreSQL paths (change only if it is installed in another folder) ===
set "PG_BIN=%LOCALAPPDATA%\Programs\pgsql\bin"
set "PG_DATA=%LOCALAPPDATA%\Programs\pgsql\data"

echo.
echo  ==========================================
echo   Hotel Puerto Limon - POS-ERP : INICIAR
echo  ==========================================
echo.

rem 1. Stop any previous instance to start clean
call "%~dp0detener.bat" /sinbase /silencioso

rem 2. Database
"%PG_BIN%\pg_ctl.exe" status -D "%PG_DATA%" >nul 2>&1
if errorlevel 3 (
  echo [1/4] Iniciando PostgreSQL...
  "%PG_BIN%\pg_ctl.exe" start -D "%PG_DATA%" -l "%PG_DATA%\..\postgres.log" -w >nul
  if errorlevel 1 (
    echo  ERROR: no se pudo iniciar PostgreSQL. Revise %PG_DATA%\..\postgres.log
    pause
    exit /b 1
  )
) else (
  echo [1/4] PostgreSQL ya estaba en ejecucion.
)

rem 2b. Install missing frontend dependencies (PDF/Excel reports)
if not exist "%~dp0frontend\node_modules\jspdf\package.json" goto instalar
if not exist "%~dp0frontend\node_modules\write-excel-file\package.json" goto instalar
goto base
:instalar
echo       Instalando dependencias nuevas del frontend (solo la primera vez)...
call npm --prefix frontend install --no-audit --no-fund
if errorlevel 1 (
  echo  ERROR: no se pudieron instalar las dependencias del frontend.
  pause
  exit /b 1
)
:base

rem 3. Prepare the database: Prisma client, pending migrations and permissions (never deletes data)
echo [2/4] Aplicando actualizaciones de la base de datos...
call npm --prefix backend run prisma:generate >nul 2>&1
call npm --prefix backend run prisma:deploy
if errorlevel 1 (
  echo  ERROR: no se pudieron aplicar las migraciones. Revise el mensaje anterior.
  pause
  exit /b 1
)
call npm --prefix backend run permissions:sync >nul 2>&1

rem 4. Backend and frontend in visible windows (closing a window stops it)
echo [3/4] Iniciando backend y frontend...
start "POS-ERP Backend" /D "%~dp0." cmd /k npm run dev:backend
start "POS-ERP Frontend" /D "%~dp0." cmd /k npm run dev:frontend

rem 5. Wait until both respond (up to 3 minutes)
echo [4/4] Esperando a que el sistema responda...
set /a intentos=0
:esperar
set /a intentos+=1
if %intentos% gtr 90 (
  echo  ERROR: el sistema no respondio. Revise las ventanas "POS-ERP Backend" y "POS-ERP Frontend".
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
curl -s -o nul http://127.0.0.1:4000/api/health || goto esperar
curl -s -o nul http://127.0.0.1:3000/ || goto esperar

echo.
echo  Sistema listo: http://127.0.0.1:3000
echo  Para detener todo: doble clic en detener.bat
start "" http://127.0.0.1:3000
timeout /t 5 >nul
exit /b 0
