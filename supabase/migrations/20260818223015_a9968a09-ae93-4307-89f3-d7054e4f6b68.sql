-- ============ Vistas de taller ============
create or replace view public.v_taller as
select
  s.id            as servicio_id,
  s.tipo          as tipo,
  s.asignado_at   as asignado_at,
  t.id            as tecnico_id,
  t.nombre        as tecnico,
  e.id            as equipo_id,
  e.imei          as imei,
  e.modelo        as modelo,
  e.gb            as gb,
  e.color         as color,
  e.ubicacion_id  as ubicacion_id,
  ti.nombre       as tienda
from public.servicios_equipo s
join public.equipos e on e.id = s.equipo_id
join public.tecnicos t on t.id = s.tecnico_id
left join public.tiendas ti on ti.id = e.ubicacion_id
where s.estado = 'asignado';

alter view public.v_taller set (security_invoker = off);

create or replace view public.v_tecnico_historial as
select
  e.id                                    as equipo_id,
  e.imei                                  as imei,
  e.modelo                                as modelo,
  e.gb                                    as gb,
  e.color                                 as color,
  t.id                                    as tecnico_id,
  t.nombre                                as tecnico,
  string_agg(s.tipo::text, ', ' order by s.tipo::text) as servicios,
  count(*)                                as total_servicios,
  min(s.asignado_at)                      as asignado_at,
  max(s.listo_at)                         as salida_at,
  greatest(0, extract(day from (max(s.listo_at) - min(s.asignado_at)))::int) as dias,
  case when public.ve_costos(e.ubicacion_id) then sum(s.costo) else null end as costo_total
from public.servicios_equipo s
join public.equipos e on e.id = s.equipo_id
join public.tecnicos t on t.id = s.tecnico_id
where s.estado = 'listo' and s.listo_at is not null
group by e.id, e.imei, e.modelo, e.gb, e.color, t.id, t.nombre;

alter view public.v_tecnico_historial set (security_invoker = off);

revoke all on public.v_taller from anon;
revoke all on public.v_tecnico_historial from anon;
grant select on public.v_taller to authenticated;
grant select on public.v_tecnico_historial to authenticated;

