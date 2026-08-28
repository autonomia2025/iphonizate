# Lector de equipos por USB

Módulo completo para leer un iPhone conectado por cable en el Mac de la tienda y rellenar solo el ingreso a inventario. No se toca autenticación de roles, permisos ni ningún módulo existente (salvo el ajuste de duración de sesión que pediste).

## Cómo se va a ver en la tienda

1. El operador conecta el iPhone al Mac.
2. Arriba del modal "Ingresar equipo" aparece el estado del lector: sin lector, esperando iPhone, "Desbloquea y toca Confiar", leyendo, listo.
3. Al terminar la lectura se rellenan solos IMEI, IMEI2, modelo comercial, GB, serie, iOS, región, operador, ciclos de batería, iCloud y las banderas de riesgo. Cada campo rellenado lleva el distintivo "leído del equipo" y sigue editable.
4. El cursor salta primero a **salud de batería** y luego a **color**: son los dos únicos datos que se escriben a mano.
5. Si el IMEI ya existe activo en el sistema, el aviso sale de inmediato, antes de llenar nada.

Alertas: iCloud bloqueado en rojo mostrando la cuenta enmascarada; más de 800 ciclos en ámbar; más de 1200 ciclos en rojo.

## Las tres piezas

### 1. Agente de línea de comandos (Node.js, sin ícono, sin Gatekeeper)

- Se apoya en `libimobiledevice` (`brew install libimobiledevice`).
- Corre en segundo plano con launchd y arranca con el Mac.
- Sondea `idevice_id -l` cada 2 segundos. Ante un UDID nuevo ejecuta y captura:
  `ideviceinfo -u UDID`, `ideviceinfo -u UDID -q com.apple.disk_usage`,
  `idevicediagnostics -u UDID diagnostics GasGauge`.
- Sin emparejar: llama `idevicepair pair` y reporta el estado "esperando Confiar" (nunca falla en silencio).
- Parsea exactamente los campos del pedido (imei, imei2, meid, serie, serie_placa, udid, product_type, model_number, gb comerciales, ios_version, region, activado, operador, wifi_mac, bluetooth_mac, color_codigo, ciclos, capacidad de diseño, iCloud bloqueado y cuenta enmascarada desde NonVolatileRAM en Base64).
- **No** intenta salud de batería, ni color traducido, ni seriales de componentes.
- Manda todo al backend con su clave de Mac, más la salida cruda íntegra de los tres comandos.
- Latido cada 60 s con versión, hostname y estado.
- **Autoactualización**: una vez al día consulta el endpoint de versión; si hay una nueva, descarga el tarball, **verifica su checksum SHA-256** contra el que entrega el endpoint y solo entonces instala y se reinicia. Si el checksum no calza, aborta, avisa y sigue corriendo la versión anterior. La versión corriendo queda registrada por Mac.

### 2. Backend

Endpoints públicos autenticados por clave de agente (no por sesión de usuario):

- `POST /api/public/lector/lectura` — recibe la lectura, resuelve el modelo comercial y el color, guarda parseado + crudo.
- `POST /api/public/lector/estado` — latido y estado de emparejamiento/lectura.
- `GET /api/public/lector/version` — versión vigente **más el checksum SHA-256 del tarball**, para la autoactualización y el instalador.
- `GET /api/public/lector/instalar.sh` — instalador público de una línea.

Tablas nuevas:

- `lector_agentes`: un registro por Mac, con nombre, tienda, hash de la clave, versión, último latido, estado y activo/revocado.
- `lecturas_equipo`: cada lectura con todos los campos parseados, el `jsonb` crudo de los tres comandos, tienda, agente y fecha.
- `modelos_apple` (`product_type` → `modelo_comercial`), cargada de iPhone 11 hasta los modelos actuales.
- `colores_apple` (`product_type`, `device_color` → `color_comercial`), creada vacía. Si llega un `DeviceColor` desconocido se guarda igual, se muestra "Color sin identificar" y el operador escribe el color con opción "Recordar este color para futuros equipos", que crea la fila.
- Respaldos 3uTools: `equipos_reportes` (imei, archivo, quién subió) + bucket privado. Los sube y ve cualquiera con acceso a la ficha del equipo.

Reglas de acceso: las lecturas se ven solo desde la tienda dueña del agente (Dirección ve todas); las tablas de traducción las lee todo usuario autenticado y las edita quien ya puede editar precios.

### 3. Pantallas en la app

- **Modal de ingreso**: barra de estado del lector, autorrelleno con distintivos, foco encadenado, alertas de batería/iCloud y aviso de duplicado activo.
- **Ficha del equipo**: adjuntar y ver imágenes del Verification Report de 3uTools.
- **Precios**: dos pestañas nuevas para administrar `modelos_apple` y `colores_apple` con alta, edición e importación.
- **Configuración** (solo Dirección): Macs con agente, tienda, versión, si quedó desactualizado, última lectura; generar clave nueva por Mac (se muestra una sola vez, se entrega aparte) y revocarla. La clave nunca viaja en el enlace público del instalador.

## Instalación

Una línea pegada en la Terminal: instala Homebrew si falta, instala `libimobiledevice`, descarga el tarball del agente, **verifica su SHA-256 contra el checksum del endpoint de versión y aborta con un mensaje claro si no calza**, lo instala, lo registra en launchd y al final pide la clave de la tienda para guardarla en el archivo de configuración local.

## Sesiones

- Caducidad por inactividad en **12 horas**: cubre un turno completo sin volver a pedir PIN y al día siguiente arranca limpio. No se desactiva, porque son computadores de mostrador compartidos y la trazabilidad por persona depende de eso.
- Refresco automático del token de acceso en segundo plano, para que no se caiga a mitad de turno.
- Token no renovable: se limpia la sesión y se manda al login con el mensaje "Tu sesión expiró, vuelve a entrar". Nunca pantalla en blanco.
- Botón **Cerrar sesión** visible en el sidebar, para salir al terminar el turno sin cerrar el navegador.

## Detalles técnicos

- Backend con rutas de servidor de TanStack bajo `src/routes/api/public/lector/*` (no edge functions), validación Zod, clave de agente comparada por hash con comparación de tiempo constante.
- El modal escucha las lecturas por realtime sobre `lecturas_equipo` filtrado por tienda, con el mismo patrón de `useEquiposEnVivo`.
- El agente vive en `agente/` dentro del repo (Node puro, sin dependencias nativas), servido como tarball versionado desde la ruta pública.
- GB comerciales: se redondea `TotalDiskCapacity` a la escala 64/128/256/512/1024.
- Se guarda siempre el crudo, así cualquier dato futuro se recupera sin reconectar el equipo.
- Auth: `sessions.inactivity_timeout` desactivado y refresco rotativo activo.
