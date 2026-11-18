@echo off
rem One-time cleanup after the code review: removes obsolete files replaced by iniciar.bat,
rem detener.bat and tests/tanda-10. The script deletes itself when it finishes.
cd /d "%~dp0"
for %%F in ("backend\src\test-scenarios.ts" "backend\src\scripts\check-config.ts" "scripts\run-dev.ps1" "start_servers.ps1" "start_servers.bat") do if exist %%F del /q %%F
echo Archivos obsoletos eliminados.
timeout /t 3 >nul
(goto) 2>nul & del "%~f0"
