-- ============ Finanzas: personal, parámetros, nómina, impuestos, gastos ============

CREATE TYPE public.tipo_personal AS ENUM ('contrato','honorarios','sin_contrato','por_contratar');
CREATE TYPE public.estado_personal AS ENUM ('activo','inactivo');
CREATE TYPE public.tipo_gasto AS ENUM ('fijo','variable','operativo');

-- solo dirección y administración
CREATE OR REPLACE FUNCTION public.ve_finanzas()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.mi_rol() IN ('direccion','administracion') $$;

-- auditoría de finanzas: registra solo las columnas tocadas, nunca los valores sensibles
CREATE OR REPLACE FUNCTION public.fn_auditar_finanzas()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare v_id text; v_campos text[];
begin
  if tg_op = 'DELETE' then
    v_id := (to_jsonb(old)->>'id');
  else
    v_id := (to_jsonb(new)->>'id');
  end if;
  if tg_op = 'UPDATE' then
    select array_agg(key) into v_campos
    from jsonb_each_text(to_jsonb(new)) n
    where n.value is distinct from (to_jsonb(old)->>n.key);
  end if;
  insert into public.auditoria (accion, detalle, usuario_id, rol)
  values (tg_table_name || '.' || lower(tg_op),
          jsonb_build_object('id', v_id, 'campos', coalesce(v_campos, array[]::text[])),
          public.mi_usuario_id(), public.mi_rol()::text);
  return null;
end $$;

-- registra que alguien abrió una pantalla de finanzas
CREATE OR REPLACE FUNCTION public.registrar_acceso_finanzas(_seccion text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  if not public.ve_finanzas() then
    raise exception 'Sin permiso para Finanzas';
  end if;
  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('finanzas.acceso', jsonb_build_object('seccion', _seccion),
          public.mi_usuario_id(), public.mi_rol()::text, public.mi_tienda());
end $$;

-- ---------------- personal ----------------
CREATE TABLE public.personal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  cargo text,
  area text,
  asignacion text NOT NULL DEFAULT 'compartido',
  tipo public.tipo_personal NOT NULL DEFAULT 'sin_contrato',
  empresa_rut text,
  rut text,
  fecha_ingreso date,
  afp text,
  salud text,
  sueldo_base bigint NOT NULL DEFAULT 0,
  liquido_liquidacion bigint NOT NULL DEFAULT 0,
  bonificacion_extra bigint NOT NULL DEFAULT 0,
  bono_variable_referencia bigint NOT NULL DEFAULT 0,
  estado public.estado_personal NOT NULL DEFAULT 'activo',
  revisar boolean NOT NULL DEFAULT false,
  notas text,
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.personal TO authenticated;
GRANT ALL ON public.personal TO service_role;
ALTER TABLE public.personal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finanzas lee personal" ON public.personal FOR SELECT TO authenticated USING (public.ve_finanzas());
CREATE POLICY "finanzas crea personal" ON public.personal FOR INSERT TO authenticated WITH CHECK (public.ve_finanzas());
CREATE POLICY "finanzas edita personal" ON public.personal FOR UPDATE TO authenticated USING (public.ve_finanzas()) WITH CHECK (public.ve_finanzas());
CREATE TRIGGER trg_personal_touch BEFORE UPDATE ON public.personal
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_personal_auditar AFTER INSERT OR UPDATE ON public.personal
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditar_finanzas();

-- ---------------- parámetros ----------------
CREATE TABLE public.parametros_finanzas (
  clave text PRIMARY KEY,
  etiqueta text NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  unidad text,
  nota text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE ON public.parametros_finanzas TO authenticated;
GRANT ALL ON public.parametros_finanzas TO service_role;
ALTER TABLE public.parametros_finanzas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finanzas lee parametros" ON public.parametros_finanzas FOR SELECT TO authenticated USING (public.ve_finanzas());
CREATE POLICY "finanzas crea parametros" ON public.parametros_finanzas FOR INSERT TO authenticated WITH CHECK (public.ve_finanzas());
CREATE POLICY "finanzas edita parametros" ON public.parametros_finanzas FOR UPDATE TO authenticated USING (public.ve_finanzas()) WITH CHECK (public.ve_finanzas());
CREATE TRIGGER trg_parametros_auditar AFTER INSERT OR UPDATE ON public.parametros_finanzas
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditar_finanzas();

-- ---------------- nómina mensual ----------------
CREATE TABLE public.nomina_mensual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo text NOT NULL,
  personal_id uuid NOT NULL REFERENCES public.personal(id) ON DELETE CASCADE,
  liquido_liquidacion bigint NOT NULL DEFAULT 0,
  bonificacion_extra bigint NOT NULL DEFAULT 0,
  bono_base bigint NOT NULL DEFAULT 0,
  faltas integer NOT NULL DEFAULT 0,
  atrasos integer NOT NULL DEFAULT 0,
  otros_descuentos bigint NOT NULL DEFAULT 0,
  pagado_quincena boolean NOT NULL DEFAULT false,
  pagado_fin_mes boolean NOT NULL DEFAULT false,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (periodo, personal_id)
);
CREATE INDEX idx_nomina_periodo ON public.nomina_mensual (periodo);
GRANT SELECT, INSERT, UPDATE ON public.nomina_mensual TO authenticated;
GRANT ALL ON public.nomina_mensual TO service_role;
ALTER TABLE public.nomina_mensual ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finanzas lee nomina" ON public.nomina_mensual FOR SELECT TO authenticated USING (public.ve_finanzas());
CREATE POLICY "finanzas crea nomina" ON public.nomina_mensual FOR INSERT TO authenticated WITH CHECK (public.ve_finanzas());
CREATE POLICY "finanzas edita nomina" ON public.nomina_mensual FOR UPDATE TO authenticated USING (public.ve_finanzas()) WITH CHECK (public.ve_finanzas());
CREATE TRIGGER trg_nomina_touch BEFORE UPDATE ON public.nomina_mensual
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_nomina_auditar AFTER INSERT OR UPDATE ON public.nomina_mensual
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditar_finanzas();

-- ---------------- impuestos ----------------
CREATE TABLE public.impuestos_mensuales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo text NOT NULL,
  concepto text NOT NULL,
  fecha_maxima date,
  monto bigint NOT NULL DEFAULT 0,
  pagado boolean NOT NULL DEFAULT false,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (periodo, concepto)
);
CREATE INDEX idx_impuestos_periodo ON public.impuestos_mensuales (periodo);
GRANT SELECT, INSERT, UPDATE ON public.impuestos_mensuales TO authenticated;
GRANT ALL ON public.impuestos_mensuales TO service_role;
ALTER TABLE public.impuestos_mensuales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finanzas lee impuestos" ON public.impuestos_mensuales FOR SELECT TO authenticated USING (public.ve_finanzas());
CREATE POLICY "finanzas crea impuestos" ON public.impuestos_mensuales FOR INSERT TO authenticated WITH CHECK (public.ve_finanzas());
CREATE POLICY "finanzas edita impuestos" ON public.impuestos_mensuales FOR UPDATE TO authenticated USING (public.ve_finanzas()) WITH CHECK (public.ve_finanzas());
CREATE TRIGGER trg_impuestos_touch BEFORE UPDATE ON public.impuestos_mensuales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_impuestos_auditar AFTER INSERT OR UPDATE ON public.impuestos_mensuales
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditar_finanzas();

