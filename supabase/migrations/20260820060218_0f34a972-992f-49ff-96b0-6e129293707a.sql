alter table public.equipos
  add column if not exists imei2 text,
  add column if not exists icloud_activo boolean,
  add column if not exists lista_negra boolean,
  add column if not exists bloqueo_operador boolean,
  add column if not exists reemplazado_apple boolean,
  add column if not exists garantia_estado text,
  add column if not exists pais_compra text,
  add column if not exists fecha_compra_estimada timestamptz,
  add column if not exists bloqueo_usa text,
  add column if not exists verificado_at timestamptz,
  add column if not exists riesgo_aceptado_por uuid references public.usuarios(id),
  add column if not exists riesgo_aceptado_at timestamptz;

create index if not exists equipos_con_alertas_idx
  on public.equipos (ubicacion_id)
  where icloud_activo or lista_negra;

/* Los campos de verificación solo los escribe el servidor vía RPC (GUC app.verificacion_sistema). */
create or replace function public.fn_equipos_verificacion_protegida()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(current_setting('app.verificacion_sistema', true), '0') = '1' then
    return new;
  end if;
  if new.imei2 is distinct from old.imei2
     or new.icloud_activo is distinct from old.icloud_activo
     or new.lista_negra is distinct from old.lista_negra
     or new.bloqueo_operador is distinct from old.bloqueo_operador
     or new.reemplazado_apple is distinct from old.reemplazado_apple
     or new.garantia_estado is distinct from old.garantia_estado
     or new.pais_compra is distinct from old.pais_compra
     or new.fecha_compra_estimada is distinct from old.fecha_compra_estimada
     or new.bloqueo_usa is distinct from old.bloqueo_usa
     or new.verificado_at is distinct from old.verificado_at
     or new.riesgo_aceptado_por is distinct from old.riesgo_aceptado_por
     or new.riesgo_aceptado_at is distinct from old.riesgo_aceptado_at then
    raise exception 'Los datos de verificación del IMEI solo se pueden actualizar verificando el equipo';
  end if;
  return new;
end $$;

drop trigger if exists trg_equipos_verificacion_protegida on public.equipos;
create trigger trg_equipos_verificacion_protegida
  before update on public.equipos
  for each row execute function public.fn_equipos_verificacion_protegida();

/* Guarda en el equipo el resultado ya normalizado de la verificación. */
create or replace function public.guardar_verificacion_equipo(
  _imei text,
  _datos jsonb,
  _riesgo_aceptado boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mi uuid := public.mi_usuario_id();
  v_id uuid;
  v_fecha timestamptz;
begin
  if v_mi is null then raise exception 'Sesión no válida'; end if;

  select id into v_id from public.equipos where imei = trim(_imei) for update;
  if v_id is null then return null; end if;

  if (_datos->>'fecha_compra_estimada') is not null then
    v_fecha := to_timestamp((_datos->>'fecha_compra_estimada')::double precision);
  end if;

  perform set_config('app.verificacion_sistema', '1', true);

  update public.equipos set
    serie = coalesce(nullif(_datos->>'serie', ''), serie),
    imei2 = nullif(_datos->>'imei2', ''),
    icloud_activo = coalesce((_datos->>'icloud_activo')::boolean, false),
    lista_negra = coalesce((_datos->>'lista_negra')::boolean, false),
    bloqueo_operador = coalesce((_datos->>'bloqueo_operador')::boolean, false),
    reemplazado_apple = coalesce((_datos->>'reemplazado_apple')::boolean, false),
    garantia_estado = nullif(_datos->>'garantia_estado', ''),
    pais_compra = nullif(_datos->>'pais_compra', ''),
    fecha_compra_estimada = v_fecha,
    bloqueo_usa = nullif(_datos->>'bloqueo_usa', ''),
    verificado_at = now(),
    riesgo_aceptado_por = case when _riesgo_aceptado then v_mi else riesgo_aceptado_por end,
    riesgo_aceptado_at = case when _riesgo_aceptado then now() else riesgo_aceptado_at end,
    updated_at = now()
  where id = v_id;

  perform set_config('app.verificacion_sistema', '0', true);

  insert into public.equipos_historial (equipo_id, evento, usuario_id)
  values (v_id, 'verificación de IMEI actualizada', v_mi);

  return v_id;
end $$;

revoke all on function public.guardar_verificacion_equipo(text, jsonb, boolean) from public;
grant execute on function public.guardar_verificacion_equipo(text, jsonb, boolean) to authenticated, service_role;

drop view if exists public.v_stock;
create view public.v_stock
with (security_invoker = false) as
  select e.id, e.imei, e.modelo, e.gb, e.color, e.bateria, e.categoria,
         e.estado, e.ubicacion_id, t.nombre as tienda, e.fecha_ingreso,
         e.serie, e.imei2, e.icloud_activo, e.lista_negra, e.bloqueo_operador,
         e.reemplazado_apple, e.garantia_estado, e.pais_compra,
         e.fecha_compra_estimada, e.bloqueo_usa, e.verificado_at
    from public.equipos e
    left join public.tiendas t on t.id = e.ubicacion_id
   where public.mi_rol() is not null;

revoke all on public.v_stock from anon;
grant select on public.v_stock to authenticated;
grant all on public.v_stock to service_role;