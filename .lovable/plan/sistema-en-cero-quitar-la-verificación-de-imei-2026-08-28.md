# Sistema en cero + quitar la verificación de IMEI

Dos trabajos en uno: dejar la base de datos limpia como si el sistema recién se estrenara, y eliminar por completo la verificación de IMEI de imeicheck.

## 1. Limpieza de datos

Se borra todo lo operativo:

- Equipos (3), su historial, servicios de taller y reportes
- Ventas (1), ítems de venta, pagos, reservas e ítems de reserva
- Clientes (1), garantías, movimientos, gastos, tareas, metas, cierres de caja
- Accesorios y su stock
- Lista de precios (1) y técnicos (1)
- Los 3 Macs lectores y todas sus lecturas
- Verificaciones de IMEI guardadas
- Bitácora de auditoría (queda vacía, con el registro de esta limpieza)

Se conserva:

- Las 4 tiendas
- Los 11 usuarios con sus roles, PIN y permisos
- El catálogo de modelos y colores Apple

Nota: al borrar los Macs lectores, cada Mac queda desvinculado. Para volver a usarlos hay que crear el lector otra vez en Configuración y correr la instalación con la clave nueva.

Los comprobantes PDF ya generados quedan huérfanos en el almacenamiento; también se limpian para no dejar archivos de ventas que ya no existen.

## 2. Quitar la verificación de IMEI

Se elimina de la interfaz:

- El bloque "Verificación del IMEI" del modal Ingresar equipo
- El bloque de verificación en el detalle del equipo
- Toda la sección de imeicheck en Configuración: saldo, aviso de saldo bajo, consumo de 30 días, servicio y ambiente

Configuración queda solo con los Macs lectores.

Se mantiene: la validación local del IMEI (15 dígitos y dígito verificador Luhn), que no depende de ningún servicio externo, y las alertas de iCloud/batería que entrega el lector USB al leer el equipo por cable.

## Detalle técnico

- Migración con `DELETE` en orden de dependencias (hijos antes que padres) sobre: `servicios_equipo`, `equipos_historial`, `equipos_reportes`, `venta_items`, `reserva_items`, `pagos`, `ventas`, `reservas`, `garantias`, `movimientos`, `clientes`, `equipos`, `accesorios_stock`, `accesorios`, `gastos`, `tareas`, `metas`, `cierres_caja`, `precios`, `tecnicos`, `lecturas_equipo`, `lector_agentes`, `imei_verificaciones`, y por último `auditoria`. Se hace en una sola transacción; los triggers de auditoría e inmutabilidad se sortean con las funciones de sistema ya existentes o desactivando el trigger dentro de la migración.
- Se eliminan las tablas `imei_verificaciones` e `imeicheck_config`, y las funciones `guardar_verificacion_equipo` y `registrar_riesgo_imei` junto con el trigger `fn_equipos_verificacion_protegida` y `fn_imeicheck_config_touch`.
- Las columnas de verificación en `equipos` (`icloud_activo`, `lista_negra`, `bateria`, etc.) se conservan porque el lector USB las llena.
- Archivos eliminados: `src/lib/imeicheck.functions.ts`, `src/lib/imeicheck.server.ts`, `src/lib/imeicheck.logica.server.ts`, `src/components/inventario/VerificarImeiPanel.tsx`.
- `src/lib/imeicheck.ts` se reduce a la validación Luhn y se renombra a `src/lib/imei.ts`; `VerificacionEquipo.tsx` se recorta a mostrar solo alertas (sin botón de verificar) para que `inventario.tsx` y `vender.tsx` sigan marcando equipos con alerta.
- Se limpian los objetos del bucket `comprobantes`.
- El secreto `IMEICHECK_API_KEY` queda sin uso; se puede borrar después si quieres.