-- ---------------- plantillas de gastos recurrentes ----------------
CREATE TABLE public.gastos_plantilla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL,
  detalle text NOT NULL,
  asignacion text NOT NULL DEFAULT 'compartido',
  tipo public.tipo_gasto NOT NULL DEFAULT 'fijo',
  monto_referencia bigint NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.gastos_plantilla TO authenticated;
GRANT ALL ON public.gastos_plantilla TO service_role;
ALTER TABLE public.gastos_plantilla ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finanzas lee plantillas" ON public.gastos_plantilla FOR SELECT TO authenticated USING (public.ve_finanzas());
CREATE POLICY "finanzas crea plantillas" ON public.gastos_plantilla FOR INSERT TO authenticated WITH CHECK (public.ve_finanzas());
CREATE POLICY "finanzas edita plantillas" ON public.gastos_plantilla FOR UPDATE TO authenticated USING (public.ve_finanzas()) WITH CHECK (public.ve_finanzas());
CREATE TRIGGER trg_plantillas_touch BEFORE UPDATE ON public.gastos_plantilla
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------- gastos: se extiende la tabla existente ----------------
ALTER TABLE public.gastos
  ADD COLUMN tipo public.tipo_gasto NOT NULL DEFAULT 'operativo',
  ADD COLUMN periodo text,
  ADD COLUMN plantilla_id uuid REFERENCES public.gastos_plantilla(id) ON DELETE SET NULL,
  ADD COLUMN detalle text,
  ADD COLUMN asignacion text,
  ADD COLUMN fecha_pago date,
  ADD COLUMN pagado boolean NOT NULL DEFAULT false;
CREATE INDEX idx_gastos_periodo_tipo ON public.gastos (periodo, tipo);

-- genera los gastos de un mes desde las plantillas activas (idempotente por plantilla+periodo)
CREATE OR REPLACE FUNCTION public.generar_gastos_periodo(_periodo text, _tipo public.tipo_gasto)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare v_n integer;
begin
  if not public.ve_finanzas() then
    raise exception 'Sin permiso para Finanzas';
  end if;
  if _periodo !~ '^\d{4}-\d{2}$' then
    raise exception 'Período inválido';
  end if;
  with nuevas as (
    insert into public.gastos (categoria, descripcion, detalle, asignacion, monto, tienda_id,
                               usuario_id, tipo, periodo, plantilla_id, fecha)
    select p.categoria, p.detalle, p.detalle, p.asignacion, p.monto_referencia,
           t.id, public.mi_usuario_id(), p.tipo, _periodo, p.id,
           (_periodo || '-01')::timestamptz
    from public.gastos_plantilla p
    left join public.tiendas t on t.slug = p.asignacion
    where p.activo and p.tipo = _tipo
      and not exists (
        select 1 from public.gastos g
        where g.plantilla_id = p.id and g.periodo = _periodo
      )
    returning 1
  )
  select count(*) into v_n from nuevas;
  return v_n;
end $$;
