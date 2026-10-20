/* Estado nuevo para los equipos que faltaron en un arqueo y todavía no se resuelven.
   Aplicar a mano desde el editor SQL (Lovable Cloud), SOLO, antes de 20261021130000_pendientes_arqueo.sql:
   un valor nuevo de un enum no se puede usar en la misma ejecución en que se crea. */

alter type public.equipo_estado add value if not exists 'PENDIENTE';
