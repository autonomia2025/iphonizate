# Verificación de IMEI: corregir, validar y guardar en el equipo

## Lo que está mal hoy (verificado contra la respuesta real de la API)

Consulté la última verificación guardada en la base. La API **no** devuelve `apple/modelName`, `warrantyStatus` ni `purchaseCountry`. Devuelve estas llaves:

```text
modelDesc, deviceName, apple/region, serial, imei, imei2, meid, image,
fmiOn, gsmaBlacklisted, simLock, replaced, loaner, demoUnit,
estPurchaseDate, usaBlockStatus
```

Por eso "Modelo detectado" sale "Sin dato": el mapeo busca una llave que no llega. Las llaves con barra se leen siempre con `properties["apple/region"]`, nunca con punto.

### Mapeo tolerante a cambios de llaves

Estas llaves vienen del servicio 12 de Sandbox (datos simulados), así que el mapeo acepta varias alternativas por dato, en orden de preferencia:

- modelo → `modelDesc`, `apple/modelName`, `model`, `deviceName`
- región / país → `apple/region`, `purchaseCountry`, `country`
- garantía → `warrantyStatus`, `warranty`, `coverage`

Si ninguna coincide, el panel muestra "Sin dato" y nada se rompe. Cuando llegue una llave desconocida (no contemplada en el mapeo), queda un aviso en los registros del servidor para ver de inmediato qué cambió al pasar a Live.

### La respuesta cruda se guarda siempre

El `properties` completo, tal cual llega, se guarda en `imei_verificaciones` incluso cuando el mapeo no reconoce nada. Así, si mañana Live trae capacidad o color en una llave que hoy ignoramos, se recuperan de las consultas ya pagadas.


## 1. Errores en español, nunca crudos

Se clasifica la respuesta de la API en tres casos distintos y se traduce cada uno:

- Error de validación de la API (`deviceId` inválido) → "Ese IMEI no es válido. Revisa que los 15 dígitos estén correctos."
- `serviceId` inválido → "El servicio configurado no existe. Revisa la configuración."
- Sin saldo → "Sin saldo para verificar. Recarga en imeicheck.net."
- Clave inválida → "La clave de la API no es válida."
- La API respondió `unsuccessful` → "No se encontró información para este IMEI."
- No respondió / tiempo agotado → "No se pudo conectar con el servicio de verificación."

El detalle técnico completo (cuerpo del error, código HTTP) se registra solo en los registros del servidor. En los seis casos el ingreso manual sigue disponible igual que hoy.

## 2. Validación local antes de gastar consulta

Se agrega el cálculo del dígito verificador (Luhn) en el campo de IMEI. El indicador dirá "válido" solo si tiene 15 dígitos **y** pasa Luhn; si no pasa, dirá "dígito verificador incorrecto" y el botón Verificar queda deshabilitado. El ingreso manual del equipo no se bloquea por esto.

## 3. Guardar la verificación en el equipo

Nuevas columnas en `equipos` (se reutiliza la columna `serie` existente): `imei2`, `icloud_activo`, `lista_negra`, `bloqueo_operador`, `reemplazado_apple`, `garantia_estado`, `pais_compra`, `fecha_compra_estimada`, `bloqueo_usa`, `verificado_at`, `riesgo_aceptado_por`, `riesgo_aceptado_at`.

Se llenan **solo desde el servidor**: una función del servidor consulta la API y escribe la fila. El cliente no puede escribir estos campos (regla de acceso que los deja de solo lectura para la aplicación). Los ve cualquier rol.

- Al ingresar un equipo verificado, todos los campos quedan grabados solos. "Usar este dato" sigue existiendo solo para el Modelo.
- Si el usuario marcó el checkbox de riesgo, se guarda quién y cuándo.

## 4. Verificar equipos ya ingresados

Acción "Verificar IMEI" en el detalle de cualquier equipo: consulta la API y actualiza la fila. Sirve para equipos viejos sin verificar y para revisar de nuevo uno que ya fue desvinculado de iCloud.

## 5. Dónde se ve

- **Detalle del equipo**: sección "Verificación de IMEI" con todos los datos y la fecha. Si nunca se verificó, "Sin verificar" con botón para hacerlo ahí mismo.
- **Inventario y Stock**: distintivo rojo junto al IMEI cuando hay iCloud activo o lista negra.
- **Inventario**: chip de filtro "Con alertas" con contador.
- **Vender**: al agregar al carrito un equipo con iCloud activo o lista negra, advertencia visible antes de confirmar. No bloquea la venta.

## Detalle técnico

- Migración: columnas nuevas en `public.equipos` (`riesgo_aceptado_por` referencia `usuarios(id)`), índice parcial para el filtro de alertas, y recreación de `public.v_stock` agregando `serie, imei2, icloud_activo, lista_negra, bloqueo_operador, reemplazado_apple, garantia_estado, pais_compra, fecha_compra_estimada, bloqueo_usa, verificado_at` (Inventario y Stock leen de esa vista).
- Nueva función RPC `security definer` `guardar_verificacion_equipo(...)` invocada únicamente por la función del servidor, más un trigger que rechaza modificaciones de estos campos desde el cliente.
- `src/lib/imeicheck.ts`: reescribir `leerPropiedades` con las llaves reales; `alertasDeVerificacion` suma `loaner`/`demoUnit` como informativas; agregar `luhnValido`.
- `src/lib/imeicheck.server.ts`: distinguir error de validación (422/400 con `errors.deviceId` / `errors.serviceId`) de caída de red; `console.error` del cuerpo crudo; nuevos motivos `imei_invalido`, `servicio_invalido`, `sin_respuesta`.
- `src/lib/imeicheck.logica.server.ts` + `imeicheck.functions.ts`: nueva función `verificarYGuardarEquipo({ equipoId })` que verifica y persiste; `ejecutarVerificacion` devuelve también los campos listos para guardar.
- `src/components/CampoImei.tsx`: Luhn en el indicador; `src/components/inventario/VerificarImeiPanel.tsx`: mensajes por motivo, botón deshabilitado sin Luhn, y devolver al modal los campos a guardar.
- `src/components/inventario/IngresarEquipoModal.tsx`: pasar los campos verificados al insert (vía la función del servidor) junto con el riesgo aceptado.
- `src/components/inventario/EquipoDetalle.tsx`, `src/routes/inventario.tsx`, `src/routes/stock.tsx`, `src/routes/vender.tsx`: sección de verificación, distintivo rojo, chip "Con alertas" y advertencia en el carrito.
