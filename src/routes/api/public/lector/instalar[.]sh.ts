import { createFileRoute } from "@tanstack/react-router";

import { VERSION_AGENTE } from "@/lib/lector";

const script = (base: string) => `#!/bin/bash
# Instalador del lector de equipos iPhonizate OS (v${VERSION_AGENTE})
# Todo queda dentro de la cuenta del usuario: sin sudo, sin contraseña, sin Homebrew.
set -uo pipefail

BASE="${base}"
DIR="$HOME/Library/Application Support/iphonizate-lector"
RT="$DIR/runtime"
PLIST="$HOME/Library/LaunchAgents/app.iphonizate.lector.plist"
CFG="$DIR/config.json"
TMPD=""

limpiar() { [ -n "$TMPD" ] && rm -rf "$TMPD"; }
trap limpiar EXIT

fallar() {
  echo ""
  echo "✗ $1"
  echo "  El lector no quedó funcionando. Avisa a la oficina con este mensaje."
  exit 1
}

echo ""
echo "  Lector de equipos iPhonizate OS"
echo "  --------------------------------"
echo ""

[ "$(uname)" = "Darwin" ] || fallar "Este instalador es solo para Mac."
[ "$(id -u)" != "0" ] || fallar "No corras esto con sudo: el lector se instala para tu usuario."
command -v curl >/dev/null 2>&1 || fallar "Este Mac no tiene curl."

sha256() { # sha256 ARCHIVO
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" 2>/dev/null | awk '{print $1}'
  else
    /usr/bin/openssl dgst -sha256 "$1" 2>/dev/null | awk '{print $NF}'
  fi
}

# --- Entrada interactiva incluso cuando el script llega por una tubería ---
TTY=""
if [ -r /dev/tty ] && { : > /dev/tty; } 2>/dev/null; then TTY="/dev/tty"; fi

preguntar() { # preguntar "texto" → deja la respuesta en RESPUESTA
  RESPUESTA=""
  [ -n "$TTY" ] || return 0
  printf "%s" "$1" > /dev/tty 2>/dev/null || true
  IFS= read -r RESPUESTA < /dev/tty || RESPUESTA=""
}

validar_clave() { # validar_clave CLAVE  → 0 si el servidor la acepta
  [ -n "$1" ] || return 1
  case "$1" in lec_*) ;; *) return 1 ;; esac
  curl -fsS -o /dev/null -X POST "$BASE/api/public/lector/verificar" \\
    -H "x-lector-clave: $1" --data '' 2>/dev/null
}

campo_json() { # campo_json ARCHIVO CAMPO  (sin python ni jq)
  [ -f "$1" ] || return 1
  sed -n "s/.*\\"$2\\"[[:space:]]*:[[:space:]]*\\"\\([^\\"]*\\)\\".*/\\1/p" "$1" | head -1
}

escapar_json() { printf '%s' "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'; }

# --- Clave: variable de entorno, config existente o pregunta ---
CLAVE="\${LECTOR_CLAVE:-}"
if [ -z "$CLAVE" ] && [ -f "$CFG" ]; then
  ANTERIOR="$(campo_json "$CFG" clave || true)"
  if [ -n "$ANTERIOR" ] && validar_clave "$ANTERIOR"; then
    echo "→ Este Mac ya tenía una clave válida, se conserva"
    CLAVE="$ANTERIOR"
  elif [ -n "$ANTERIOR" ]; then
    echo "→ La clave guardada ya no sirve (vencida o revocada), pide una nueva"
  fi
fi

if [ -z "$CLAVE" ]; then
  if [ -z "$TTY" ]; then
    fallar "Necesito la clave de la tienda y esta ventana no permite escribir.
  Vuelve a correr así, reemplazando TU_CLAVE:
  LECTOR_CLAVE=TU_CLAVE bash -c \\"\\$(curl -fsSL $BASE/api/public/lector/instalar.sh)\\""
  fi
  INTENTOS=0
  while [ "$INTENTOS" -lt 3 ]; do
    INTENTOS=$((INTENTOS + 1))
    echo ""
    preguntar "Pega la clave que te dio la oficina (empieza con lec_): "
    CLAVE="$RESPUESTA"
    if validar_clave "$CLAVE"; then
      echo "  ✓ Clave verificada con el servidor"
      break
    fi
    echo "  ✗ Esa clave no es válida o fue revocada."
    CLAVE=""
  done
fi

[ -n "$CLAVE" ] || fallar "No conseguí una clave válida de la tienda.
  Genera una nueva en Configuración → Macs lectores y vuelve a intentar."
validar_clave "$CLAVE" || fallar "La clave entregada no fue aceptada por el servidor."

# --- Nombre del Mac (nunca sale del propio script) ---
NOMBRE="\${LECTOR_NOMBRE:-}"
if [ -z "$NOMBRE" ] && [ -f "$CFG" ]; then
  NOMBRE="$(campo_json "$CFG" nombre || true)"
fi
if [ -z "$NOMBRE" ] && [ -n "$TTY" ]; then
  preguntar "Nombre de este Mac (ej: Mostrador 1) [Enter para usar el del sistema]: "
  NOMBRE="$RESPUESTA"
fi
case "$NOMBRE" in \\#*) NOMBRE="" ;; esac
if [ -z "$NOMBRE" ]; then
  NOMBRE="$(scutil --get ComputerName 2>/dev/null || hostname)"
fi

# --- Manifiesto del entorno (versiones y huellas las decide el servidor) ---
ARQ="$(uname -m)"
case "$ARQ" in
  arm64) ;;
  x86_64) ;;
  *) fallar "Arquitectura no soportada: $ARQ" ;;
esac
MACOS="$(sw_vers -productVersion 2>/dev/null | cut -d. -f1)"
[ -n "$MACOS" ] || MACOS=15

echo "→ Preparando la instalación para este Mac ($ARQ, macOS $MACOS)"
TMPD="$(mktemp -d -t lector)"
MAN="$TMPD/manifiesto.txt"
curl -fsSL "$BASE/api/public/lector/runtime?arch=$ARQ&macos=$MACOS" -o "$MAN" \\
  || fallar "No pude pedir la lista de piezas al servidor. Revisa la conexión a internet."
grep -q '^version ' "$MAN" || fallar "El servidor no entregó una lista de piezas válida:
  $(head -1 "$MAN")"

mkdir -p "$DIR" "$HOME/Library/LaunchAgents" "$RT/bin" "$RT/lib" || fallar "No pude crear las carpetas del lector."

bajar_verificado() { # bajar_verificado URL SHA256 DESTINO [CABECERA]
  if [ -n "\${4:-}" ]; then
    curl -fsSL -H "$4" -H "Accept: application/vnd.oci.image.layer.v1.tar+gzip" "$1" -o "$3" </dev/null || return 1
  else
    curl -fsSL "$1" -o "$3" </dev/null || return 1
  fi
  OBT="$(sha256 "$3")"
  [ -n "$OBT" ] && [ "$OBT" = "$2" ]
}

# --- Node (tarball oficial de nodejs.org, firmado y notarizado por Apple) ---
NODE_BIN="$RT/node/bin/node"
NODE_LINEA="$(awk '$1=="node"{print; exit}' "$MAN")"
set -- $NODE_LINEA
NODE_VER="\${2:-}"; NODE_URL="\${3:-}"; NODE_SHA="\${4:-}"
[ -n "$NODE_URL" ] || fallar "El manifiesto no trae Node."

if [ ! -x "$NODE_BIN" ] || [ "$($NODE_BIN -v 2>/dev/null)" != "$NODE_VER" ]; then
  echo "→ Instalando el motor del lector (Node $NODE_VER) — no pide contraseña"
  bajar_verificado "$NODE_URL" "$NODE_SHA" "$TMPD/node.tar.gz" \\
    || fallar "La descarga de Node falló o no coincide con el original."
  rm -rf "$RT/node"; mkdir -p "$RT/node"
  tar -xzf "$TMPD/node.tar.gz" -C "$RT/node" --strip-components 1 \\
    || fallar "No pude descomprimir Node."
fi
[ -x "$NODE_BIN" ] || fallar "Node no quedó instalado en $RT/node."
echo "  ✓ Node $($NODE_BIN -v)"

# --- Herramientas para leer el iPhone (paquetes ya compilados para Mac) ---
echo "→ Instalando las herramientas para leer el iPhone"
CUANTAS=0
while read -r TIPO NOMBRE_F VER_F REPO URL SHA; do
  [ "$TIPO" = "herramienta" ] || continue
  TOK="$(curl -fsSL "https://ghcr.io/token?service=ghcr.io&scope=repository:$REPO:pull" </dev/null \\
    | sed -n 's/.*"token":"\\([^"]*\\)".*/\\1/p')"
  [ -n "$TOK" ] || fallar "No pude autenticarme en el repositorio público de paquetes."
  PKG="$TMPD/$NOMBRE_F.tar.gz"
  bajar_verificado "$URL" "$SHA" "$PKG" "Authorization: Bearer $TOK" \\
    || fallar "La descarga de $NOMBRE_F falló o no coincide con el original."
  DEST="$TMPD/x/$NOMBRE_F"
  mkdir -p "$DEST"
  tar -xzf "$PKG" -C "$DEST" || fallar "No pude descomprimir $NOMBRE_F."
  # binarios y librerías al entorno del lector (se ignoran cabeceras y docs)
  find "$DEST" -maxdepth 3 -type d -name bin -exec sh -c 'cp -R "$1"/. "$2"/ 2>/dev/null' _ {} "$RT/bin" \\; 2>/dev/null || true
  find "$DEST" -maxdepth 3 -type d -name lib -exec sh -c 'cp -R "$1"/. "$2"/ 2>/dev/null' _ {} "$RT/lib" \\; 2>/dev/null || true
  echo "  ✓ $NOMBRE_F $VER_F"
  CUANTAS=$((CUANTAS + 1))
done < "$MAN"
[ "$CUANTAS" -ge 5 ] || fallar "El manifiesto no trajo todas las herramientas."

chmod +x "$RT/bin/"* 2>/dev/null || true

# Los binarios traen rutas de Homebrew sin resolver (@@HOMEBREW_PREFIX@@…), así que
# macOS busca cada librería por su nombre en nuestra carpeta con estas variables.
export DYLD_LIBRARY_PATH="$RT/lib"
export DYLD_FALLBACK_LIBRARY_PATH="$RT/lib:/usr/local/lib:/usr/lib"


# --- Prueba real de las cuatro herramientas ---
echo "→ Probando las herramientas en este Mac"
probar() { # probar HERRAMIENTA
  T="$RT/bin/$1"
  [ -x "$T" ] || { echo "  ✗ falta $1"; return 1; }
  SAL="$("$T" --version 2>&1)"; COD=$?
  case "$SAL" in
    *"dyld"*|*"Library not loaded"*|*"image not found"*|*"no suitable image"*)
      echo "  ✗ $1 no pudo cargar sus librerías"; return 1 ;;
  esac
  if [ "$COD" != "0" ] && [ -z "$SAL" ]; then
    echo "  ✗ $1 no se pudo ejecutar"; return 1
  fi
  echo "  ✓ $1"
  return 0
}

FALLO=0
for H in idevice_id ideviceinfo idevicepair idevicediagnostics; do
  probar "$H" || FALLO=1
done

# idevice_id -l debe poder hablar con el servicio USB de Apple (sin equipo devuelve vacío)
if ! "$RT/bin/idevice_id" -l >/dev/null 2>&1; then
  echo "  ✗ idevice_id no pudo consultar el puerto USB"
  FALLO=1
else
  echo "  ✓ conexión con el servicio USB de Apple"
fi

[ "$FALLO" = "0" ] || fallar "Las herramientas de lectura no funcionaron en este Mac, así que no dejé el lector activo.
  Manda esta salida a la oficina: arquitectura $ARQ, macOS $MACOS, etiqueta $(awk '$1=="etiqueta"{print $2}' "$MAN")."

# --- Descarga del lector con verificación de checksum ---
echo "→ Descargando el lector"
ESPERADO="$(curl -fsSL "$BASE/api/public/lector/version" \\
  | sed -n 's/.*"sha256"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p')"
[ -n "$ESPERADO" ] || fallar "No pude preguntar la huella del lector al servidor."
curl -fsSL "$BASE/api/public/lector/agente.js" -o "$TMPD/lector.js" || fallar "No pude descargar el lector."
OBTENIDO="$(sha256 "$TMPD/lector.js")"
[ "$ESPERADO" = "$OBTENIDO" ] || fallar "El archivo descargado no coincide con el original."
echo "  ✓ Archivo verificado"
cp "$TMPD/lector.js" "$DIR/lector.js" || fallar "No pude guardar el lector."
chmod 644 "$DIR/lector.js"

# --- Configuración (se escribe con la clave ya validada) ---
CJ="$(escapar_json "$CLAVE")"
NJ="$(escapar_json "$NOMBRE")"
BJ="$(escapar_json "$BASE")"
RJ="$(escapar_json "$RT")"
cat > "$CFG" <<JSON || fallar "No pude escribir la configuración."
{
  "base_url": "$BJ",
  "clave": "$CJ",
  "nombre": "$NJ",
  "runtime": "$RJ"
}
JSON
chmod 600 "$CFG"

# --- launchd (agente del usuario que instaló, nunca root) ---
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>app.iphonizate.lector</string>
  <key>ProgramArguments</key>
  <array>
    <string>$RT/node/bin/node</string>
    <string>$DIR/lector.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$RT/bin:$RT/node/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>DYLD_LIBRARY_PATH</key><string>$RT/lib</string>
    <key>DYLD_FALLBACK_LIBRARY_PATH</key><string>$RT/lib:/usr/local/lib:/usr/lib</string>

    <key>LECTOR_RUNTIME</key><string>$RT</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/lector.log</string>
  <key>StandardErrorPath</key><string>$DIR/lector.log</string>
</dict>
</plist>
PL

launchctl bootout "gui/$(id -u)/app.iphonizate.lector" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || launchctl load "$PLIST" \\
  || fallar "No pude dejar el lector arrancando solo."

sleep 2
if ! launchctl list 2>/dev/null | grep -q app.iphonizate.lector; then
  fallar "El lector no quedó corriendo. Revisa $DIR/lector.log"
fi

echo ""
echo "✓ Listo, este Mac quedó registrado como: $NOMBRE"
echo "  Las cuatro herramientas de lectura pasaron la prueba en este Mac."
echo "  El lector corre con tu usuario ($(id -un)) y arranca solo con el Mac."
echo "  No se instaló nada fuera de tu carpeta personal y no se pidió contraseña."
echo "  Conecta un iPhone, desbloquéalo y toca Confiar."
echo "  Registro: $DIR/lector.log"
echo ""
echo "  Software libre incluido: libimobiledevice, libplist, libusbmuxd, libtatsu,"
echo "  libtasn1 y OpenSSL (LGPL/GPL/Apache), descargados del repositorio público"
echo "  de paquetes de Mac. Node.js desde nodejs.org."
echo ""
`;

export const Route = createFileRoute("/api/public/lector/instalar.sh")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const base = new URL(request.url).origin;
        return new Response(script(base), {
          headers: {
            "content-type": "text/x-shellscript; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
