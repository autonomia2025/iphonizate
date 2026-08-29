# Trazabilidad por código de barras + bitácora, y ticket de venta

## 1. Etiqueta como "pasaporte" del equipo

La etiqueta Code 128 con el IMEI ya existe y se imprime desde Inventario y desde la ficha del
equipo. Se le agrega el empuje que falta:

- Al **ingresar un equipo** (manual o por lector USB), después de guardar aparece de inmediato el
  diálogo de impresión de etiqueta, con la medida que ya quedó guardada como preferencia.
- Al **cambiar de etapa** (traslado confirmado, mandar a técnico, devolver a bodega, marcar
  disponible) se ofrece reimprimir la etiqueta, por si la anterior se despegó o quedó ilegible.
- La etiqueta suma una línea corta con la etapa y la fecha, para que se lea a ojo sin escanear.

## 2. Pantalla "Escanear" (nueva sección)

Nueva ruta accesible para todos los roles, pensada para pistola de código de barras:

- Campo único siempre enfocado: escaneas y aparece la **ficha completa del celular** —modelo, GB,
  color, batería, categoría, estado, tienda actual, días en stock, precio de lista, costo solo para
  roles con permiso, email vinculado, proveedor y lote.
- Debajo, la **historia completa en una sola línea de tiempo**: ingreso, traslados entre tiendas,
  paso por técnico con cada arreglo y su estado, venta, garantía, y los comentarios de la bitácora,
  todo ordenado por fecha con autor y tienda.
- **Acciones según rol y estado**, sin salir de la pantalla: mandar a técnico con selección de
  arreglos, devolver a bodega, marcar disponible, imprimir etiqueta, agregar comentario.
- Si el IMEI no existe en el sistema, ofrece ingresarlo de una.
- Historial de los últimos equipos escaneados en la sesión, para volver atrás con un clic.

Además, **al escanear en cualquier módulo** (Inventario, Movimientos, Técnico, Garantías, Caja) se
puede abrir la misma ficha completa con la bitácora, en el panel lateral que ya existe.

## 3. Bitácora por evento (texto libre)

- Cada persona puede dejar un **comentario** en el equipo: queda con fecha, autor, rol y tienda.
- **Nadie edita ni borra** comentarios anteriores: el hilo es a prueba de manipulación, igual que la
  auditoría.
- Los comentarios se mezclan en la línea de tiempo junto a los eventos automáticos, así el que
  escanea entiende de inmediato "qué está pasando con ese celular".
- Aparece también en la ficha del equipo desde Inventario y Stock, no solo en Escanear.
- Al mandar a técnico o trasladar, el campo de comentario está a mano (opcional, no obliga a nadie).

## 4. Ticket de venta: verlo y encontrarlo

Hoy el ticket se genera en PDF al cerrar la venta, se guarda en el almacenamiento privado del
sistema y la venta queda con su número de comprobante y la ruta del archivo; se abre con un enlace
temporal desde la pantalla de éxito de la venta. El problema es que después de cerrar esa pantalla no
hay dónde volver a buscarlo.

- Te muestro el ticket real generado (con una venta de prueba) para que veas el diseño antes de
  seguir.
- Nueva sección **Comprobantes**: listado de ventas con número, fecha, tienda, vendedor, cliente,
  total y estado del envío por correo; con buscador por número, IMEI, cliente o rango de fechas.
- Desde cada fila: **ver/descargar el PDF**, reenviar por correo y, si una venta antigua no tiene
  comprobante generado, generarlo.
- El ticket sigue guardándose en el almacenamiento privado del sistema (solo accesible con enlace
  firmado temporal), nunca público.

## Detalles técnicos

- **Migración**: tabla `equipos_bitacora` (equipo_id, comentario, usuario_id, rol, tienda_id, fecha)
  con GRANT a `authenticated`/`service_role`, RLS por `puede_ver_tienda`, insert propio, y sin
  UPDATE/DELETE; función `agregar_comentario_equipo(_equipo, _texto)` security definer que valida
  visibilidad y escribe también en `auditoria`.
- **Timeline unificada**: vista `v_equipo_timeline` que une `equipos_historial`, `movimientos`,
  `servicios_equipo`, `equipos_bitacora` y la venta, con nombres de usuario y tienda ya resueltos.
- **Frontend**: nueva ruta `src/routes/escanear.tsx` y `src/routes/comprobantes.tsx` (+ entradas en
  `src/lib/nav.ts`); nuevo componente `EquipoTimeline` reutilizado en `EquipoDetalle`; reutilizo
  `CampoImei` y `EtiquetasModal`; en Comprobantes se usan las funciones de servidor de comprobante
  ya existentes para enlace firmado y reenvío.
