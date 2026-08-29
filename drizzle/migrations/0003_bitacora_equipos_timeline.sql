-- Bitácora por evento: comentarios de texto libre en cada equipo, inmutables.
CREATE TABLE public.equipos_bitacora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id uuid NOT NULL REFERENCES public.equipos(id) ON DELETE CASCADE,
  comentario text NOT NULL,
  usuario_id uuid REFERENCES public.usuarios(id),
  rol text,
  tienda_id uuid REFERENCES public.tiendas(id),
  fecha timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX equipos_bitacora_equipo_fecha_idx
  ON public.equipos_bitacora (equipo_id, fecha DESC);

GRANT SELECT, INSERT ON public.equipos_bitacora TO authenticated;
GRANT ALL ON public.equipos_bitacora TO service_role;

ALTER TABLE public.equipos_bitacora ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bitacora_ver" ON public.equipos_bitacora
  FOR SELECT TO authenticated
  USING (public.mi_rol() IS NOT NULL);

CREATE POLICY "bitacora_escribir" ON public.equipos_bitacora
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id = public.mi_usuario_id());

-- Sin UPDATE ni DELETE: el hilo no se edita ni se borra.
CREATE OR REPLACE FUNCTION public.fn_bitacora_inmutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Los comentarios de la bitácora no se pueden modificar ni borrar';
END;
$$;

CREATE TRIGGER trg_bitacora_inmutable
  BEFORE UPDATE OR DELETE ON public.equipos_bitacora
  FOR EACH ROW EXECUTE FUNCTION public.fn_bitacora_inmutable();

