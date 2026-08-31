# Por qué algunos equipos ven la app "en modo celular"

No es un perfil ni un rol distinto: el sistema decide entre vista de escritorio (sidebar fijo a la izquierda) y vista compacta (barra de navegación abajo) según el **ancho útil de la ventana del navegador**, no según el tamaño real del monitor.

Hoy el corte está en **900 px**. Si la ventana queda por debajo de eso, aparece la barra inferior. En la foto se ve exactamente eso: pantalla grande, pero la app en modo compacto. Causas típicas:

- Zoom del navegador alto (Cmd + "+"), muy común en pantallas 5K como la Studio Display.
- Ventana de Safari/Chrome sin maximizar o en Split View.
- Escalado del sistema en "Texto más grande".

En el caso de la foto, el contenido se ve estirado y con barra inferior, lo que apunta a **zoom del navegador**, no a un error del sistema.

## Qué propongo hacer

1. Bajar el corte de vista compacta de 900 px a 768 px, para que un monitor con zoom moderado siga mostrando el sidebar de escritorio.
2. Entre 768 px y 1100 px, usar el sidebar ya colapsado (solo iconos) para que quepa sin apretar las tablas.
3. En la pantalla de Configuración, mostrar una línea informativa con el ancho detectado y un aviso cuando el navegador está con zoom distinto de 100%, con la indicación de volver a 100% con Cmd+0.

## Detalle técnico

- `src/components/AppShell.tsx`: reemplazar las variantes `min-[900px]:` por `md:` (768 px) en sidebar, header, main y nav inferior; iniciar el sidebar colapsado cuando el ancho está entre 768 y 1100 px.
- `src/routes/configuracion.tsx`: bloque de diagnóstico de pantalla usando `window.innerWidth` y `window.devicePixelRatio` (solo lectura, sin cambios de datos).
- Sin cambios en base de datos, permisos ni lógica de negocio.
