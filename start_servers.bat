@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_servers.ps1" %*
exit /b %ERRORLEVEL%