-- Agrega un comentario validando que el usuario pueda ver ese equipo.
CREATE OR REPLACE FUNCTION public.agregar_comentario_equipo(_equipo uuid, _texto text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := public.mi_usuario_id();
  _rol text := public.mi_rol()::text;
  _ubic uuid;
  _id uuid;
  _limpio text := btrim(coalesce(_texto, ''));
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;
  IF _limpio = '' THEN
    RAISE EXCEPTION 'El comentario no puede estar vacío';
  END IF;
  IF length(_limpio) > 1000 THEN
    RAISE EXCEPTION 'El comentario es demasiado largo (máximo 1000 caracteres)';
  END IF;

  SELECT ubicacion_id INTO _ubic FROM public.equipos WHERE id = _equipo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El equipo no existe';
  END IF;
  IF _ubic IS NOT NULL AND NOT public.puede_ver_tienda(_ubic) THEN
    RAISE EXCEPTION 'No tienes acceso a ese equipo';
  END IF;

  INSERT INTO public.equipos_bitacora (equipo_id, comentario, usuario_id, rol, tienda_id)
  VALUES (_equipo, _limpio, _uid, _rol, public.mi_tienda())
  RETURNING id INTO _id;

  INSERT INTO public.equipos_historial (equipo_id, evento, usuario_id)
  VALUES (_equipo, 'Comentario en bitácora', _uid);

  INSERT INTO public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  VALUES (
    'bitacora_comentario',
    jsonb_build_object('equipo_id', _equipo, 'comentario', _limpio),
    _uid, _rol, public.mi_tienda()
  );

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.agregar_comentario_equipo(uuid, text) TO authenticated;

-- Línea de tiempo unificada por equipo: ingreso, traslados, taller, venta y bitácora.
CREATE OR REPLACE VIEW public.v_equipo_timeline AS
SELECT
  ('hist:' || h.id::text) AS id,
  h.equipo_id,
  h.fecha,
  'historial'::text AS fuente,
  h.evento AS titulo,
  NULL::text AS detalle,
  u.nombre AS autor,
  NULL::text AS tienda
FROM public.equipos_historial h
JOIN public.equipos e ON e.id = h.equipo_id
LEFT JOIN public.usuarios u ON u.id = h.usuario_id
WHERE public.mi_rol() IS NOT NULL AND h.evento <> 'Comentario en bitácora'

UNION ALL

SELECT
  ('mov:' || m.id::text) AS id,
  m.equipo_id,
  m.fecha,
  'movimiento'::text AS fuente,
  ('Traslado: ' || coalesce(td.nombre, 'sin origen') || ' → ' || coalesce(th.nombre, 'sin destino')) AS titulo,
  NULL::text AS detalle,
  u.nombre AS autor,
  th.nombre AS tienda
FROM public.movimientos m
LEFT JOIN public.tiendas td ON td.id = m.desde_id
LEFT JOIN public.tiendas th ON th.id = m.hacia_id
LEFT JOIN public.usuarios u ON u.id = m.usuario_id
WHERE public.mi_rol() IS NOT NULL

UNION ALL

SELECT
  ('srv:' || s.id::text) AS id,
  s.equipo_id,
  coalesce(s.listo_at, s.asignado_at, s.created_at) AS fecha,
  'servicio'::text AS fuente,
  ('Taller: ' || s.tipo::text) AS titulo,
  ('Estado: ' || s.estado || coalesce(' · Técnico: ' || tc.nombre, '')) AS detalle,
  tc.nombre AS autor,
  NULL::text AS tienda
FROM public.servicios_equipo s
LEFT JOIN public.tecnicos tc ON tc.id = s.tecnico_id
WHERE public.mi_rol() IS NOT NULL

UNION ALL

SELECT
  ('com:' || b.id::text) AS id,
  b.equipo_id,
  b.fecha,
  'comentario'::text AS fuente,
  'Comentario'::text AS titulo,
  b.comentario AS detalle,
  coalesce(u.nombre, 'Sistema') AS autor,
  t.nombre AS tienda
FROM public.equipos_bitacora b
LEFT JOIN public.usuarios u ON u.id = b.usuario_id
LEFT JOIN public.tiendas t ON t.id = b.tienda_id
WHERE public.mi_rol() IS NOT NULL

UNION ALL

SELECT
  ('vta:' || vi.id::text) AS id,
  vi.equipo_id,
  v.fecha,
  'venta'::text AS fuente,
  (CASE WHEN v.anulada THEN 'Venta anulada' ELSE 'Venta' END) AS titulo,
  coalesce('Comprobante ' || v.comprobante_numero, NULL) AS detalle,
  u.nombre AS autor,
  t.nombre AS tienda
FROM public.venta_items vi
JOIN public.ventas v ON v.id = vi.venta_id
LEFT JOIN public.usuarios u ON u.id = v.vendedor_id
LEFT JOIN public.tiendas t ON t.id = v.tienda_id
WHERE public.mi_rol() IS NOT NULL AND vi.equipo_id IS NOT NULL;

GRANT SELECT ON public.v_equipo_timeline TO authenticated;

-- Listado de comprobantes de venta para buscarlos después.
CREATE OR REPLACE VIEW public.v_comprobantes AS
SELECT
  v.id,
  v.fecha,
  v.total,
  v.anulada,
  v.con_boleta,
  v.comprobante_numero,
  (v.comprobante_ruta IS NOT NULL) AS tiene_pdf,
  v.comprobante_email,
  v.comprobante_email_estado,
  v.comprobante_email_at,
  v.tienda_id,
  t.nombre AS tienda,
  u.nombre AS vendedor,
  c.nombre AS cliente,
  c.correo AS cliente_correo,
  (
    SELECT string_agg(DISTINCT e.imei, ' · ')
    FROM public.venta_items vi
    JOIN public.equipos e ON e.id = vi.equipo_id
    WHERE vi.venta_id = v.id
  ) AS imeis,
  (
    SELECT string_agg(DISTINCT e.modelo, ' · ')
    FROM public.venta_items vi
    JOIN public.equipos e ON e.id = vi.equipo_id
    WHERE vi.venta_id = v.id
  ) AS modelos
FROM public.ventas v
LEFT JOIN public.tiendas t ON t.id = v.tienda_id
LEFT JOIN public.usuarios u ON u.id = v.vendedor_id
LEFT JOIN public.clientes c ON c.id = v.cliente_id
WHERE public.puede_ver_tienda(v.tienda_id);

GRANT SELECT ON public.v_comprobantes TO authenticated;