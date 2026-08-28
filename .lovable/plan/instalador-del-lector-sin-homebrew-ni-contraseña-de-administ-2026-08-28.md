# Instalador del lector sin Homebrew ni contraseña de administrador

## Respuesta corta

Sí: se puede eliminar Homebrew por completo y el instalador puede quedar sin `sudo` y sin contraseña de administrador. Ninguna de las herramientas que usa el lector necesita permisos de administrador en un Mac. Lo que pedía contraseña era **solo la instalación de Homebrew**, no el lector.

Lo verificado:

- La lectura del iPhone (IMEI, iCloud, batería) se hace con `idevice_id`, `ideviceinfo`, `idevicepair` e `idevicediagnostics`, que en Mac conversan con el servicio de Apple que ya viene incluido en el sistema. No hay que instalar ningún servicio ni tocar carpetas del sistema: todo corre con el usuario normal.
- Esas herramientas se pueden descargar ya compiladas desde el repositorio público oficial de paquetes de Mac, con `curl`, sin instalar Homebrew. Se guardan dentro de la carpeta del lector en la cuenta del usuario.
- Node (el motor del agente) se descarga desde el sitio oficial de Node.js, viene firmado por Apple y corre desde una carpeta del usuario sin permisos especiales.
- Los archivos bajados con `curl` no quedan "en cuarentena", así que macOS no muestra avisos de seguridad ni pide aprobar nada.
- Hay un detalle escondido en el instalador actual: usa `python3` del sistema para leer y escribir la configuración. En un Mac recién sacado de la caja eso puede abrir la ventana de "Instalar herramientas de desarrollador", que sí pide interacción y clave. Se elimina ese uso.

Único punto legal a cumplir: estas herramientas son de código abierto (LGPL/GPL). Como el Mac las descarga directamente del repositorio público y nosotros no las redistribuimos, solo corresponde dejar una nota de créditos y licencias visible en la app.

## Cómo queda la experiencia

1. La persona pega una línea en la Terminal.
2. Pega la clave `lec_...` (se valida contra el servidor antes de seguir).
3. Escribe el nombre del Mac (o aprieta Enter).
4. El instalador baja e instala todo dentro de la carpeta del usuario mientras muestra avances en español.
5. Hace una prueba real de las herramientas y, si algo falla, lo dice con claridad y no deja nada a medias.
6. Queda corriendo y arrancando solo con el Mac.

Sin `sudo`, sin contraseña, sin Homebrew, sin ventanas de macOS.

## Qué se construye

1. **Entorno propio del lector.** Todo queda en `~/Library/Application Support/iphonizate-lector/runtime`: Node, las herramientas de lectura y sus librerías. Nada fuera de la cuenta del usuario.
2. **Instalador nuevo.** Reescritura del script: detecta el tipo de Mac (Apple Silicon o Intel) y la versión de macOS, descarga las piezas correctas con versiones fijadas, verifica cada descarga por huella digital, arma el entorno y registra el arranque automático con el usuario actual.
3. **Prueba de humo al final.** El instalador ejecuta las herramientas de verdad; si no funcionan, aborta con un diagnóstico legible en vez de dejar un lector roto o caer a un atajo con permisos.
4. **Agente más explícito.** El agente pasa a invocar las herramientas por ruta exacta dentro de su propio entorno y reporta un estado nuevo ("faltan las herramientas de lectura") en vez de aparecer como "sin equipo".
5. **Panel de estado.** En Configuración → Macs lectores y en la barra del modal de ingreso se muestra ese estado nuevo con el enlace a "reinstalar el lector".
6. **Instrucciones actualizadas.** Se saca el paso "escribe la contraseña del Mac" y se explica que la instalación no pide clave; se agrega la nota de créditos de software libre.

## Detalles técnicos

- Descarga de herramientas: token anónimo de `ghcr.io` y bajada de blobs por digest (verificación por digest + `sha256` propio). Fórmulas fijadas: `libimobiledevice`, `libimobiledevice-glue`, `libplist`, `libusbmuxd`, `libtatsu`, `openssl@3`. Selección de etiqueta por arquitectura y versión de macOS con cascada hacia versiones anteriores.
- Reubicación: los binarios traen rutas absolutas de `/opt/homebrew`; se resuelven con `DYLD_FALLBACK_LIBRARY_PATH` apuntando a `runtime/lib` (válido porque son binarios con firma ad-hoc, no endurecidos). La variable se fija tanto en el `plist` de arranque como en el entorno con que el agente lanza cada herramienta.
- Node: tarball oficial `darwin-arm64` / `darwin-x64` con verificación contra `SHASUMS256.txt`.
- Sin `python3` ni `jq` en el instalador: JSON y checksums con `openssl dgst -sha256`, `awk`/`sed` y, después de instalar Node, con Node mismo.
- Nuevos endpoints: `/api/public/lector/runtime` (manifiesto con versiones fijadas y huellas) consumido por el instalador y por el agente para autodiagnóstico. `instalar.sh` deja de contener versiones incrustadas.
- El agente sube a la versión 1.1.0; la autoactualización existente (checksum SHA-256) sigue igual y ahora también revisa que el entorno esté completo.
- Escape de emergencia solo para soporte: variable `LECTOR_ENTORNO_LOCAL=1` para usar herramientas ya presentes en el Mac. No hay caída automática a Homebrew.

## Riesgo conocido y cómo se controla

No se puede probar macOS desde este entorno, así que el punto delicado es la reubicación de librerías. Por eso el instalador incluye la prueba real de ejecución y un modo `--diagnostico` que imprime qué falta. Si en el Mac de la tienda la prueba falla, el siguiente paso sería hospedar nosotros un paquete ya reubicado (armado una vez en un Mac) en lugar de reubicar en el momento; el instalador queda escrito para poder cambiar a ese origen sin tocar el resto.
