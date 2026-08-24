-- 1. columna tienda_id en clientes
ALTER TABLE public.clientes ADD COLUMN tienda_id uuid REFERENCES public.tiendas(id);

-- 2. backfill: primera venta
UPDATE public.clientes c
SET tienda_id = v.tienda_id
FROM (
  SELECT DISTINCT ON (cliente_id) cliente_id, tienda_id
  FROM public.ventas
  WHERE cliente_id IS NOT NULL AND tienda_id IS NOT NULL
  ORDER BY cliente_id, fecha ASC
) v
WHERE v.cliente_id = c.id AND c.tienda_id IS NULL;

-- 3. backfill: primera reserva
UPDATE public.clientes c
SET tienda_id = r.tienda_id
FROM (
  SELECT DISTINCT ON (cliente_id) cliente_id, tienda_id
  FROM public.reservas
  WHERE cliente_id IS NOT NULL AND tienda_id IS NOT NULL
  ORDER BY cliente_id, fecha ASC
) r
WHERE r.cliente_id = c.id AND c.tienda_id IS NULL;

-- 4. backfill: tienda del usuario que lo creó (auditoría)
UPDATE public.clientes c
SET tienda_id = a.tienda_id
FROM (
  SELECT DISTINCT ON ((detalle->>'id')) (detalle->>'id') AS cliente_id, tienda_id
  FROM public.auditoria
  WHERE detalle ? 'id' AND tienda_id IS NOT NULL AND accion ILIKE '%cliente%'
  ORDER BY (detalle->>'id'), fecha ASC
) a
WHERE a.cliente_id = c.id::text AND c.tienda_id IS NULL;

-- 5. resto: primera tienda no bodega
UPDATE public.clientes c
SET tienda_id = (
  SELECT t.id FROM public.tiendas t WHERE NOT t.es_bodega ORDER BY t.created_at ASC LIMIT 1
)
WHERE c.tienda_id IS NULL;

ALTER TABLE public.clientes ALTER COLUMN tienda_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS clientes_tienda_id_idx ON public.clientes(tienda_id);

-- 6. RLS: cartera privada por tienda
DROP POLICY IF EXISTS "clientes lectura" ON public.clientes;
DROP POLICY IF EXISTS "clientes insert" ON public.clientes;
DROP POLICY IF EXISTS "clientes update" ON public.clientes;

CREATE POLICY "clientes lectura misma tienda" ON public.clientes
  FOR SELECT TO authenticated
  USING (public.mi_tienda() IS NOT NULL AND tienda_id = public.mi_tienda());

CREATE POLICY "clientes insert misma tienda" ON public.clientes
  FOR INSERT TO authenticated
  WITH CHECK (public.mi_rol() IS NOT NULL AND public.mi_tienda() IS NOT NULL AND tienda_id = public.mi_tienda());

CREATE POLICY "clientes update misma tienda" ON public.clientes
  FOR UPDATE TO authenticated
  USING (public.mi_tienda() IS NOT NULL AND tienda_id = public.mi_tienda())
  WITH CHECK (tienda_id = public.mi_tienda());

-- 7. buscador de equipos vendidos: oculta cliente de otras tiendas
CREATE OR REPLACE FUNCTION public.garantias_equipos_vendidos(_q text DEFAULT NULL::text, _limite integer DEFAULT 40)
 RETURNS TABLE(equipo_id uuid, imei text, modelo text, gb integer, color text, estado text, venta_id uuid, fecha_venta timestamp with time zone, tienda_venta text, cliente_nombre text, cliente_telefono text, dias_desde_venta integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ult AS (
    SELECT vi.equipo_id,
           v.id AS venta_id,
           v.fecha,
           v.tienda_id,
           tv.nombre AS tienda,
           c.nombre AS cliente,
           c.telefono,
           row_number() OVER (PARTITION BY vi.equipo_id ORDER BY v.fecha DESC) AS rn
    FROM public.venta_items vi
    JOIN public.ventas v ON v.id = vi.venta_id AND NOT v.anulada
    LEFT JOIN public.tiendas tv ON tv.id = v.tienda_id
    LEFT JOIN public.clientes c ON c.id = v.cliente_id
    WHERE vi.equipo_id IS NOT NULL
  ), vis AS (
    SELECT u.*, (public.mi_tienda() IS NOT NULL AND u.tienda_id = public.mi_tienda()) AS mia
    FROM ult u
  )
  SELECT e.id, e.imei, e.modelo, e.gb, e.color, e.estado::text,
         u.venta_id, u.fecha, u.tienda,
         CASE WHEN u.mia THEN u.cliente END,
         CASE WHEN u.mia THEN u.telefono END,
         floor(extract(epoch FROM (now() - u.fecha)) / 86400)::int
  FROM public.equipos e
  JOIN vis u ON u.equipo_id = e.id AND u.rn = 1
  WHERE e.estado IN ('VENDIDO','ENTREGADO')
    AND (
      _q IS NULL OR btrim(_q) = ''
      OR e.imei ILIKE '%' || btrim(_q) || '%'
      OR e.modelo ILIKE '%' || btrim(_q) || '%'
      OR (u.mia AND coalesce(u.cliente, '') ILIKE '%' || btrim(_q) || '%')
      OR (u.mia AND coalesce(u.telefono, '') ILIKE '%' || btrim(_q) || '%')
    )
  ORDER BY u.fecha DESC
  LIMIT greatest(1, least(coalesce(_limite, 40), 100))
$function$;

-- 8. búsqueda por IMEI directa: mismo criterio
CREATE OR REPLACE FUNCTION public.garantia_buscar_imei(_imei text)
 RETURNS TABLE(equipo_id uuid, imei text, modelo text, gb integer, color text, estado text, venta_id uuid, fecha_venta timestamp with time zone, tienda_venta text, cliente_nombre text, cliente_telefono text, dias_desde_venta integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.garantias_equipos_vendidos(btrim(coalesce(_imei, '')), 5)
  WHERE imei = btrim(coalesce(_imei, ''))
$function$;