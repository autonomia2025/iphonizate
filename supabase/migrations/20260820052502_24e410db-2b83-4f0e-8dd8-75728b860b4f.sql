-- 1) Marcar equipo como disponible (cierra el callejón sin salida de POR_REVISAR sin servicios)
create or replace function public.marcar_equipo_disponible(_equipo uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol app_rol := public.mi_rol();
  v_mi uuid := public.mi_usuario_id();
  v_eq public.equipos;
  v_pend int;
begin
  if v_rol is null then raise exception 'Sesión no válida'; end if;
  if v_rol not in ('direccion','jefe_tienda','administracion','operaciones') then
    raise exception 'Tu rol no puede marcar equipos como disponibles';
  end if;

  select * into v_eq from public.equipos where id = _equipo for update;
  if v_eq.id is null then raise exception 'Ese equipo no existe'; end if;

  if v_rol = 'jefe_tienda' and v_eq.ubicacion_id is distinct from public.mi_tienda() then
    raise exception 'Solo puedes hacer esto con equipos de tu tienda';
  end if;
  if v_eq.estado = 'DISPONIBLE' then
    raise exception 'Ese equipo ya está disponible';
  end if;
  if v_eq.estado not in ('POR_REVISAR','EN_TECNICO') then
    raise exception 'Un equipo % no se puede marcar como disponible', lower(v_eq.estado::text);
  end if;

  select count(*) into v_pend
  from public.servicios_equipo
  where equipo_id = _equipo and estado <> 'listo';
  if v_pend > 0 then
    raise exception 'Ese equipo tiene % arreglo(s) sin terminar: márcalos listos en Técnico', v_pend;
  end if;

  if v_eq.ubicacion_id is null then
    raise exception 'Ese equipo no tiene ubicación asignada: trasládalo a una tienda o bodega primero';
  end if;

  update public.equipos
    set estado = 'DISPONIBLE', updated_at = now()
    where id = _equipo;

  insert into public.equipos_historial (equipo_id, evento, usuario_id)
  values (_equipo, 'marcado como disponible sin pasar por técnico', v_mi);

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('equipos.marcar_disponible',
          jsonb_build_object('equipo_id', _equipo, 'imei', v_eq.imei, 'antes', v_eq.estado::text),
          v_mi, v_rol::text, v_eq.ubicacion_id);
end $$;

-- 2) Agregar arreglos pendientes a un equipo ya ingresado
create or replace function public.agregar_servicios_equipo(_equipo uuid, _servicios jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol app_rol := public.mi_rol();
  v_mi uuid := public.mi_usuario_id();
  v_eq public.equipos;
  v_s jsonb;
  v_costo bigint;
  v_total bigint := 0;
  v_n int := 0;
begin
  if v_rol is null then raise exception 'Sesión no válida'; end if;
  if v_rol not in ('direccion','jefe_tienda','administracion','operaciones') then
    raise exception 'Tu rol no puede agregar arreglos a un equipo';
  end if;

  select * into v_eq from public.equipos where id = _equipo for update;
  if v_eq.id is null then raise exception 'Ese equipo no existe'; end if;
  if v_rol = 'jefe_tienda' and v_eq.ubicacion_id is distinct from public.mi_tienda() then
    raise exception 'Solo puedes agregar arreglos a equipos de tu tienda';
  end if;
  if v_eq.estado in ('VENDIDO','ENTREGADO','RESERVADO') then
    raise exception 'Un equipo % no puede recibir arreglos', lower(v_eq.estado::text);
  end if;
  if _servicios is null or jsonb_array_length(_servicios) = 0 then
    raise exception 'Elige al menos un arreglo';
  end if;

  for v_s in select * from jsonb_array_elements(_servicios) loop
    v_costo := greatest(0, coalesce((v_s->>'costo')::bigint, 0));
    if not public.ve_costos(v_eq.ubicacion_id) then v_costo := 0; end if;
    insert into public.servicios_equipo (equipo_id, tipo, costo, estado)
    values (_equipo, (v_s->>'tipo')::tipo_servicio, v_costo, 'pendiente');
    v_total := v_total + v_costo;
    v_n := v_n + 1;
  end loop;

  perform set_config('app.costo_sistema', '1', true);
  update public.equipos
    set costo = coalesce(costo, 0) + v_total,
        estado = 'POR_REVISAR',
        updated_at = now()
    where id = _equipo;
  perform set_config('app.costo_sistema', '0', true);

  insert into public.equipos_historial (equipo_id, evento, usuario_id)
  values (_equipo, v_n || ' arreglo(s) agregados, queda por revisar', v_mi);

  return v_n;
end $$;

-- 3) Traslados: el vendedor puede devolver a bodega desde su tienda
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

  if v_rol = 'vendedor' and not coalesce(v_destino_bodega, false) then
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
end $$;