[CmdletBinding()]
param(
    [ValidateSet('External', 'Docker', 'Local')][string]$Database = 'External',
    [string]$PgCtl = $env:PG_CTL,
    [string]$PgData = $env:PGDATA,
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$nodeCommand = Get-Command node.exe -ErrorAction Stop
$null = Get-Command npm.cmd -ErrorAction Stop
foreach ($required in @('backend/.env', 'backend/node_modules/ts-node/dist/bin.js', 'frontend/node_modules/vite/bin/vite.js')) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $required))) { throw "Falta $required. Consulte README.md antes de iniciar." }
}
$configOutput = & $nodeCommand.Source (Join-Path $projectRoot 'backend/node_modules/ts-node/dist/bin.js') --project (Join-Path $projectRoot 'backend/tsconfig.json') (Join-Path $projectRoot 'backend/src/scripts/check-config.ts')
if ($LASTEXITCODE -ne 0) { throw 'La configuracion del backend no es valida.' }
$backendPort = ($configOutput | ConvertFrom-Json).port
if ($backendPort -eq 3000) { throw 'PORT del backend no puede ser 3000: esta reservado para el frontend.' }
if ($Database -eq 'Local') {
    if (-not $PgCtl -or -not $PgData -or -not (Test-Path -LiteralPath $PgCtl) -or -not (Test-Path -LiteralPath (Join-Path $PgData 'PG_VERSION'))) {
        throw 'Para PostgreSQL local indique -PgCtl y -PgData de una instalacion existente (o PG_CTL y PGDATA).'
    }
}
if ($Database -eq 'Docker') {
    $null = Get-Command docker -ErrorAction Stop
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) { throw 'Configure el archivo .env de la raiz para Docker.' }
}
if ($CheckOnly) { Write-Host "Configuracion y dependencias disponibles. API: $backendPort; frontend: 3000. No se iniciaron procesos."; return }

function Test-LocalPort([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try { $client.Connect('127.0.0.1', $Port); return $true } catch { return $false } finally { $client.Dispose() }
}
foreach ($port in @($backendPort, 3000)) {
    if (Test-LocalPort $port) { throw "El puerto $port esta ocupado. Detenga la instancia anterior antes de iniciar otra." }
}
$logDirectory = Join-Path $projectRoot 'tmp/server-logs'
$null = New-Item -ItemType Directory -Path $logDirectory -Force
if ($Database -eq 'Docker') {
    & docker compose --project-directory $projectRoot -f (Join-Path $projectRoot 'docker-compose.yml') up -d postgres
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar PostgreSQL con Docker.' }
} elseif ($Database -eq 'Local') {
    & $PgCtl -D $PgData status
    if ($LASTEXITCODE -eq 3) {
        & $PgCtl -D $PgData -l (Join-Path $logDirectory 'postgres.log') -w start
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar PostgreSQL local.' }
    } elseif ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el estado de PostgreSQL local.' }
}
$env:VITE_API_TARGET = "http://127.0.0.1:$backendPort"
$runner = Join-Path $projectRoot 'scripts/run-dev.ps1'
$shellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
$started = @()
try {
    foreach ($service in @('backend', 'frontend')) {
        $started += Start-Process -FilePath $shellPath -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$runner`"", '-Service', $service) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory "$service.out.log") -RedirectStandardError (Join-Path $logDirectory "$service.err.log")
    }
    $ready = $false
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        foreach ($process in $started) { $process.Refresh(); if ($process.HasExited) { throw 'Un servidor termino durante el inicio. Revise tmp/server-logs.' } }
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$backendPort/api/health" -TimeoutSec 1
            $frontend = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/' -UseBasicParsing -TimeoutSec 2
            if ($health.status -eq 'OK' -and $frontend.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Los servidores no respondieron a tiempo. Revise tmp/server-logs.' }
    Write-Host 'Servidores disponibles: http://127.0.0.1:3000'
    Write-Host "Procesos iniciadores: $($started.Id -join ', '). Logs: $logDirectory"
    Write-Host 'El health check verifica la API; las operaciones de base de datos se comprueban por separado.'
} catch {
    # Solo detener arboles creados por esta ejecucion fallida, nunca procesos ajenos.
    foreach ($process in $started) {
        $process.Refresh()
        if (-not $process.HasExited) { & taskkill.exe /PID $process.Id /T /F | Out-Null }
    }
    throw
}
