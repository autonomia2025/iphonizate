import { createFileRoute } from "@tanstack/react-router";

import { VERSION_AGENTE } from "@/lib/lector";

const script = (base: string) => `#!/bin/bash
# Instalador del lector de equipos iPhonizate OS (v${VERSION_AGENTE})
set -euo pipefail

BASE="${base}"
DIR="$HOME/Library/Application Support/iphonizate-lector"
PLIST="$HOME/Library/LaunchAgents/app.iphonizate.lector.plist"

echo ""
echo "  Lector de equipos iPhonizate OS"
echo "  --------------------------------"
echo ""

if [ "$(uname)" != "Darwin" ]; then
  echo "Este instalador es solo para Mac."
  exit 1
fi

# --- Homebrew ---
if ! command -v brew >/dev/null 2>&1; then
  echo "→ Instalando Homebrew (te va a pedir tu contraseña del Mac)"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  for P in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    [ -x "$P" ] && eval "$($P shellenv)"
  done
fi

# --- Dependencias ---
echo "→ Instalando las herramientas para leer el iPhone"
brew list libimobiledevice >/dev/null 2>&1 || brew install libimobiledevice
brew list node >/dev/null 2>&1 || command -v node >/dev/null 2>&1 || brew install node

mkdir -p "$DIR" "$HOME/Library/LaunchAgents"

# --- Descarga con verificación de checksum ---
echo "→ Descargando el lector"
TMP="$(mktemp -t lector)"
curl -fsSL "$BASE/api/public/lector/agente.js" -o "$TMP"
ESPERADO="$(curl -fsSL "$BASE/api/public/lector/version" | /usr/bin/python3 -c 'import json,sys;print(json.load(sys.stdin)["sha256"])')"
OBTENIDO="$(shasum -a 256 "$TMP" | awk '{print $1}')"

if [ "$ESPERADO" != "$OBTENIDO" ]; then
  echo ""
  echo "✗ El archivo descargado no coincide con el original. No se instaló nada."
  echo "  Avisa a la oficina antes de volver a intentarlo."
  rm -f "$TMP"
  exit 1
fi
echo "  ✓ Archivo verificado"
mv "$TMP" "$DIR/lector.js"
chmod 644 "$DIR/lector.js"

# --- Clave de la tienda ---
if [ -f "$DIR/config.json" ]; then
  echo "→ Ya había una clave guardada, se mantiene"
else
  echo ""
  read -r -p "Pega la clave que te dio la oficina: " CLAVE
  read -r -p "Nombre de este Mac (ej: Mostrador 1): " NOMBRE
  cat > "$DIR/config.json" <<CFG
{
  "base_url": "$BASE",
  "clave": "$CLAVE",
  "nombre": "$NOMBRE"
}
CFG
  chmod 600 "$DIR/config.json"
fi

# --- launchd ---
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
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/lector.log</string>
  <key>StandardErrorPath</key><string>$DIR/lector.log</string>
</dict>
</plist>
PL

launchctl unload "$PLIST" >/dev/null 2>&1 || true
launchctl load "$PLIST"

echo ""
echo "✓ Listo. El lector queda corriendo y arranca solo con el Mac."
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
