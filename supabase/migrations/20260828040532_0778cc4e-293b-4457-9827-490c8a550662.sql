-- =========================================================
-- Lector de equipos por USB
-- =========================================================

-- ---------- Tablas de traducción ----------

CREATE TABLE public.modelos_apple (
  product_type text PRIMARY KEY,
  modelo_comercial text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.modelos_apple TO authenticated;
GRANT ALL ON public.modelos_apple TO service_role;

ALTER TABLE public.modelos_apple ENABLE ROW LEVEL SECURITY;

CREATE POLICY "modelos_apple_select" ON public.modelos_apple
  FOR SELECT TO authenticated USING (public.mi_usuario_id() IS NOT NULL);

CREATE POLICY "modelos_apple_insert" ON public.modelos_apple
  FOR INSERT TO authenticated
  WITH CHECK (public.mi_rol() IN ('direccion','jefe_tienda','administracion'));

CREATE POLICY "modelos_apple_update" ON public.modelos_apple
  FOR UPDATE TO authenticated
  USING (public.mi_rol() IN ('direccion','jefe_tienda','administracion'))
  WITH CHECK (public.mi_rol() IN ('direccion','jefe_tienda','administracion'));

CREATE POLICY "modelos_apple_delete" ON public.modelos_apple
  FOR DELETE TO authenticated USING (public.mi_rol() = 'direccion');

CREATE TRIGGER trg_modelos_apple_touch
  BEFORE UPDATE ON public.modelos_apple
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.colores_apple (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type text NOT NULL,
  device_color text NOT NULL,
  color_comercial text NOT NULL,
  created_by uuid REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_type, device_color)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.colores_apple TO authenticated;
GRANT ALL ON public.colores_apple TO service_role;

ALTER TABLE public.colores_apple ENABLE ROW LEVEL SECURITY;

CREATE POLICY "colores_apple_select" ON public.colores_apple
  FOR SELECT TO authenticated USING (public.mi_usuario_id() IS NOT NULL);

-- Cualquier usuario que ingresa equipos puede recordar un color nuevo
CREATE POLICY "colores_apple_insert" ON public.colores_apple
  FOR INSERT TO authenticated
  WITH CHECK (
    public.mi_rol() IN ('direccion','jefe_tienda','administracion','operaciones')
  );

CREATE POLICY "colores_apple_update" ON public.colores_apple
  FOR UPDATE TO authenticated
  USING (public.mi_rol() IN ('direccion','jefe_tienda','administracion'))
  WITH CHECK (public.mi_rol() IN ('direccion','jefe_tienda','administracion'));

CREATE POLICY "colores_apple_delete" ON public.colores_apple
  FOR DELETE TO authenticated
  USING (public.mi_rol() IN ('direccion','jefe_tienda','administracion'));

CREATE TRIGGER trg_colores_apple_touch
  BEFORE UPDATE ON public.colores_apple
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Agentes instalados en los Mac ----------

CREATE TABLE public.lector_agentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tienda_id uuid NOT NULL REFERENCES public.tiendas(id),
  clave_hash text NOT NULL UNIQUE,
  version text,
  hostname text,
  estado text NOT NULL DEFAULT 'sin_contacto',
  detalle_estado text,
  udid_actual text,
  ultimo_latido timestamptz,
  ultima_lectura timestamptz,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lector_agentes_tienda ON public.lector_agentes (tienda_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lector_agentes TO authenticated;
GRANT ALL ON public.lector_agentes TO service_role;

ALTER TABLE public.lector_agentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lector_agentes_select" ON public.lector_agentes
  FOR SELECT TO authenticated USING (public.puede_ver_tienda(tienda_id));

CREATE POLICY "lector_agentes_insert" ON public.lector_agentes
  FOR INSERT TO authenticated WITH CHECK (public.mi_rol() = 'direccion');

CREATE POLICY "lector_agentes_update" ON public.lector_agentes
  FOR UPDATE TO authenticated
  USING (public.mi_rol() = 'direccion')
  WITH CHECK (public.mi_rol() = 'direccion');

CREATE POLICY "lector_agentes_delete" ON public.lector_agentes
  FOR DELETE TO authenticated USING (public.mi_rol() = 'direccion');

CREATE TRIGGER trg_lector_agentes_touch
  BEFORE UPDATE ON public.lector_agentes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Lecturas de equipos ----------

CREATE TABLE public.lecturas_equipo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id uuid NOT NULL REFERENCES public.lector_agentes(id) ON DELETE CASCADE,
  tienda_id uuid NOT NULL REFERENCES public.tiendas(id),
  udid text,
  imei text,
  imei2 text,
  meid text,
  serie text,
  serie_placa text,
  product_type text,
  modelo text,
  model_number text,
  gb integer,
  ios_version text,
  region text,
  activado boolean,
  operador text,
  wifi_mac text,
  bluetooth_mac text,
  color_codigo text,
  color_comercial text,
  bateria_ciclos integer,
  bateria_capacidad_disenio integer,
  icloud_bloqueado boolean,
  icloud_cuenta_enmascarada text,
  crudo jsonb NOT NULL DEFAULT '{}'::jsonb,
  fecha timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lecturas_equipo_tienda_fecha
  ON public.lecturas_equipo (tienda_id, fecha DESC);
CREATE INDEX idx_lecturas_equipo_imei ON public.lecturas_equipo (imei);

GRANT SELECT ON public.lecturas_equipo TO authenticated;
GRANT ALL ON public.lecturas_equipo TO service_role;

ALTER TABLE public.lecturas_equipo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lecturas_equipo_select" ON public.lecturas_equipo
  FOR SELECT TO authenticated USING (public.puede_ver_tienda(tienda_id));

-- ---------- Respaldos del Verification Report de 3uTools ----------

CREATE TABLE public.equipos_reportes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imei text NOT NULL,
  equipo_id uuid REFERENCES public.equipos(id) ON DELETE SET NULL,
  ruta text NOT NULL,
  nombre_archivo text,
  subido_por uuid REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_equipos_reportes_imei ON public.equipos_reportes (imei);

GRANT SELECT, INSERT ON public.equipos_reportes TO authenticated;
GRANT DELETE ON public.equipos_reportes TO authenticated;
GRANT ALL ON public.equipos_reportes TO service_role;

ALTER TABLE public.equipos_reportes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipos_reportes_select" ON public.equipos_reportes
  FOR SELECT TO authenticated USING (public.mi_usuario_id() IS NOT NULL);

CREATE POLICY "equipos_reportes_insert" ON public.equipos_reportes
  FOR INSERT TO authenticated
  WITH CHECK (subido_por = public.mi_usuario_id());

CREATE POLICY "equipos_reportes_delete" ON public.equipos_reportes
  FOR DELETE TO authenticated USING (public.mi_rol() = 'direccion');

-- Las lecturas llegan por realtime al modal de ingreso
ALTER PUBLICATION supabase_realtime ADD TABLE public.lecturas_equipo;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lector_agentes;