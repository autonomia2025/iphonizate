create or replace function public.ve_costos(_tienda uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.mi_rol()
    when 'direccion' then true
    when 'administracion' then true
    when 'jefe_tienda' then (_tienda is null or _tienda = public.mi_tienda())
    else public.tiene_permiso('equipos.costo') end
$$;

create or replace function public.trasladar_equipos(_imeis text[], _origen uuid, _destino uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol app_rol;
  v_mi uuid;
  v_imei text;
  v_eq public.equipos;
  v_desde text;
  v_hacia text;
  v_destino_bodega boolean;
  v_n int := 0;
begin
  v_rol := public.mi_rol();
  v_mi := public.mi_usuario_id();
  if v_rol is null then raise exception 'Sesión no válida'; end if;
  if v_rol not in ('direccion','jefe_tienda','administracion','operaciones','vendedor') then
    raise exception 'Tu rol no puede trasladar equipos';
  end if;
  if _origen is null or _destino is null then raise exception 'Debes elegir origen y destino'; end if;
  if _origen = _destino then raise exception 'El origen y el destino deben ser distintos'; end if;
  if v_rol in ('jefe_tienda','vendedor') and _origen is distinct from public.mi_tienda() then
    raise exception 'Solo puedes mover equipos que estén en tu tienda';
  end if;

  select nombre, es_bodega into v_hacia, v_destino_bodega from public.tiendas where id = _destino;
  select nombre into v_desde from public.tiendas where id = _origen;
  if v_desde is null or v_hacia is null then raise exception 'Tienda de origen o destino no existe'; end if;

  if v_rol = 'vendedor'
     and not coalesce(v_destino_bodega, false)
     and not public.tiene_permiso('movimientos.tienda') then
    raise exception 'Como vendedor solo puedes devolver equipos a bodega';
  end if;

  if coalesce(array_length(_imeis, 1), 0) = 0 then raise exception 'No hay equipos para trasladar'; end if;

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
end
$$;

insert into public.permisos_usuario (usuario_id, permiso)
select id, 'equipos.costo' from public.usuarios where usuario = 'alanis'
on conflict do nothing;

insert into public.permisos_usuario (usuario_id, permiso)
select id, 'movimientos.tienda' from public.usuarios where usuario = 'matias'
on conflict do nothing;