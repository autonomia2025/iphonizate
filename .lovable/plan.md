# Arreglar cierre de caja (Riffstore e iPhonizate)

## Qué pasa
El cierre del martes 27 de Riffstore, iPhonizate (y también Markt Store) quedó guardado como si fuera del **miércoles 28**. Por eso:
- El día 27 aparece como "sin cerrar".
- Hoy 28 la caja aparece **ya cerrada** (con los montos de ayer), y no deja cerrar la de hoy.

Causa: la pantalla de Caja calcula "el día" con la hora del computador que la usa. Esos cierres se hicieron desde un equipo con la zona horaria mal configurada (no Chile), así que la hora quedó corrida 7 horas y cayó en el día siguiente. Los montos están correctos; solo la fecha está mal.

## Qué voy a hacer
1. **Corregir los 3 cierres mal fechados** (Riffstore, iPhonizate, Markt Store del 27) para que queden en el día 27. Así hoy 28 se podrá cerrar normal.
2. **Hacer que Caja use siempre la hora de Chile**, sin importar cómo esté configurado el computador o celular: el día, los pagos del día y la fecha del cierre se calculan en horario de Santiago.
3. Revisar que no haya otros cierres anteriores con el mismo corrimiento y corregirlos igual.

## Detalles técnicos
- Datos: `update cierres_caja set fecha = fecha - interval '4 hours'` solo para filas con hora UTC 03:00 (las de las 3 tiendas del 28-10), verificando antes que no exista otro cierre ese día.
- `src/routes/caja.tsx`: `inicioDia/finDia` y `fecha` del insert pasan a construirse con offset de `America/Santiago` (Intl), no con hora local del navegador. Mismo helper para el valor inicial de "hoy".
- No se tocan montos, pagos ni equipos.
