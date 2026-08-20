# Implementación: stock, callejón sin salida, bodega, digitación e importación

Decisiones tomadas por ti ya incorporadas. Equipos atrapados hoy en POR_REVISAR sin arreglos
pendientes: **0** (el único equipo cargado tiene 3 arreglos pendientes, así que va bien encaminado).
El riesgo es futuro y estructural, y se cierra igual.

## 1. Pantalla Stock

Nueva pantalla real en la ruta "Stock":

- Equipos **DISPONIBLE** agrupados por tienda, con modelo, GB, color, batería, precio de lista
  (desde `precios`, cruzado por modelo + GB), días en stock y costo solo para roles con permiso.
- El precio de lista lo ven todos los roles. Aviso cuando un modelo no tiene precio cargado.
- Buscador por IMEI, modelo o color, con las mismas reglas de digitación del punto 4.
- Chips "ver también: por revisar · en técnico · reservado" para no esconder nada, apagados por
  defecto, con contador cada uno.
- Al hacer clic en una fila se abre la ficha del equipo (mismo panel lateral que Inventario).
- Actualización en vivo, igual que Inventario.

## 2. Cerrar el callejón sin salida

- **"Marcar como disponible"** en la ficha del equipo (Inventario y Stock), visible solo para
  dirección, jefe de tienda, administración y operaciones, y solo cuando el equipo está por revisar
  o en técnico sin arreglos pendientes. Se ejecuta por función de base de datos con validación de
  rol, registro en historial y en auditoría; el jefe de tienda solo en su tienda.
- **Técnico**: al escanear un equipo por revisar sin arreglos, en vez del error seco se abre la
  selección de arreglos ahí mismo (con costo para quien ve costos) y el equipo queda listo para
  asignar a un técnico. Nueva función de base de datos que suma los arreglos, actualiza el costo del
  equipo por vía de sistema y lo deja por revisar.
- **Inventario**: contadores por estado en los chips ("Por revisar 4"), y también en el chip "Todos".

## 3. Devolver a bodega

- Botón **"Devolver a bodega"** en Movimientos: fija origen en la tienda del usuario y destino en la
  bodega de un clic, y deja el foco en el campo de IMEI.
- La misma acción en la ficha del equipo, desde Inventario y desde Stock (traslado de un equipo).
- Los desplegables muestran la bodega como **"Bodega central · bodega"**.
- El **vendedor puede devolver a bodega**: se amplía la función de traslado para permitirlo con
  origen = su tienda y destino = una bodega, y nada más. Cualquier otro traslado le sigue vedado, y
  en su pantalla de Movimientos solo aparece el botón de devolver a bodega, sin desplegables.

## 4. Escaneo y digitación (todas las pantallas con IMEI)

Un único componente de campo de IMEI reutilizado en Inventario (ingreso), Movimientos, Técnico,
Vender, Reservas, Garantías (ingreso y cambio) y Caja:

- Botón "Agregar" al lado del campo, además de Enter.
- Texto de ayuda unificado: "Escanea o escribe el IMEI y presiona Enter".
- Contador en vivo x/15 y mensaje claro cuando faltan o sobran dígitos, sin descartar en silencio.
- Pegado desde el portapapeles aceptado: se limpian espacios, guiones y puntos en vez de rechazar.
- Buscador de Inventario: Enter deja de bloquear; con 15 dígitos abre la ficha de ese equipo.

## 5. Importación desde Excel o CSV

Botón "Importar desde Excel" en Inventario, para los roles que pueden ingresar equipos, con cuatro
pasos: subir archivo (.xlsx/.csv, leído en el navegador) → mapear columnas con detección automática →
vista previa validada fila por fila → confirmar.

Reglas aplicadas:

- IMEI ya activo en el sistema: **se omite siempre**, nunca se actualiza la ficha existente.
  IMEI repetido dentro del archivo: se importa la primera fila, las demás quedan rechazadas.
- Estado: **DISPONIBLE** por defecto; **POR_REVISAR** solo si la fila trae arreglos pendientes
  (columna de arreglos, separados por coma), que se crean como servicios pendientes.
- Limpieza de planilla sucia, con **aviso** en todo lo que se normalizó:
  - IMEI: se quitan espacios, guiones, puntos, comillas y notación científica de Excel. **14 dígitos
    o menos = error**, nunca se completa solo.
  - Batería: acepta "85%", "0.85", "85", "85,5" → 85. Fuera de 0-100 = error.
  - Montos (costo): puntos y comas de miles, "$", espacios → número entero.
  - GB: "128gb", "1TB" → 128 / 1024. Valor fuera de las opciones = aviso, se importa igual.
  - Categoría y tienda: por nombre, sin acentos ni mayúsculas; tienda inexistente = error,
    categoría desconocida = aviso y queda "seminuevo".
  - Filas sin fecha: se usa la fecha de importación (aviso).
  - Filas totalmente vacías: se ignoran sin contarlas como error.
- Semáforo con tres grupos: listas, con aviso (se importan) y con error (no se importan). Se puede
  revisar cada motivo antes de confirmar.
- Importación por lotes, respetando las reglas actuales de IMEI único y reingreso. El costo se envía
  solo si el rol ve costos.
- Al terminar: resumen y **descarga de CSV con las filas rechazadas y su motivo** para corregir y
  reintentar.

## Detalles técnicos

- **Base de datos (una migración):**
  - `marcar_equipo_disponible(_equipo)`: valida rol y tienda, exige cero arreglos sin terminar,
    escribe historial y auditoría.
  - `agregar_servicios_equipo(_equipo, _servicios)`: crea servicios pendientes, suma el costo por vía
    de sistema y deja el equipo por revisar.
  - `trasladar_equipos`: se amplía a vendedor con origen = su tienda y destino con `es_bodega`.
- **Frontend:** nueva ruta `src/routes/stock.tsx`; nuevo componente de campo de IMEI reutilizable;
  nuevo modal de importación (SheetJS para .xlsx, parseo propio para .csv); acciones nuevas en
  `EquipoDetalle`; ajustes en `movimientos.tsx`, `tecnico.tsx`, `inventario.tsx` y los demás campos de
  escaneo.
