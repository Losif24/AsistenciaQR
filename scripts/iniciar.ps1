<#
    Arranca Asistencia QR y abre el navegador.
    Es lo que ejecutan los accesos directos que crea el instalador.
#>

[CmdletBinding()]
param(
    [switch] $SinNavegador
)

$ErrorActionPreference = 'Stop'
$Raiz = Split-Path -Parent $PSScriptRoot
Set-Location $Raiz

$Host.UI.RawUI.WindowTitle = 'Asistencia QR'

function Leer-Puerto {
    $archivo = Join-Path $Raiz '.env'
    if (Test-Path $archivo) {
        $linea = Select-String -Path $archivo -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
        if ($linea) { return [int]$linea.Matches[0].Groups[1].Value }
    }
    return 4090
}

$puerto = Leer-Puerto

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host ''
    Write-Host '  Node.js no esta disponible.' -ForegroundColor Red
    Write-Host '  Ejecute scripts\instalar.ps1 para prepararlo todo.' -ForegroundColor Yellow
    Write-Host ''
    [void][System.Console]::ReadKey($true)
    exit 1
}

if (-not (Test-Path (Join-Path $Raiz 'node_modules'))) {
    Write-Host '  Faltan las librerias. Instalandolas...' -ForegroundColor Yellow
    & npm install --omit=dev --no-audit --no-fund | Out-Null
}

# Si ya hay una instancia escuchando, se abre esa en vez de levantar otra.
$ocupado = Test-NetConnection -ComputerName '127.0.0.1' -Port $puerto -InformationLevel Quiet -WarningAction SilentlyContinue
if ($ocupado) {
    Write-Host "  Asistencia QR ya estaba funcionando en el puerto $puerto." -ForegroundColor Green
    if (-not $SinNavegador) { Start-Process "http://localhost:$puerto" }
    Start-Sleep -Seconds 2
    exit 0
}

if (-not $SinNavegador) {
    # El navegador se abre en paralelo: para cuando cargue, el servidor ya responde.
    Start-Job -ScriptBlock {
        param($p)
        Start-Sleep -Seconds 3
        Start-Process "http://localhost:$p"
    } -ArgumentList $puerto | Out-Null
}

& node src/server.js
