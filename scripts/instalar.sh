#!/usr/bin/env bash
# Asistencia QR - instalacion en Linux y macOS.
# Instala Node.js si falta, baja las librerias y prepara la base de datos.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_MINIMO=20

titulo() { printf '\n  %s\n  %s\n' "$1" "$(printf '%.0s-' {1..58})"; }
paso()   { printf '  -> %s\n' "$1"; }
bien()   { printf '  OK  %s\n' "$1"; }
aviso()  { printf '  !   %s\n' "$1"; }

instalar_node() {
  if command -v apt-get >/dev/null 2>&1; then
    paso 'Instalando Node.js con apt (se pedira la contrasena de sudo)...'
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    paso 'Instalando Node.js con dnf...'
    sudo dnf install -y nodejs
  elif command -v brew >/dev/null 2>&1; then
    paso 'Instalando Node.js con Homebrew...'
    brew install node
  else
    aviso 'No se reconocio el gestor de paquetes.'
    echo '      Instale Node.js 20 o superior desde https://nodejs.org y repita.'
    exit 1
  fi
}

titulo 'Asistencia QR - instalacion'
echo "  Carpeta: $RAIZ"

titulo '1 de 3  ·  Node.js'
if command -v node >/dev/null 2>&1; then
  ACTUAL="$(node --version | sed 's/^v//' | cut -d. -f1)"
  if [ "$ACTUAL" -lt "$NODE_MINIMO" ]; then
    aviso "Node.js $ACTUAL es anterior a la $NODE_MINIMO que se necesita."
    instalar_node
  else
    bien "Node.js $(node --version) ya estaba instalado."
  fi
else
  aviso 'Node.js no esta instalado.'
  instalar_node
fi

titulo '2 de 3  ·  Librerias del proyecto'
cd "$RAIZ"
npm install --omit=dev --no-audit --no-fund
bien 'Librerias instaladas.'

titulo '3 de 3  ·  Configuracion y base de datos'
if [ ! -f "$RAIZ/.env" ]; then
  cp "$RAIZ/.env.example" "$RAIZ/.env"
  bien 'Configuracion creada en .env'
else
  paso 'Ya existe un archivo .env; se conserva tal cual.'
fi

node src/db/migrate.js
bien 'Base de datos lista.'

titulo 'Instalacion terminada'
[ -f "$RAIZ/data/credenciales-iniciales.txt" ] && { echo; sed 's/^/  /' "$RAIZ/data/credenciales-iniciales.txt"; }
echo
echo '  Arranque con:  npm start'
echo
