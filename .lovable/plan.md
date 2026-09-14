# Sistema en cero + borrar iPhones solo Renato y Liz

## 1. Dejar la base como recién estrenada

Se borra todo lo operativo que se generó probando:

- 7 equipos, su historial, comentarios, servicios de taller y reportes
- 6 ventas con sus ítems y pagos, más reservas e ítems de reserva
- 6 clientes, 1 garantía, 4 movimientos
- 1 técnico, 1 meta, cierres de caja, tareas
- 1 Mac lector con todas sus lecturas
- Verificaciones de IMEI guardadas
- Bitácora de auditoría (383 registros), que queda vacía salvo el registro de esta limpieza
- Los comprobantes PDF ya generados en el almacenamiento

Se conserva:

- Las tiendas y los 11 usuarios con su rol, PIN y permisos
- Todo Finanzas: las 17 personas, la nómina de enero a agosto, gastos, plantillas, impuestos y parámetros
- Catálogo de modelos y colores Apple, lista de precios y costos de arreglo

Aviso importante: al borrar el Mac lector "mostrador 1", ese Mac queda desvinculado. Para volver a usarlo hay que crear el lector otra vez en Configuración y correr la instalación con la clave nueva.

## 2. Borrar iPhones: solo Renato y Liz

Hoy cualquier persona con rol dirección, jefe de tienda, administración u operaciones ve el botón Eliminar, y el borrado se bloquea cuando el equipo tiene historial.

Queda así:

- El botón Eliminar solo aparece para Renato y Liz. Nadie más lo ve, incluida Valentina Galaz (que también es dirección) y los jefes de tienda.
- Renato y Liz pueden borrar cualquier iPhone, sin importar su estado ni su historial: vendido, reservado, en garantía o con arreglos. Al borrarlo se elimina también todo lo colgado de ese equipo.
- Se mantiene la confirmación antes de borrar, con un aviso más claro de que el borrado es definitivo y arrastra ventas y movimientos asociados.
- Cada borrado queda registrado en la bitácora de auditoría con quién lo hizo y el IMEI.

## Detalle técnico

Migración única:

1. `DELETE` en orden de dependencias sobre `servicios_equipo`, `equipos_historial`, `equipos_bitacora`, `equipos_reportes`, `venta_items`, `reserva_items`, `pagos`, `ventas`, `reservas`, `garantias`, `movimientos`, `clientes`, `equipos`, `tecnicos`, `metas`, `cierres_caja`, `tareas`, `lecturas_equipo`, `lector_agentes`, `imei_verificaciones`, y por último `auditoria`. Todo en una transacción, con `session_replication_role`/desactivación temporal de los triggers de auditoría e inmutabilidad para poder vaciar `auditoria`, `equipos_bitacora`, `equipos_historial`, `movimientos` y `lecturas_equipo`.
2. Nueva función `public.puede_borrar_equipos()` (security definer) que devuelve verdadero solo para los `usuarios.id` de Renato (`d0e7f20b-…`) y Liz (`fcfa5a07-…`), resueltos por nombre en la migración para no depender de UUID escritos a mano.
3. `eliminar_equipo(_equipo uuid)` se reescribe: valida `puede_borrar_equipos()`, ya no bloquea por estado ni por trazabilidad, borra en cascada manual `servicios_equipo`, `equipos_bitacora`, `equipos_historial`, `equipos_reportes`, `movimientos`, `venta_items`, `reserva_items` del equipo y luego el equipo; inserta un registro en `auditoria` con acción `equipo_eliminado`.
4. Se recalcula el total/ganancia de las ventas que pierdan ítems, y las ventas que queden sin ítems se marcan como anuladas en lugar de dejarlas en cero silencioso.

Frontend:

- `src/components/inventario/EquipoDetalle.tsx`: `puedeEliminar` pasa a consultar el nuevo permiso en vez de la lista de roles y los estados; texto de confirmación actualizado.
- Los objetos del bucket `comprobantes` se limpian.
