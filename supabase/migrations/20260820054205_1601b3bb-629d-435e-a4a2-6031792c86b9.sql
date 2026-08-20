CREATE TABLE public.imei_verificaciones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  imei text NOT NULL,
  service_id integer NOT NULL,
  status text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  respuesta jsonb,
  costo numeric(10,4) NOT NULL DEFAULT 0,
  usuario_id uuid REFERENCES public.usuarios(id),
  fecha timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.imei_verificaciones TO authenticated;
GRANT ALL ON public.imei_verificaciones TO service_role;

ALTER TABLE public.imei_verificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verificaciones_select" ON public.imei_verificaciones
  FOR SELECT TO authenticated USING (public.mi_rol() IS NOT NULL);

CREATE POLICY "verificaciones_insert" ON public.imei_verificaciones
  FOR INSERT TO authenticated WITH CHECK (public.mi_rol() IS NOT NULL);

CREATE INDEX imei_verificaciones_imei_fecha_idx
  ON public.imei_verificaciones (imei, fecha DESC);

CREATE TABLE public.imeicheck_config (
  id integer NOT NULL PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  service_id integer NOT NULL DEFAULT 12,
  ambiente text NOT NULL DEFAULT 'sandbox',
  service_nombre text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.usuarios(id)
);

GRANT SELECT, UPDATE ON public.imeicheck_config TO authenticated;
GRANT ALL ON public.imeicheck_config TO service_role;

ALTER TABLE public.imeicheck_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config_select" ON public.imeicheck_config
  FOR SELECT TO authenticated USING (public.mi_rol() IS NOT NULL);

CREATE POLICY "config_update" ON public.imeicheck_config
  FOR UPDATE TO authenticated
  USING (public.mi_rol() = 'direccion')
  WITH CHECK (public.mi_rol() = 'direccion');

INSERT INTO public.imeicheck_config (id, service_id, ambiente, service_nombre)
VALUES (1, 12, 'sandbox', 'Sandbox · siempre exitoso');

CREATE OR REPLACE FUNCTION public.fn_imeicheck_config_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  new.updated_at = now();
  return new;
end $$;

CREATE TRIGGER imeicheck_config_updated_at
  BEFORE UPDATE ON public.imeicheck_config
  FOR EACH ROW EXECUTE FUNCTION public.fn_imeicheck_config_touch();

CREATE OR REPLACE FUNCTION public.registrar_riesgo_imei(_imei text, _motivos text[], _detalle jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_rol app_rol := public.mi_rol();
begin
  if v_rol is null then raise exception 'Sesión no válida'; end if;
  if coalesce(array_length(_motivos, 1), 0) = 0 then
    raise exception 'Falta el motivo del riesgo aceptado';
  end if;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('imei.riesgo_aceptado',
          jsonb_build_object('imei', _imei, 'motivos', to_jsonb(_motivos)) || coalesce(_detalle, '{}'::jsonb),
          public.mi_usuario_id(), v_rol::text, public.mi_tienda());
end $$;

REVOKE ALL ON FUNCTION public.registrar_riesgo_imei(text, text[], jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.registrar_riesgo_imei(text, text[], jsonb) TO authenticated;