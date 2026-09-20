<#
    Asistencia QR - instalacion completa en un paso.

    Deja el sistema listo aunque el equipo no tenga nada preparado:
      1. Comprueba Node.js y lo instala desde nodejs.org si falta.
      2. Descarga las librerias del proyecto.
      3. Crea la base de datos SQLite con su esquema y el usuario inicial.
      4. Deja accesos directos y, si se pide, arranque automatico.

    Uso:  powershell -ExecutionPolicy Bypass -File scripts\instalar.ps1
#>

[CmdletBinding()]
param(
    [int]    $Puerto = 4090,
    [string] $Organizacion = '',
    [string] $NodeMsi = '',          # MSI local para instalar sin internet
    [switch] $ConArranqueAutomatico,
    [switch] $SinAccesosDirectos,
    [switch] $Silencioso
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'   # sin esto la descarga es mucho mas lenta

$Raiz         = Split-Path -Parent $PSScriptRoot
$NodeMinimo   = [version]'20.0.0'
$LineaAncho   = 62

# ---------------------------------------------------------------- Presentacion

function Escribir-Titulo($texto) {
    Write-Host ''
    Write-Host ('  ' + ('-' * $LineaAncho)) -ForegroundColor DarkGray
    Write-Host "  $texto" -ForegroundColor White
    Write-Host ('  ' + ('-' * $LineaAncho)) -ForegroundColor DarkGray
}

function Escribir-Paso($texto)  { Write-Host "  -> $texto" -ForegroundColor Gray }
function Escribir-Bien($texto)  { Write-Host "  OK  $texto" -ForegroundColor Green }
function Escribir-Aviso($texto) { Write-Host "  !   $texto" -ForegroundColor Yellow }
function Escribir-Mal($texto)   { Write-Host "  X   $texto" -ForegroundColor Red }

# ------------------------------------------------------------------- Node.js

function Obtener-VersionNode {
    $comando = Get-Command node -ErrorAction SilentlyContinue
    if (-not $comando) { return $null }
    try {
        $texto = & node --version 2>$null
        if ($texto -match 'v(\d+\.\d+\.\d+)') { return [version]$Matches[1] }
    } catch { }
    return $null
}

function Resolver-UltimoLts {
    # Se consulta el indice oficial para no quedar atados a una version fija.
    try {
        $indice = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 25
        $lts = $indice | Where-Object { $_.lts } | Select-Object -First 1
        if ($lts) { return $lts.version.TrimStart('v') }
    } catch {
        Escribir-Aviso 'No se pudo consultar nodejs.org; se usara una version conocida.'
    }
    return '22.20.0'
}

function Instalar-Node {
    $arquitectura = if ([Environment]::Is64BitOperatingSystem) {
        if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    } else { 'x86' }

    if ($NodeMsi -and (Test-Path $NodeMsi)) {
        $instalador = (Resolve-Path $NodeMsi).Path
        Escribir-Paso "Usando el instalador incluido: $(Split-Path -Leaf $instalador)"
    } else {
        $version = Resolver-UltimoLts
        $archivo = "node-v$version-$arquitectura.msi"
        $url     = "https://nodejs.org/dist/v$version/$archivo"
        $instalador = Join-Path $env:TEMP $archivo

        Escribir-Paso "Descargando Node.js $version ($arquitectura). Puede tardar un par de minutos."
        try {
            Invoke-WebRequest -Uri $url -OutFile $instalador -TimeoutSec 600
        } catch {
            Escribir-Mal 'No se pudo descargar Node.js.'
            Write-Host ''
            Write-Host '  Instalelo a mano desde https://nodejs.org (version LTS) y vuelva a ejecutar' -ForegroundColor Yellow
            Write-Host '  este instalador. Si el equipo no tiene internet, descargue el .msi en otro' -ForegroundColor Yellow
            Write-Host '  equipo y ejecute:  .\instalar.ps1 -NodeMsi C:\ruta\node.msi' -ForegroundColor Yellow
            throw
        }
    }

    Escribir-Paso 'Instalando Node.js (requiere permisos de administrador)...'
    $proceso = Start-Process msiexec.exe -Wait -PassThru -ArgumentList @(
        '/i', "`"$instalador`"", '/qn', '/norestart', 'ADDLOCAL=ALL'
    )

    if ($proceso.ExitCode -ne 0 -and $proceso.ExitCode -ne 3010) {
        throw "La instalacion de Node.js termino con el codigo $($proceso.ExitCode)."
    }

    # El PATH del proceso actual no se refresca solo tras instalar el MSI.
    $rutas = @(
        [Environment]::GetEnvironmentVariable('Path', 'Machine'),
        [Environment]::GetEnvironmentVariable('Path', 'User'),
        "$env:ProgramFiles\nodejs"
    ) -join ';'
    $env:Path = $rutas

    $instalada = Obtener-VersionNode
    if (-not $instalada) { throw 'Node.js quedo instalado pero no responde. Cierre esta ventana, abra otra y repita.' }
    Escribir-Bien "Node.js $instalada instalado."
}

# ---------------------------------------------------------------- Accesorios

function Crear-AccesoDirecto($destino, $objetivo, $argumentos, $directorio, $icono) {
    $shell = New-Object -ComObject WScript.Shell
    $enlace = $shell.CreateShortcut($destino)
    $enlace.TargetPath       = $objetivo
    $enlace.Arguments        = $argumentos
    $enlace.WorkingDirectory = $directorio
    $enlace.Description      = 'Sistema de control de asistencia por codigo QR'
    if ($icono) { $enlace.IconLocation = $icono }
    $enlace.Save()
}

function Escribir-Configuracion {
    $archivo = Join-Path $Raiz '.env'
    if (Test-Path $archivo) {
        Escribir-Paso 'Ya existe un archivo .env; se conserva tal cual.'
        return
    }

    $nombre = if ($Organizacion) { $Organizacion } else { 'Mi Organizacion' }
    @(
        "PORT=$Puerto",
        'HOST=0.0.0.0',
        'DB_FILE=data/asistencia.db',
        'TZ=America/Bogota',
        'SESSION_SECRET=',
        'SESSION_HOURS=12',
        "ORG_NAME=$nombre",
        'NODE_ENV=production'
    ) | Set-Content -Path $archivo -Encoding UTF8

    Escribir-Bien "Configuracion escrita en .env (puerto $Puerto)."
}

# ------------------------------------------------------------------ Programa

try {
    Escribir-Titulo 'Asistencia QR - instalacion'
    Write-Host "  Carpeta: $Raiz" -ForegroundColor DarkGray

    # --- 1. Node.js
    Escribir-Titulo '1 de 4  ·  Node.js'
    $version = Obtener-VersionNode

    if (-not $version) {
        Escribir-Aviso 'Node.js no esta instalado en este equipo.'
        Instalar-Node
    } elseif ($version -lt $NodeMinimo) {
        Escribir-Aviso "Node.js $version es anterior a la $NodeMinimo que necesita el sistema."
        Instalar-Node
    } else {
        Escribir-Bien "Node.js $version ya estaba instalado."
    }

    # --- 2. Librerias
    Escribir-Titulo '2 de 4  ·  Librerias del proyecto'
    Push-Location $Raiz
    try {
        Escribir-Paso 'Descargando dependencias con npm...'
        $registro = & npm install --omit=dev --no-audit --no-fund 2>&1
        if ($LASTEXITCODE -ne 0) {
            $registro | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
            throw 'npm no pudo instalar las dependencias.'
        }
        Escribir-Bien 'Librerias instaladas.'
    } finally {
        Pop-Location
    }

    # --- 3. Configuracion y base de datos
    Escribir-Titulo '3 de 4  ·  Configuracion y base de datos'
    Escribir-Configuracion

    Push-Location $Raiz
    try {
        Escribir-Paso 'Creando el esquema SQLite y el usuario administrador...'
        $salida = & node src/db/migrate.js 2>&1
        if ($LASTEXITCODE -ne 0) {
            $salida | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
            throw 'No se pudo preparar la base de datos.'
        }
        $salida | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
        Escribir-Bien 'Base de datos lista.'
    } finally {
        Pop-Location
    }

    # --- 4. Accesos directos
    Escribir-Titulo '4 de 4  ·  Accesos directos'
    if ($SinAccesosDirectos) {
        Escribir-Paso 'Omitidos por peticion.'
    } else {
        $lanzador = Join-Path $Raiz 'scripts\iniciar.ps1'
        $objetivo = (Get-Command powershell.exe).Source
        $args     = "-ExecutionPolicy Bypass -WindowStyle Normal -File `"$lanzador`""
        $icono    = Join-Path $Raiz 'installer\asistencia.ico'
        if (-not (Test-Path $icono)) { $icono = '' }

        $escritorio = [Environment]::GetFolderPath('Desktop')
        Crear-AccesoDirecto (Join-Path $escritorio 'Asistencia QR.lnk') $objetivo $args $Raiz $icono
        Escribir-Bien 'Acceso directo creado en el escritorio.'

        $menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Asistencia QR'
        New-Item -ItemType Directory -Force -Path $menu | Out-Null
        Crear-AccesoDirecto (Join-Path $menu 'Asistencia QR.lnk') $objetivo $args $Raiz $icono
        Escribir-Bien 'Acceso directo creado en el menu Inicio.'
    }

    if ($ConArranqueAutomatico) {
        $inicio = [Environment]::GetFolderPath('Startup')
        $lanzador = Join-Path $Raiz 'scripts\iniciar.ps1'
        Crear-AccesoDirecto (Join-Path $inicio 'Asistencia QR.lnk') `
            (Get-Command powershell.exe).Source `
            "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$lanzador`" -SinNavegador" `
            $Raiz ''
        Escribir-Bien 'El sistema arrancara solo al encender el equipo.'
    }

    # --- Resumen
    Escribir-Titulo 'Instalacion terminada'
    $credenciales = Join-Path $Raiz 'data\credenciales-iniciales.txt'
    if (Test-Path $credenciales) {
        Write-Host ''
        Get-Content $credenciales | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    }

    Write-Host ''
    Write-Host "  Para empezar:  abra el acceso directo 'Asistencia QR'" -ForegroundColor White
    Write-Host "  O desde esta carpeta:  npm start" -ForegroundColor DarkGray
    Write-Host "  El sistema quedara en http://localhost:$Puerto" -ForegroundColor White
    Write-Host ''

    if (-not $Silencioso) {
        Write-Host '  Pulse una tecla para cerrar...' -ForegroundColor DarkGray
        [void][System.Console]::ReadKey($true)
    }
    exit 0
}
catch {
    Escribir-Titulo 'La instalacion no pudo completarse'
    Escribir-Mal $_.Exception.Message
    Write-Host ''
    Write-Host '  Revise el mensaje anterior y vuelva a ejecutar el instalador.' -ForegroundColor Yellow
    Write-Host ''
    if (-not $Silencioso) {
        Write-Host '  Pulse una tecla para cerrar...' -ForegroundColor DarkGray
        [void][System.Console]::ReadKey($true)
    }
    exit 1
}
