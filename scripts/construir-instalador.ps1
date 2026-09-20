<#
    Compila el instalador de Windows con Inno Setup.

    Uso:
      .\scripts\construir-instalador.ps1
      .\scripts\construir-instalador.ps1 -NodeMsi C:\ruta\node-v22.20.0-x64.msi

    Pasando -NodeMsi se empaqueta Node.js dentro del .exe y el equipo de
    destino puede instalar sin internet (el instalador crece unos 30 MB).
#>

[CmdletBinding()]
param(
    [string] $NodeMsi = ''
)

$ErrorActionPreference = 'Stop'
$Raiz = Split-Path -Parent $PSScriptRoot
$Guion = Join-Path $Raiz 'installer\AsistenciaQR.iss'

function Buscar-Iscc {
    $candidatos = @(
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    )
    foreach ($ruta in $candidatos) { if (Test-Path $ruta) { return $ruta } }

    $comando = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($comando) { return $comando.Source }
    return $null
}

$iscc = Buscar-Iscc
if (-not $iscc) {
    Write-Host ''
    Write-Host '  No se encontro Inno Setup 6.' -ForegroundColor Red
    Write-Host '  Descarguelo de https://jrsoftware.org/isdl.php e instalelo.' -ForegroundColor Yellow
    Write-Host ''
    exit 1
}

Write-Host "  Inno Setup: $iscc" -ForegroundColor DarkGray

# El .iss empaqueta installer\node-lts.msi solo si el archivo existe.
$destinoMsi = Join-Path $Raiz 'installer\node-lts.msi'
$copiado = $false

if ($NodeMsi) {
    if (-not (Test-Path $NodeMsi)) { throw "No existe el archivo: $NodeMsi" }
    Copy-Item $NodeMsi $destinoMsi -Force
    $copiado = $true
    Write-Host '  Node.js se empaquetara dentro del instalador.' -ForegroundColor DarkGray
}

try {
    New-Item -ItemType Directory -Force -Path (Join-Path $Raiz 'dist') | Out-Null

    $salida = & $iscc $Guion 2>&1
    $salida | Where-Object { $_ -match 'Warning|Error|Successful' } | ForEach-Object { Write-Host "  $_" }

    if ($LASTEXITCODE -ne 0) {
        $salida | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
        throw 'La compilacion fallo.'
    }

    $exe = Get-ChildItem (Join-Path $Raiz 'dist\*.exe') | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Write-Host ''
    Write-Host "  Listo: $($exe.FullName)" -ForegroundColor Green
    Write-Host "  Tamano: $([math]::Round($exe.Length / 1MB, 1)) MB" -ForegroundColor DarkGray
    Write-Host ''
}
finally {
    if ($copiado) { Remove-Item $destinoMsi -Force -ErrorAction SilentlyContinue }
}
