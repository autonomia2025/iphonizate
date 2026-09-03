# Lector USB y etiquetas: qué está pasando y cómo lo arreglo

## Lo que revisé en el sistema (datos reales)

- El Mac lector **sí está funcionando**: "mostrador 1" (iMac-de-UPP-PHONES) tiene latido de hoy a las 12:38 hora Chile, versión 1.1.0, estado "Esperando iPhone".
- La lectura del iPhone **también funcionó**: el 1 de septiembre leyó un iPhone 17 Pro Max, IMEI 356889615684095, iOS 26.6, 275 ciclos de batería, iCloud bloqueado. O sea, la conexión con el iPhone y las herramientas están bien instaladas.

Entonces no es que la lectura falle: el problema es **dónde y cuándo se muestra**.

## Causa 1: el lector está registrado en Oficina Central

Ese Mac quedó asociado a la tienda **Oficina Central**. En el modal de "Ingresar equipo", la barra del lector busca el Mac de **la ubicación que está seleccionada en el formulario**. Si eliges iPhonizate, Black Pink Phone o Riffstore como ubicación, la barra dice "Sin lector conectado" aunque el Mac esté funcionando al lado.

## Causa 2: la lectura "caduca" a los 10 minutos

Una lectura de más de 10 minutos ya no se ofrece para autocompletar y desaparece de la pantalla sin explicación. Si conectan el iPhone, se demoran y después abren el modal, no ven nada.

## Causa 3: la impresión de etiquetas

La etiqueta se manda a imprimir desde un iframe oculto de tamaño 0 con `visibility:hidden`. En Safari (y en Chrome dentro de la ventana de vista previa de Lovable) eso termina en hoja en blanco o en que simplemente no se abre el diálogo de impresión: el navegador no imprime contenido que no tiene tamaño, y la vista previa embebida bloquea los diálogos del sistema.

## Qué voy a cambiar

1. **Lector independiente de la ubicación elegida**: la barra mostrará cualquier Mac lector vivo de la cadena, indicando a qué tienda pertenece, en vez de exigir que coincida con la ubicación del formulario.
2. **Lecturas antiguas visibles**: si la última lectura tiene más de 10 minutos, se muestra igual con la hora ("leído hace 2 h") y el botón "Usar esta lectura", en vez de esconderse.
3. **Mensajes claros de estado**: cuando el Mac está vivo pero sin iPhone, se dirá qué hacer (conectar con cable original, desbloquear, tocar Confiar); cuando no hay contacto, se dirá desde cuándo.
4. **Impresión que sí sale**: el iframe pasa a tener el tamaño real de la etiqueta (fuera de pantalla, no oculto), se espera a que carguen las imágenes/SVG antes de imprimir, y se agrega un botón "Abrir etiqueta en pestaña nueva" como respaldo para Safari y para cuando se está usando la vista previa embebida. En la vista previa dentro de Lovable seguirá siendo necesario abrir la app en su propia pestaña para que aparezca el diálogo de impresión.
5. **Panel de Macs lectores**: mostrar la tienda del Mac y permitir cambiarla, para poder mover "mostrador 1" a la tienda que corresponda sin reinstalar nada.

## Detalles técnicos

- `src/components/inventario/useLectorUsb.ts`: consulta de agente/lectura sin filtro estricto por `tienda_id` (fallback al último agente vivo con `activo = true`), devolver `lecturaUtil` con antigüedad en vez de descartarla.
- `src/components/inventario/BarraLector.tsx`: mostrar tienda del agente, antigüedad de la lectura y textos de ayuda por estado.
- `src/lib/etiquetas.ts`: `imprimirEtiquetas` con iframe dimensionado y `onload` real; nueva `abrirEtiquetasEnPestana` usando un blob URL.
- `src/components/inventario/EtiquetasModal.tsx`: botón secundario "Abrir en pestaña nueva".
- `src/components/configuracion/PanelLectores.tsx`: columna tienda + selector para reasignar (UPDATE de `lector_agentes` ya permitido solo a dirección).

No se toca el agente de macOS ni el instalador: están funcionando.