-- ============ Asignar equipos a técnico ============
create or replace function public.asignar_equipos_tecnico(_imeis text[], _tecnico uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol app_rol := public.mi_rol();
  v_usuario uuid := public.mi_usuario_id();
  v_imei text;
  v_eq public.equipos;
  v_pendientes int;
  v_otro text;
  v_total int := 0;
begin
  if v_rol is null then raise exception 'Sesión no válida'; end if;
  if v_rol not in ('direccion','jefe_tienda','administracion','operaciones') then
    raise exception 'Tu rol no puede asignar equipos a técnico';
  end if;
  if not exists (select 1 from public.tecnicos where id = _tecnico and activo) then
    raise exception 'El técnico seleccionado no existe o está inactivo';
  end if;
  if _imeis is null or array_length(_imeis, 1) is null then
    raise exception 'No hay equipos para asignar';
  end if;

  foreach v_imei in array _imeis loop
    select * into v_eq from public.equipos where imei = v_imei;
    if v_eq.id is null then
      raise exception 'El IMEI % no está en el sistema', v_imei;
    end if;
    if v_rol = 'jefe_tienda' and v_eq.ubicacion_id is distinct from public.mi_tienda() then
      raise exception 'El equipo % no está en tu tienda', v_imei;
    end if;
    if v_eq.estado in ('VENDIDO','ENTREGADO','RESERVADO') then
      raise exception 'El equipo % está % y no puede ir a técnico', v_imei, lower(v_eq.estado::text);
    end if;

    select t.nombre into v_otro
    from public.servicios_equipo s
    join public.tecnicos t on t.id = s.tecnico_id
    where s.equipo_id = v_eq.id and s.estado = 'asignado'
    limit 1;
    if v_otro is not null then
      raise exception 'El equipo % ya está asignado a %', v_imei, v_otro;
    end if;

    select count(*) into v_pendientes
    from public.servicios_equipo
    where equipo_id = v_eq.id and estado = 'pendiente';
    if v_pendientes = 0 then
      raise exception 'El equipo % no necesita reparación', v_imei;
    end if;

    update public.servicios_equipo
      set estado = 'asignado', tecnico_id = _tecnico, asignado_at = now()
      where equipo_id = v_eq.id and estado = 'pendiente';

    update public.equipos
      set estado = 'EN_TECNICO', updated_at = now()
      where id = v_eq.id;

    insert into public.equipos_historial (equipo_id, evento, usuario_id)
    values (v_eq.id,
            'asignado a técnico ' || (select nombre from public.tecnicos where id = _tecnico)
            || ' (' || v_pendientes || ' servicio(s))',
            v_usuario);

    v_total := v_total + 1;
  end loop;

  return v_total;
end $$;

-- ============ Marcar servicios listos ============
create or replace function public.servicio_listo(_servicio_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol app_rol := public.mi_rol();
  v_usuario uuid := public.mi_usuario_id();
  v_equipo uuid;
  v_tipo text;
  v_restantes int;
begin
  if v_rol not in ('direccion','jefe_tienda','administracion','operaciones') then
    raise exception 'Tu rol no puede marcar servicios como listos';
  end if;

  update public.servicios_equipo
    set estado = 'listo', listo_at = now()
    where id = _servicio_id and estado <> 'listo'
    returning equipo_id, tipo::text into v_equipo, v_tipo;

  if v_equipo is null then
    raise exception 'Ese servicio no existe o ya estaba listo';
  end if;

  insert into public.equipos_historial (equipo_id, evento, usuario_id)
  values (v_equipo, 'servicio listo: ' || v_tipo, v_usuario);

  select count(*) into v_restantes
  from public.servicios_equipo
  where equipo_id = v_equipo and estado <> 'listo';

  if v_restantes = 0 then
    update public.equipos
      set estado = 'DISPONIBLE', updated_at = now()
      where id = v_equipo and estado = 'EN_TECNICO';
    insert into public.equipos_historial (equipo_id, evento, usuario_id)
    values (v_equipo, 'reparación terminada, pasa a DISPONIBLE', v_usuario);
    return 'equipo_listo';
  end if;

  return 'servicio_listo';
end $$;

create or replace function public.equipo_servicios_listos(_equipo_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_total int := 0;
begin
  for v_id in
    select id from public.servicios_equipo where equipo_id = _equipo_id and estado <> 'listo'
  loop
    perform public.servicio_listo(v_id);
    v_total := v_total + 1;
  end loop;
  if v_total = 0 then
    raise exception 'Ese equipo no tiene servicios pendientes';
  end if;
  return v_total;
end $$;

-- ============ Ajuste de stock de accesorios ============
create or replace function public.ajustar_stock_accesorio(
  _accesorio uuid, _tienda uuid, _delta integer, _motivo text
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol app_rol := public.mi_rol();
  v_actual int;
  v_nuevo int;
begin
  if v_rol not in ('direccion','jefe_tienda','administracion','operaciones') then
    raise exception 'Tu rol no puede ajustar el stock de accesorios';
  end if;
  if v_rol = 'jefe_tienda' and _tienda is distinct from public.mi_tienda() then
    raise exception 'Solo puedes ajustar el stock de tu tienda';
  end if;
  if _delta is null or _delta = 0 then
    raise exception 'La cantidad a ajustar no puede ser cero';
  end if;
  if coalesce(btrim(_motivo), '') = '' then
    raise exception 'Indica el motivo del ajuste';
  end if;

  insert into public.accesorios_stock (accesorio_id, tienda_id, cantidad)
  values (_accesorio, _tienda, 0)
  on conflict do nothing;

  select cantidad into v_actual
  from public.accesorios_stock
  where accesorio_id = _accesorio and tienda_id = _tienda
  for update;

  if v_actual is null then
    raise exception 'No se encontró el stock de ese accesorio en la tienda indicada';
  end if;

  v_nuevo := v_actual + _delta;
  if v_nuevo < 0 then
    raise exception 'No puedes dejar el stock en negativo (actual %, ajuste %)', v_actual, _delta;
  end if;

  update public.accesorios_stock
    set cantidad = v_nuevo
    where accesorio_id = _accesorio and tienda_id = _tienda;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('accesorios_stock.ajuste',
          jsonb_build_object('accesorio_id', _accesorio, 'tienda_id', _tienda,
                             'antes', v_actual, 'delta', _delta, 'despues', v_nuevo,
                             'motivo', btrim(_motivo)),
          public.mi_usuario_id(), v_rol::text, _tienda);

  return v_nuevo;
end $$;

revoke all on function public.asignar_equipos_tecnico(text[], uuid) from public, anon;
revoke all on function public.servicio_listo(uuid) from public, anon;
revoke all on function public.equipo_servicios_listos(uuid) from public, anon;
revoke all on function public.ajustar_stock_accesorio(uuid, uuid, integer, text) from public, anon;
grant execute on function public.asignar_equipos_tecnico(text[], uuid) to authenticated;
grant execute on function public.servicio_listo(uuid) to authenticated;
grant execute on function public.equipo_servicios_listos(uuid) to authenticated;
grant execute on function public.ajustar_stock_accesorio(uuid, uuid, integer, text) to authenticated;