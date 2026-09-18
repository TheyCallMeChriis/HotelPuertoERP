param([Parameter(Mandatory = $true)][ValidateSet('backend', 'frontend')][string]$Service)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath (Join-Path $projectRoot $Service)
& npm.cmd run dev
exit $LASTEXITCODE
