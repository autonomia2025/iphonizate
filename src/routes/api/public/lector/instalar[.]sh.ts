import { createFileRoute } from "@tanstack/react-router";

import { VERSION_AGENTE } from "@/lib/lector";

const script = (base: string) => `#!/bin/bash
# Instalador del lector de equipos iPhonizate OS (v${VERSION_AGENTE})
set -euo pipefail

BASE="${base}"
DIR="$HOME/Library/Application Support/iphonizate-lector"
PLIST="$HOME/Library/LaunchAgents/app.iphonizate.lector.plist"
CFG="$DIR/config.json"

fallar() {
  echo ""
  echo "✗ $1"
  echo "  No se instaló nada. Avisa a la oficina si el problema sigue."
  exit 1
}

echo ""
echo "  Lector de equipos iPhonizate OS"
echo "  --------------------------------"
echo ""

[ "$(uname)" = "Darwin" ] || fallar "Este instalador es solo para Mac."
[ "$(id -u)" != "0" ] || fallar "No corras esto con sudo: el lector se instala para tu usuario."

# --- Entrada interactiva incluso cuando el script llega por una tubería ---
# (con «curl ... | bash» la entrada estándar es el propio script, así que
#  preguntamos directamente a la terminal)
TTY=""
if [ -r /dev/tty ]; then TTY="/dev/tty"; fi

preguntar() { # preguntar "texto" → deja la respuesta en RESPUESTA
  RESPUESTA=""
  if [ -n "$TTY" ]; then
    printf "%s" "$1" > /dev/tty
    IFS= read -r RESPUESTA < /dev/tty || RESPUESTA=""
  fi
}

validar_clave() { # validar_clave CLAVE  → 0 si el servidor la acepta
  [ -n "$1" ] || return 1
  case "$1" in lec_*) ;; *) return 1 ;; esac
  curl -fsS -o /dev/null -X POST "$BASE/api/public/lector/verificar" \\
    -H "x-lector-clave: $1" --data '' 2>/dev/null
}

leer_json() { # leer_json ARCHIVO CAMPO
  [ -f "$1" ] || return 1
  /usr/bin/python3 - "$1" "$2" <<'PY' 2>/dev/null || return 1
import json, sys
try:
    with open(sys.argv[1]) as f:
        d = json.load(f)
except Exception:
    sys.exit(1)
v = d.get(sys.argv[2])
sys.stdout.write(v if isinstance(v, str) else "")
PY
}

# --- Clave: variable de entorno, config existente o pregunta ---
CLAVE="\${LECTOR_CLAVE:-}"
if [ -z "$CLAVE" ] && [ -f "$CFG" ]; then
  ANTERIOR="$(leer_json "$CFG" clave || true)"
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
  NOMBRE="$(leer_json "$CFG" nombre || true)"
  case "$NOMBRE" in \\#*|"") NOMBRE="" ;; esac
fi
if [ -z "$NOMBRE" ] && [ -n "$TTY" ]; then
  preguntar "Nombre de este Mac (ej: Mostrador 1) [Enter para usar el del sistema]: "
  NOMBRE="$RESPUESTA"
fi
case "$NOMBRE" in \\#*) NOMBRE="" ;; esac
if [ -z "$NOMBRE" ]; then
  NOMBRE="$(scutil --get ComputerName 2>/dev/null || hostname)"
fi

# --- Homebrew ---
if ! command -v brew >/dev/null 2>&1; then
  echo "→ Instalando Homebrew (te va a pedir tu contraseña del Mac)"
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  for P in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    [ -x "$P" ] && eval "$($P shellenv)"
  done
fi

# --- Dependencias ---
echo "→ Instalando las herramientas para leer el iPhone (puede tardar varios minutos)"
brew list libimobiledevice >/dev/null 2>&1 || brew install libimobiledevice
command -v node >/dev/null 2>&1 || brew list node >/dev/null 2>&1 || brew install node
command -v node >/dev/null 2>&1 || fallar "No quedó instalado Node en este Mac."

mkdir -p "$DIR" "$HOME/Library/LaunchAgents"

# --- Descarga con verificación de checksum ---
echo "→ Descargando el lector"
TMP="$(mktemp -t lector)"
curl -fsSL "$BASE/api/public/lector/agente.js" -o "$TMP" || fallar "No pude descargar el lector."
ESPERADO="$(curl -fsSL "$BASE/api/public/lector/version" | /usr/bin/python3 -c 'import json,sys;sys.stdout.write(json.load(sys.stdin)["sha256"])')"
OBTENIDO="$(shasum -a 256 "$TMP" | awk '{print $1}')"

if [ -z "$ESPERADO" ] || [ "$ESPERADO" != "$OBTENIDO" ]; then
  rm -f "$TMP"
  fallar "El archivo descargado no coincide con el original."
fi
echo "  ✓ Archivo verificado"
mv "$TMP" "$DIR/lector.js"
chmod 644 "$DIR/lector.js"

# --- Configuración (se escribe con la clave ya validada) ---
/usr/bin/python3 - "$CFG" "$BASE" "$CLAVE" "$NOMBRE" <<'PY' || fallar "No pude escribir la configuración."
import json, sys
ruta, base, clave, nombre = sys.argv[1:5]
if not clave.startswith("lec_"):
    sys.exit(1)
with open(ruta, "w") as f:
    json.dump({"base_url": base, "clave": clave, "nombre": nombre}, f, ensure_ascii=False, indent=2)
PY
chmod 600 "$CFG"

# --- launchd (agente del usuario que instaló, no root) ---
NODE="$(command -v node)"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>app.iphonizate.lector</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$DIR/lector.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
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
launchctl bootstrap "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || launchctl load "$PLIST"

echo ""
echo "✓ Listo, este Mac quedó registrado como: $NOMBRE"
echo "  El lector corre con tu usuario ($(id -un)) y arranca solo con el Mac."
echo "  Conecta un iPhone, desbloquéalo y toca Confiar."
echo "  Registro: $DIR/lector.log"
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
