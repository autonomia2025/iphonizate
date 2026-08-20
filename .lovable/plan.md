# Diagnóstico y plan: stock invisible, bodega, digitación y carga desde Excel

## 1. Equipos que no aparecen en Stock ni en Inventario

### Lo que verifiqué

- **La sección "Stock" del sidebar está vacía desde el inicio.** `src/routes/stock.tsx` solo
  renderiza un título y una descripción (`SectionPage`), sin consulta ni tabla. Quien entra por
  "Stock" no ve ningún equipo, aunque existan.
- **Inventario sí muestra todos los estados.** El filtro por estado arranca en "Todos" y los chips
  se arman con los estados realmente presentes. Un equipo en POR_REVISAR o EN_TECNICO aparece.
- **`v_stock` no esconde nada por estado:** devuelve todos los equipos (con su tienda) y solo exige
  tener sesión con rol válido. No filtra por estado ni por tienda.
- **Datos reales hoy:** hay **un solo equipo** en la base, IMEI 354860470161877, en **POR_REVISAR**,
  con ubicación asignada y 3 servicios pendientes. O sea: el inventario está prácticamente vacío
  porque todavía no se ha cargado nada (de ahí el punto 4), y lo poco que hay está en un estado que
  no es vendible.
- **Camino actual de un equipo:**
  1. Ingreso (Inventario → Ingresar equipo). Si se marcan arreglos entra **POR_REVISAR**; si no se
     marca ninguno entra directo **DISPONIBLE**.
  2. POR_REVISAR → Técnico: se escanea en la sección Técnico y se asigna a un técnico → **EN_TECNICO**.
  3. Cuando el último servicio se marca listo → vuelve a **DISPONIBLE** automáticamente.
  4. Venta → VENDIDO; reserva → RESERVADO; garantía → GARANTIA.

### Causa raíz (dos, combinadas)

1. **"Stock" no existe como pantalla.** Es el nombre que la operación usa a diario y es una ruta
   vacía. Esto explica por sí solo el "ingreso equipos y no se ven".
2. **Callejón sin salida en POR_REVISAR.** Un equipo en POR_REVISAR **sin servicios pendientes** no
   puede avanzar: asignarlo a técnico se rechaza con "no necesita reparación", y no existe ninguna
   acción en la interfaz para marcarlo DISPONIBLE. Esto pasa exactamente en el caso de garantía
   resuelta con cambio: el equipo devuelto vuelve a POR_REVISAR sin servicios nuevos y queda
   atrapado: no aparece en Vender (solo lista DISPONIBLE de la tienda activa) ni en el conteo de
   caja, y solo se ve en Inventario si alguien filtra por ese estado.

### Arreglos propuestos

- Construir la pantalla **Stock** de verdad: equipos vendibles (DISPONIBLE) agrupados por tienda,
  con modelo, GB, color, batería, precio de lista (desde `precios`), días en stock y buscador.
  Chip opcional "ver también por revisar / en técnico / reservado" para no ocultar nada.
- En Inventario, mostrar contadores por estado en los chips (ej. "Por revisar 4") para que nadie
  crea que un equipo desapareció.
- Agregar en el panel de detalle del equipo la acción **"Marcar como disponible"** (roles dirección,
  jefe de tienda, administración, operaciones) para equipos en POR_REVISAR sin servicios pendientes,
  con registro en historial y auditoría. Esto cierra el callejón sin salida.
- En Técnico, cuando se escanee un equipo POR_REVISAR sin servicios, ofrecer agregarle arreglos en
  el momento en vez de un error seco.

## 2. Devolver equipos a bodega

### Cómo funciona hoy

- Existe la tienda **Bodega central** marcada como bodega, y el traslado se hace en **Movimientos**,
  eligiendo origen y destino: bodega ya es un destino posible, pero solo si el usuario descubre que
  hay que seleccionarla en el desplegable de destino.
- Roles permitidos: dirección, jefe de tienda, administración y operaciones. **El vendedor no puede
  trasladar nada.** El jefe de tienda solo puede sacar equipos de su propia tienda (origen queda
  fijado a su tienda), lo cual sí le permite devolver a bodega.
- No se pueden trasladar equipos VENDIDO, ENTREGADO ni RESERVADO.

### Arreglos propuestos

- Botón directo **"Devolver a bodega"** en Movimientos: deja origen en la tienda del usuario y
  destino en bodega de un clic, sin tocar los desplegables.
