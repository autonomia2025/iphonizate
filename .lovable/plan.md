# Diagnóstico: equipos que "desaparecen", "vuelven" y lentitud

## Qué encontré (con datos reales)

Ningún dato se borra solo. Hay tres problemas distintos:

1. **La lista se corta en 1.000 equipos.** Hoy hay 1.318 equipos en la base (267 disponibles, 933 vendidos, 107 en revisión o con el técnico, 11 entregados). El sistema solo trae los primeros 1.000 en Inventario y Stock, así que los más antiguos dejan de aparecer aunque siguen guardados. Por eso parece que "se registran y luego desaparecen". La cuenta cuadra: se han ingresado 1.332 equipos y faltan 14, que son justo los 14 que alguien borró a mano.
2. **Los borrados fueron a mano y quedaron registrados.** Desde el 25-09, Liz borró 14 equipos y 13 ventas, y Renato borró 1 venta. Cuando se borra una venta, el iPhone vuelve a quedar disponible y la venta desaparece del historial. El PDF del comprobante sigue guardado, así que se ve "la venta y el comprobante, pero el equipo volvió".
3. **Equipos vendidos que "volvieron".** Hay 12 equipos con una venta vigente que hoy figuran en "Por revisar" o "Con el técnico". Casi todos los cambió Liz (algunos Alanís) después de la venta, sobre todo por garantías o porque volvieron a ingresar un IMEI que ya existía. La venta sigue, pero el equipo ya no dice "Vendido".
4. **Lentitud:** cada vez que se abre Inventario se descarga la base completa de costos (unas 3.400 veces, casi medio segundo cada una). Los paneles de ventas también tardan 1 a 3 segundos. No hace falta pagar más: hay que optimizar.

## Qué propongo arreglar

1. Inventario, Stock y los demás listados traerán todos los equipos, en tandas, sin el tope de 1.000. Lo mismo para los paneles de ventas que tienen límites fijos.
2. Al borrar una venta, la confirmación lo dejará claro: el equipo vuelve a stock. En Auditoría habrá un filtro de "Borrados" con quién lo hizo, cuándo y el IMEI.
3. Si un equipo vendido vuelve a ingresar, se pedirá un motivo (garantía, devolución o error) y quedará anotado en la bitácora del equipo. En Inventario habrá un aviso "tiene venta registrada".
4. Velocidad: los costos se pedirán solo de los equipos que se están mostrando, y se agregarán índices en la base para ventas y equipos.
5. Un informe con los 14 equipos borrados, las 14 ventas borradas y los 12 equipos que volvieron, para que el cliente los revise.

## Detalles técnicos
- PostgREST limita a 1.000 filas. Se pagina con `.range()` en un bucle en `inventario.tsx`, `stock.tsx` y `index.tsx`.
- `v_equipos_full` se filtra por `id in (...)` de las filas visibles.
- Migración: índices en `ventas(fecha, tienda_id)`, `venta_items(equipo_id)` y `equipos(fecha_ingreso)`. Al trigger de reingreso se le agrega una nota en la bitácora.
- No cambia quién puede borrar (sigue siendo solo Renato y Liz).
