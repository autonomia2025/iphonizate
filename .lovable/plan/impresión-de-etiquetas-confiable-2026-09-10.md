# Impresión de etiquetas confiable

## Diagnóstico confirmado

- No aparecen errores de impresión en los registros disponibles porque el fallo ocurre dentro del navegador del usuario, no en el servidor.
- El botón actual devuelve “éxito” inmediatamente, pero la impresión real se intenta 200–300 ms después. Si Safari o Chrome la bloquean, la pantalla no puede detectarlo ni avisar correctamente.
- Ese retraso también pierde el permiso temporal generado por el clic del usuario, una causa habitual de que `window.print()` no abra el diálogo.
- El respaldo usa una URL temporal `blob:` y vuelve a imprimir automáticamente después de otro retraso; por eso repite el mismo punto débil.
- La etiqueta contiene SVG y texto generados localmente; no hay imágenes externas que justifiquen esperar antes de imprimir.

## Cambios

1. **Reemplazar la impresión silenciosa por una ventana de impresión visible y estable**
   - Abrirla directamente desde el clic del usuario.
   - Escribir la etiqueta inmediatamente, sin iframe transparente ni espera artificial.
   - Mostrar la etiqueta completa y un botón claro **Imprimir** dentro de esa ventana, para que Safari/Chrome reciban un gesto directo del usuario.

2. **Mantener un intento automático, sin dejar al usuario atrapado**
   - Intentar abrir el diálogo al cargar cuando el navegador lo permita.
   - Si lo bloquea, la ventana permanece abierta con la vista previa y el botón manual; nunca queda una acción que aparentemente funcionó pero no hizo nada.

3. **Unificar los dos botones actuales**
   - El botón principal abrirá la vista de impresión confiable.
   - Eliminar el camino redundante que hoy usa un iframe invisible y reporta un resultado incorrecto.
   - Mostrar instrucciones breves para elegir la Brother QL-800 y confirmar el tamaño configurado.

4. **Validar el flujo completo**
   - Probar desde ingreso de equipo, ficha individual y selección múltiple de inventario.
   - Verificar una etiqueta y varias etiquetas, tamaños Brother predefinidos y servicios pendientes.
   - Revisar en Chromium y emular el comportamiento restrictivo de Safari; confirmar que siempre queda una forma manual de imprimir aunque el diálogo automático sea bloqueado.

## Alcance

No se cambia el lector USB, la información de los equipos ni la lógica de inventario. El ajuste queda limitado a la generación y apertura de etiquetas.
