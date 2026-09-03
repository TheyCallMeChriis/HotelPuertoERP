Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   INICIANDO SISTEMA POS-ERP HOTEL PUERTO LIMON" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Cyan

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$pgBin = "C:\Users\chris\AppData\Local\Programs\pgsql\bin\pg_ctl.exe"
$pgData = "C:\Users\chris\AppData\Local\Programs\pgsql\data"
$pgLog = "C:\Users\chris\AppData\Local\Programs\pgsql\logfile.txt"

# 1. Iniciar PostgreSQL
Write-Host "[*] Verificando PostgreSQL..." -ForegroundColor Yellow
& $pgBin -D $pgData -l $pgLog start

# 2. Iniciar Backend en segundo plano
Write-Host "[*] Iniciando Backend API (http://localhost:4000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$scriptPath\backend'; npm run dev"

# 3. Iniciar Frontend en segundo plano
Write-Host "[*] Iniciando Frontend React (http://localhost:3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$scriptPath\frontend'; npm run dev"

Write-Host "======================================================" -ForegroundColor Green
Write-Host "Sistema iniciado correctamente. Abra http://localhost:3000" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
