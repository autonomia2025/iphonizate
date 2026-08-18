-- Traslado atómico de equipos
create or replace function public.trasladar_equipos(_imeis text[], _origen uuid, _destino uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol app_rol;
  v_mi uuid;
  v_imei text;
  v_eq public.equipos;
  v_desde text;
  v_hacia text;
  v_n int := 0;
begin
  v_rol := public.mi_rol();
  v_mi := public.mi_usuario_id();
  if v_rol is null then raise exception 'Sesión no válida'; end if;
  if v_rol not in ('direccion','jefe_tienda','administracion','operaciones') then
    raise exception 'Tu rol no puede trasladar equipos';
  end if;
  if _origen is null or _destino is null then raise exception 'Debes elegir origen y destino'; end if;
  if _origen = _destino then raise exception 'El origen y el destino deben ser distintos'; end if;
  if v_rol = 'jefe_tienda' and _origen is distinct from public.mi_tienda() then
    raise exception 'Solo puedes mover equipos que estén en tu tienda';
  end if;
  if coalesce(array_length(_imeis, 1), 0) = 0 then raise exception 'No hay equipos para trasladar'; end if;

  select nombre into v_desde from public.tiendas where id = _origen;
  select nombre into v_hacia from public.tiendas where id = _destino;
  if v_desde is null or v_hacia is null then raise exception 'Tienda de origen o destino no existe'; end if;

  foreach v_imei in array _imeis loop
    select * into v_eq from public.equipos where imei = v_imei for update;
    if v_eq.id is null then
      raise exception 'El IMEI % no está en el sistema', v_imei;
    end if;
    if v_eq.ubicacion_id is distinct from _origen then
      raise exception 'El IMEI % no está en el origen seleccionado', v_imei;
    end if;
    if v_eq.estado in ('VENDIDO','ENTREGADO','RESERVADO') then
      raise exception 'El IMEI % está en estado % y no se puede trasladar', v_imei, v_eq.estado;
    end if;

    update public.equipos set ubicacion_id = _destino, updated_at = now() where id = v_eq.id;
    insert into public.movimientos (equipo_id, desde_id, hacia_id, usuario_id)
      values (v_eq.id, _origen, _destino, v_mi);
    insert into public.equipos_historial (equipo_id, evento, usuario_id)
      values (v_eq.id, 'traslado de ' || v_desde || ' a ' || v_hacia, v_mi);
    v_n := v_n + 1;
  end loop;

  return v_n;
end $$;

revoke all on function public.trasladar_equipos(text[], uuid, uuid) from public;
grant execute on function public.trasladar_equipos(text[], uuid, uuid) to authenticated;

-- Historial de movimientos (sin costos ni ganancias)
create or replace view public.v_movimientos
with (security_invoker = false) as
select
  m.id,
  m.fecha,
  e.imei,
  e.modelo,
  m.desde_id,
  td.nombre as desde,
  m.hacia_id,
  th.nombre as hacia,
  m.usuario_id,
  u.nombre as movido_por
from public.movimientos m
join public.equipos e on e.id = m.equipo_id
left join public.tiendas td on td.id = m.desde_id
left join public.tiendas th on th.id = m.hacia_id
left join public.usuarios u on u.id = m.usuario_id
where public.mi_rol() is not null;

grant select on public.v_movimientos to authenticated;

-- Tiempo real sobre equipos
alter table public.equipos replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'equipos'
  ) then
    execute 'alter publication supabase_realtime add table public.equipos';
  end if;
end $$;