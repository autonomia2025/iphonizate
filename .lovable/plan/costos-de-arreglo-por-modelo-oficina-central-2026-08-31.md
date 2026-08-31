# Costos de arreglo por modelo + Oficina Central

## Qué se agrega

### 1. Catálogo de costos de arreglo por modelo
Nueva sección **Costos de arreglo** (junto a Precios, en el grupo Inventario) donde dirección, jefe de tienda y administración cargan a mano cuánto cuesta cada arreglo en cada modelo de iPhone.

- Tabla densa: filas = modelos de iPhone (todos los del catálogo: 11 a 17 Pro Max, más SE, mini, Plus, Air), columnas = tipos de arreglo (batería, pantalla, chasis, cámara, parlante, Face ID, puerto de carga, limpieza, homologación, otro).
- Edición en la celda: se hace clic, se escribe el monto en CLP y se guarda con Enter.
- Buscador por modelo y marca visual de las celdas sin costo cargado.
- Guarda quién actualizó y cuándo, igual que Precios.

### 2. Se refleja al ingresar un equipo
En el modal de ingresar equipo, al elegir el modelo y marcar los arreglos que necesita:

- Cada arreglo marcado aparece con su costo del catálogo ya rellenado según el modelo del equipo.
- El monto queda **editable**: si ese equipo salió más caro, se corrige a mano.
- Si el modelo no tiene costo cargado para ese arreglo, el campo queda vacío con la nota "sin costo cargado para este modelo".
- Se aplica el mismo autocompletado en la pantalla **Escanear equipo** al mandar un equipo a técnico.
- Solo ven montos los roles que ya pueden ver costos; nada cambia para vendedores.

### 3. Bodega pasa a ser Oficina Central
- El nombre cambia a **Oficina Central** en todo el sistema (sidebar, selectores de tienda, movimientos, etiquetas, reportes).
- El color de acento pasa a celeste más suave **#7DD3FC**.

## Detalle técnico

- Migración: tabla `costos_arreglo` (`modelo text`, `tipo tipo_servicio`, `costo bigint`, `updated_at`, `updated_by`), única por (`modelo`, `tipo`), con GRANT para `authenticated` y `service_role`, RLS: lectura para roles que ven costos vía `ve_costos`/`mi_rol()`, escritura solo `direccion`, `jefe_tienda`, `administracion`; trigger de auditoría como en `precios`.
- Actualización de datos: renombrar la tienda bodega a "Oficina Central" y su `color_acento` a `#7DD3FC` con run_sql.
- `src/lib/stores.ts`: entrada `bodega` → nombre "Oficina Central", hex/accent `#7DD3FC`.
- Nueva ruta `src/routes/costos-arreglo.tsx` + entrada en `src/lib/nav.ts` (grupo Inventario) y helper de permiso en `src/lib/gestion.ts`.
- `IngresarEquipoModal.tsx` y `escanear.tsx`: query de `costos_arreglo` por modelo; al marcar un arreglo se precarga el costo si el campo está vacío; el modelo se normaliza contra `modelos_apple` para calzar la fila.
- Sin cambios en la lógica de venta, márgenes ni en las RPC existentes.