- La misma acción en el panel de detalle del equipo en Inventario y Stock, para un equipo puntual.
- Marcar visualmente la bodega en los desplegables ("Bodega central · bodega").
- Decisión pendiente para ti: si el **vendedor** debe poder devolver a bodega, hay que ampliar el
  permiso del traslado a ese rol (limitado a origen = su tienda y destino = bodega).

## 3. Todo lo pistoleable debe ser digitable

Revisión campo por campo:

| Pantalla | Estado actual |
| --- | --- |
| Ingreso de equipos (IMEI) | Digitable, valida 15 dígitos, se guarda con el botón. OK |
| Movimientos | Digitable, confirma con Enter. Falta botón "Agregar" visible |
| Técnico | Digitable, confirma con Enter. Falta botón "Agregar" visible |
| Venta (POS) | Digitable; agrega solo al llegar a 15 dígitos o con Enter. OK |
| Reservas | Igual que POS. OK |
| Garantías (ingreso y resolución con cambio) | Digitable con Enter. Falta botón visible |
| Cuadre de caja | Digitable, Enter y auto al llegar a 15 dígitos. OK |
| Buscador de Inventario | Filtra al escribir, pero **bloquea Enter** sin dar señal alguna |

Ningún campo obliga literalmente al lector, pero varios dependen de que el operador sepa que hay que
apretar Enter, y todos rechazan cualquier carácter que no sea dígito (un IMEI mal pistoleado se
"limpia" en silencio).

Arreglos propuestos, iguales en todas las pantallas:

- Botón "Agregar" al lado de cada campo de escaneo, además de Enter.
- Texto de ayuda unificado: "Escanea o escribe el IMEI y presiona Enter".
- Contador de dígitos en vivo (x/15) y mensaje claro cuando faltan o sobran dígitos, en vez de
  descartar en silencio.
- En el buscador de Inventario, Enter deja de ser un bloqueo: si lo escrito son 15 dígitos, abre
  directamente la ficha de ese equipo.
- Aceptar pegado desde el portapapeles y limpiar espacios/guiones en lugar de rechazar.

## 4. Importar equipos desde Excel o CSV

Propuesta: pantalla de importación dentro de Inventario, en cuatro pasos.

1. **Subir archivo** (.xlsx o .csv, arrastrar o seleccionar). Se lee en el navegador, no se guarda el
   archivo.
2. **Mapear columnas**: se detectan los encabezados y se proponen automáticamente
   (imei, modelo, gb, color, batería, categoría, costo, proveedor, lote, ubicación, notas, email
   vinculado). El usuario corrige el mapeo con desplegables. Obligatorios: IMEI, modelo, ubicación.
3. **Vista previa con validación fila por fila** antes de escribir nada:
   - IMEI exactamente 15 dígitos, sin repetirse dentro del archivo ni ya activo en el sistema.
   - GB dentro de las opciones válidas, batería 0-100, costo numérico (solo visible/importable para
     roles que ven costos), categoría dentro de las cuatro válidas, tienda existente por nombre.
   - Semáforo: filas listas, filas con aviso (dato opcional raro, se importa igual), filas con error.
4. **Confirmar**: se importan solo las filas válidas, en lotes, dentro de una operación que respeta
   las reglas actuales de IMEI y reingreso. Al final se muestra el resumen (importadas, omitidas) y
   se puede **descargar un CSV con las filas rechazadas y el motivo** para corregir y reintentar.

Reglas de decisión que quiero confirmar contigo:

- Filas con IMEI que ya está activo en el sistema: omitir siempre (mi recomendación) o actualizar la
  ficha existente.
- Equipos importados: entran todos **DISPONIBLE**, o **POR_REVISAR** si el archivo trae una columna
  de arreglos pendientes.

## Detalles técnicos

- Nueva ruta `src/routes/stock.tsx` sobre `v_stock` + `precios`, agrupada por tienda.
- Acción "Marcar como disponible": nueva función de base de datos con validación de rol, historial y
  auditoría (no se escribe el estado directo desde el cliente).
- "Devolver a bodega" reutiliza `trasladar_equipos`; solo cambia la interfaz, salvo que decidas
  habilitar al vendedor (ahí hay que ajustar la función).
- Importación: parseo en el navegador con SheetJS, inserción por lotes respetando los triggers de
  IMEI único y reingreso; el costo se envía solo si el rol ve costos.
