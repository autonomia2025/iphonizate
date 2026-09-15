# Dashboard de Oficina Central + comprobantes con garantía de 6 meses

## 1. Dashboard cuando estás en Oficina Central

Hoy el panel muestra solo la tienda seleccionada. Como Oficina Central no vende, al tenerla activa el panel pasa a modo cadena:

**Fila de arriba (hoy, sumando las 3 tiendas)**
- Ventas de hoy (equipos vendidos y boletas emitidas)
- Ingresos de hoy
- Ganancia de hoy, resaltada en verde flúor para que se note al entrar
- Stock disponible en la cadena

**Bloque del mes (igual a como está hoy, pero sumando las 3 tiendas)**
- Ventas del mes en equipos
- Ingresos del mes
- Ganancia del mes

**Abajo: cada tienda por separado**
Una tabla con una fila por tienda (Black Pink Phone, iPhonizate, Riffstore) mostrando ventas e ingresos de hoy, y ventas, ingresos y ganancia del mes, con el color de acento de cada tienda. La fila de totales cierra la tabla.

Las alertas, garantías, metas y últimas ventas siguen igual. Cuando la tienda activa es una de las 3 tiendas, el panel se ve exactamente como hoy: nada cambia para vendedores ni jefes de tienda.

La ganancia solo la ven los roles que hoy ya pueden verla (dirección y administración); para el resto se mantiene oculta.

## 2. Comprobantes más prolijos

Se rediseña el PDF para las 3 tiendas (queda mejor también en Riffstore, no solo en iPhonizate y Black Pink Phone):

- Encabezado con el nombre de la tienda en su color, número de comprobante y fecha bien alineados.
- Datos de la tienda en el encabezado: dirección, teléfono, Instagram y RUT.
- Detalle en tabla real con columnas alineadas (descripción, IMEI/color, monto) y filas alternadas suaves, sin que se corte el texto.
- Total destacado en una caja con el color de la tienda; recargo de boleta como línea aparte.
- Formas de pago con su monto, y el vendedor que atendió.
- Pie con la garantía: **6 meses** por fallas de fábrica, más las condiciones (qué cubre y qué no).
- Corrección del mismo texto de garantía en el correo del comprobante.

**Necesito de ti:** dirección, teléfono, Instagram y RUT de cada tienda (Black Pink Phone, iPhonizate, Riffstore) y el texto de condiciones de garantía que quieres usar. Sin eso dejo el comprobante con el diseño nuevo y la garantía de 6 meses, y agrego los datos en cuanto me los pases (no invento direcciones ni teléfonos).

## Detalles técnicos

- `src/routes/index.tsx`: cuando `tienda.es_bodega`, las consultas de ventas / `venta_items` / `v_ventas_full` dejan de filtrar por `tienda_id` y agrupan por tienda; se agrega una tabla resumen por tienda. Token nuevo para el verde flúor en `src/styles.css`.
- `src/lib/comprobante.server.ts`: `dibujarPdf` reescrito con layout tabular, caja de total y pie de garantía de 6 meses + condiciones; datos de contacto por tienda desde una constante en `src/lib/stores.ts`.
- `src/lib/email-templates/comprobante-venta.tsx`: texto de garantía a 6 meses.
- QA: se revisa el PDF renderizado antes de entregar y se valida el panel con la vista de Oficina Central.
