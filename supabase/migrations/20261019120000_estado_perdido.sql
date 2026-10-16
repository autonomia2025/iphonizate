/* Estado nuevo para los equipos que faltan en un arqueo y se marcan como perdidos.
   Aplicar a mano desde el editor SQL (Lovable Cloud), SOLO, antes de 20261019130000_arqueo_bodega.sql:
   un valor nuevo de un enum no se puede usar en la misma ejecución en que se crea. */

alter type public.equipo_estado add value if not exists 'PERDIDO';
