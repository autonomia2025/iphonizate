# Comprobante de venta en PDF + correo al cliente

## 1. Arreglar la creación de clientes (primero)

Causa confirmada: Renato y Valentina (Dirección) y Liz (Administración) no tienen tienda asignada en su ficha, y la regla de la base de datos exige que el cliente sea "de tu tienda". Con tienda vacía, la base de datos rechaza crear y ver clientes.

Solución elegida: usar la tienda activa.

- Quien no tiene tienda fija (Dirección, Administración) puede crear y ver clientes de cualquiera de las tiendas, es decir la que tenga seleccionada en pantalla.
- Quien tiene tienda fija (jefe de tienda, operaciones, vendedores) sigue viendo solo su cartera, sin cambios.
- Las carteras siguen separadas por tienda: un cliente pertenece a una sola tienda.

## 2. Comprobante en PDF por cada venta

Al registrar la venta, el sistema genera el comprobante automáticamente:

- Encabezado con la tienda (nombre y color de acento), número de comprobante y fecha.
- Datos del cliente si hay uno asignado.
- Detalle: equipos con modelo, GB, color e IMEI; accesorios con cantidad.
- Recargo de boleta cuando aplica, total en formato $1.234.567.
- Formas de pago con monto por método.
- Vendedor que atendió y pie con garantía de la tienda.

Se guarda en el sistema y queda pegado a la venta: desde "Revisión de pagos" y desde la pantalla de venta exitosa aparece el botón "Ver comprobante" para abrir o volver a descargar el PDF. Si la venta se anula, el comprobante queda marcado como anulado.

## 3. Correo al cliente

- En el modal de cliente nuevo y en la venta, el correo pasa a ser el campo destacado (opcional: si no hay correo, la venta se registra igual y solo queda el PDF guardado).
- Al cerrar la venta se envía un correo con el comprobante: diseño limpio, con el detalle de la compra, el total y un enlace seguro para descargar el PDF (los correos no admiten archivos adjuntos, así que el PDF va como enlace de descarga, válido por 30 días y renovable desde el sistema).
- En la pantalla de venta exitosa se ve el estado del envío: "Comprobante enviado a correo@cliente.cl", o un aviso con botón "Reenviar" si falló.
- Dominio de envío: `iphonizate.app`. Requiere configurar el dominio de correo (te abro el cuadro de configuración y verifico DNS antes de activar los envíos).

## 4. Tu duda del lector de iPhone

Se instala una sola vez por Mac. Queda como servicio del sistema: arranca solo al encender el computador y sigue corriendo aunque cierren el navegador o el sistema. No hay que instalarlo cada vez.

Solo hay que volver a instalar si: cambian de Mac, formatean el Mac, o revocan la clave de ese Mac desde Configuración. Además el agente se actualiza solo (revisa una vez al día y verifica el archivo antes de instalarlo), así que tampoco hay que reinstalar por versiones nuevas.

## Detalles técnicos

- Migración: políticas de `clientes` reescritas para que INSERT/SELECT/UPDATE acepten `tienda_id` cuando `public.mi_tienda()` calza **o** cuando el rol es `direccion`/`administracion` (sin tienda asignada), manteniendo la separación por tienda para el resto.
- Migración: columnas `comprobante_ruta`, `comprobante_numero` y `comprobante_email_estado` en `ventas`; bucket privado `comprobantes` con acceso solo por enlace firmado desde el servidor.
- PDF generado en el servidor con `pdf-lib` (JS puro, compatible con el runtime de la app) desde un server function `generarComprobanteVenta`, que lee la venta con RLS del usuario, sube el PDF al bucket y guarda la ruta en la venta.
- Correo con `email_domain--scaffold_transactional_email_templates` y plantilla React Email `comprobante-venta`, enviada desde el servidor con `idempotencyKey` por venta para no duplicar. El enlace del PDF es una URL firmada de Storage.
- `src/routes/vender.tsx` y `VentaExito.tsx`: tras `registrar_venta`, llamada al server function; botones "Ver comprobante" y "Reenviar correo".
- QA: se revisa el PDF renderizado página por página (márgenes, cortes de texto, tabulares) antes de entregar.
