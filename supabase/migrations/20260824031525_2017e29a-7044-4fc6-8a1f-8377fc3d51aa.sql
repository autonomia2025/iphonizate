-- =====================================================================
-- 1. Permisos por usuario
-- =====================================================================
CREATE TABLE public.permisos_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  permiso text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, permiso)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.permisos_usuario TO authenticated;
GRANT ALL ON public.permisos_usuario TO service_role;

ALTER TABLE public.permisos_usuario ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.tiene_permiso(_permiso text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.permisos_usuario p
    JOIN public.usuarios u ON u.id = p.usuario_id
    WHERE u.auth_user_id = auth.uid()
      AND u.activo
      AND p.permiso = _permiso
  )
$$;

CREATE POLICY "permisos lectura" ON public.permisos_usuario
  FOR SELECT TO authenticated USING (public.mi_rol() IS NOT NULL);

CREATE POLICY "permisos insert" ON public.permisos_usuario
  FOR INSERT TO authenticated
  WITH CHECK (public.tiene_permiso('permisos.administrar'));

CREATE POLICY "permisos update" ON public.permisos_usuario
  FOR UPDATE TO authenticated
  USING (public.tiene_permiso('permisos.administrar'));

CREATE POLICY "permisos delete" ON public.permisos_usuario
  FOR DELETE TO authenticated
  USING (public.tiene_permiso('permisos.administrar'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_permisos_usuario_updated_at
  BEFORE UPDATE ON public.permisos_usuario
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Metas: crear/editar solo con permiso explícito por usuario
DROP POLICY IF EXISTS "metas insert" ON public.metas;
DROP POLICY IF EXISTS "metas update" ON public.metas;

CREATE POLICY "metas insert" ON public.metas
  FOR INSERT TO authenticated
  WITH CHECK (public.tiene_permiso('metas.editar'));

CREATE POLICY "metas update" ON public.metas
  FOR UPDATE TO authenticated
  USING (public.tiene_permiso('metas.editar'));

-- =====================================================================
-- 2. Buscador de equipos vendidos (garantías)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.garantias_equipos_vendidos(_q text DEFAULT NULL, _limite integer DEFAULT 40)
RETURNS TABLE(
  equipo_id uuid, imei text, modelo text, gb integer, color text, estado text,
  venta_id uuid, fecha_venta timestamptz, tienda_venta text,
  cliente_nombre text, cliente_telefono text, dias_desde_venta integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ult AS (
    SELECT vi.equipo_id,
           v.id AS venta_id,
           v.fecha,
           tv.nombre AS tienda,
           c.nombre AS cliente,
           c.telefono,
           row_number() OVER (PARTITION BY vi.equipo_id ORDER BY v.fecha DESC) AS rn
    FROM public.venta_items vi
    JOIN public.ventas v ON v.id = vi.venta_id AND NOT v.anulada
    LEFT JOIN public.tiendas tv ON tv.id = v.tienda_id
    LEFT JOIN public.clientes c ON c.id = v.cliente_id
    WHERE vi.equipo_id IS NOT NULL
  )
  SELECT e.id, e.imei, e.modelo, e.gb, e.color, e.estado::text,
         u.venta_id, u.fecha, u.tienda, u.cliente, u.telefono,
         floor(extract(epoch FROM (now() - u.fecha)) / 86400)::int
  FROM public.equipos e
  JOIN ult u ON u.equipo_id = e.id AND u.rn = 1
  WHERE e.estado IN ('VENDIDO','ENTREGADO')
    AND (
      _q IS NULL OR btrim(_q) = ''
      OR e.imei ILIKE '%' || btrim(_q) || '%'
      OR e.modelo ILIKE '%' || btrim(_q) || '%'
      OR coalesce(u.cliente, '') ILIKE '%' || btrim(_q) || '%'
      OR coalesce(u.telefono, '') ILIKE '%' || btrim(_q) || '%'
    )
  ORDER BY u.fecha DESC
  LIMIT greatest(1, least(coalesce(_limite, 40), 100))
$$;

REVOKE ALL ON FUNCTION public.garantias_equipos_vendidos(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.garantias_equipos_vendidos(text, integer) TO authenticated;

-- =====================================================================
-- 3. Costos: vistas controladas + cierre de columnas sensibles
-- =====================================================================
CREATE OR REPLACE VIEW public.v_accesorios AS
SELECT a.id, a.nombre, a.categoria, a.tipo, a.modelo, a.precio, a.minimo, a.created_at,
       CASE WHEN public.ve_costos() THEN a.costo ELSE NULL END AS costo
FROM public.accesorios a
WHERE public.mi_rol() IS NOT NULL;

CREATE OR REPLACE VIEW public.v_servicios_equipo AS
SELECT s.id, s.equipo_id, s.tipo, s.estado, s.tecnico_id, s.asignado_at, s.listo_at, s.created_at,
       CASE WHEN public.ve_costos(e.ubicacion_id) THEN s.costo ELSE NULL END AS costo
FROM public.servicios_equipo s
JOIN public.equipos e ON e.id = s.equipo_id
WHERE public.puede_ver_tienda(e.ubicacion_id);

CREATE OR REPLACE VIEW public.v_venta_items AS
SELECT vi.id, vi.venta_id, vi.equipo_id, vi.accesorio_id, vi.precio,
       CASE WHEN public.ve_costos(v.tienda_id) THEN vi.costo_snapshot ELSE NULL END AS costo_snapshot,
       v.tienda_id, v.fecha, v.anulada,
       e.modelo, e.gb
FROM public.venta_items vi
JOIN public.ventas v ON v.id = vi.venta_id
LEFT JOIN public.equipos e ON e.id = vi.equipo_id
WHERE public.puede_ver_tienda(v.tienda_id);

GRANT SELECT ON public.v_accesorios TO authenticated;
GRANT SELECT ON public.v_servicios_equipo TO authenticated;
GRANT SELECT ON public.v_venta_items TO authenticated;

-- Cierre de columnas sensibles: se quita el SELECT de tabla completa y se
-- vuelve a otorgar columna por columna, dejando fuera costo/ganancia.
REVOKE SELECT ON public.equipos FROM authenticated, anon;
GRANT SELECT (
  id, imei, serie, modelo, gb, color, bateria, email_vinculado, categoria,
  proveedor, lote, estado, ubicacion_id, fecha_ingreso, notas, updated_at,
  imei2, icloud_activo, lista_negra, bloqueo_operador, reemplazado_apple,
  garantia_estado, pais_compra, fecha_compra_estimada, bloqueo_usa,
  verificado_at, riesgo_aceptado_por, riesgo_aceptado_at
) ON public.equipos TO authenticated;

REVOKE SELECT ON public.ventas FROM authenticated, anon;
GRANT SELECT (
  id, tienda_id, cliente_id, vendedor_id, total, con_boleta, recargo_boleta,
  revision, anulada, fecha_anulacion, reserva_id, fecha
) ON public.ventas TO authenticated;

REVOKE SELECT ON public.venta_items FROM authenticated, anon;
GRANT SELECT (id, venta_id, equipo_id, accesorio_id, precio) ON public.venta_items TO authenticated;

REVOKE SELECT ON public.reserva_items FROM authenticated, anon;
GRANT SELECT (id, reserva_id, equipo_id, accesorio_id, precio) ON public.reserva_items TO authenticated;

REVOKE SELECT ON public.accesorios FROM authenticated, anon;
GRANT SELECT (id, nombre, categoria, tipo, modelo, precio, minimo, created_at)
  ON public.accesorios TO authenticated;

REVOKE SELECT ON public.servicios_equipo FROM authenticated, anon;
GRANT SELECT (id, equipo_id, tipo, tecnico_id, estado, asignado_at, listo_at, created_at)
  ON public.servicios_equipo TO authenticated;