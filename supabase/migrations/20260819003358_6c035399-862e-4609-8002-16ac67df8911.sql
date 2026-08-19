-- escape controlado para que las funciones de garantía puedan recalcular costos
create or replace function public.fn_equipos_costo_protegido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.costo is distinct from old.costo
     and coalesce(current_setting('app.costo_sistema', true), '0') <> '1'
     and not public.ve_costos(new.ubicacion_id) then
    raise exception 'Tu rol no puede modificar el costo de un equipo';
  end if;
  return new;
end $function$;

-- roles que operan garantías
create or replace function public.puede_operar_garantias()
returns boolean
language sql
stable
security definer
set search_path to public
as $$
  select public.mi_rol() in ('direccion','jefe_tienda','administracion','operaciones','vendedor')
$$;

-- costo de los arreglos hechos dentro de una garantía
create or replace function public.garantia_costo_arreglo(_garantia uuid)
returns bigint
language sql
stable
security definer
set search_path to public
as $$
  select coalesce(sum(s.costo), 0)::bigint
  from public.garantias g
  join public.servicios_equipo s
    on s.equipo_id = g.equipo_id and s.created_at >= g.fecha
  where g.id = _garantia
$$;

-- vista de garantías
create or replace view public.v_garantias as
select
  g.id,
  g.imei,
  g.equipo_id,
  e.modelo,
  e.gb,
  e.color,
  e.estado as equipo_estado,
  g.cliente_nombre,
  g.cliente_telefono,
  g.falla,
  g.notas,
  g.estado,
  g.resolucion,
  g.imei_entregado,
  g.diferencia,
  g.tienda_id,
  t.nombre as tienda,
  u.nombre as recibio,
  g.fecha,
  g.fecha_cierre,
  round(extract(epoch from (coalesce(g.fecha_cierre, now()) - g.fecha)) / 3600)::int as horas,
  (select count(*) from public.servicios_equipo s
     where s.equipo_id = g.equipo_id and s.created_at >= g.fecha and s.estado <> 'listo')::int
     as servicios_pendientes,
  case when public.ve_costos(g.tienda_id)
       then public.garantia_costo_arreglo(g.id) end as costo_arreglo
from public.garantias g
left join public.equipos e on e.id = g.equipo_id
left join public.tiendas t on t.id = g.tienda_id
left join public.usuarios u on u.id = g.recibio_id;

grant select on public.v_garantias to authenticated;

-- buscar equipo y su venta original
create or replace function public.garantia_buscar_imei(_imei text)
returns table(
  equipo_id uuid, imei text, modelo text, gb int, color text, estado text,
  venta_id uuid, fecha_venta timestamptz, tienda_venta text,
  cliente_nombre text, cliente_telefono text, dias_desde_venta int
)
language sql
stable
security definer
set search_path to public
as $$
  with eq as (
    select * from public.equipos where equipos.imei = trim(_imei)
  ), vt as (
    select v.id, v.fecha, tv.nombre as tienda, c.nombre as cliente, c.telefono
    from public.venta_items vi
    join public.ventas v on v.id = vi.venta_id and not v.anulada
    left join public.tiendas tv on tv.id = v.tienda_id
    left join public.clientes c on c.id = v.cliente_id
    where vi.equipo_id = (select id from eq)
    order by v.fecha desc
    limit 1
  )
  select eq.id, eq.imei, eq.modelo, eq.gb, eq.color, eq.estado::text,
         vt.id, vt.fecha, vt.tienda, vt.cliente, vt.telefono,
         case when vt.fecha is null then null
              else floor(extract(epoch from (now() - vt.fecha)) / 86400)::int end
  from eq left join vt on true
$$;

-- ingresar garantía
create or replace function public.crear_garantia(
  _imei text, _cliente_nombre text, _cliente_telefono text,
  _falla text, _notas text, _tienda uuid
) returns uuid
language plpgsql
security definer
set search_path to public
as $$
declare
  v_rol app_rol := public.mi_rol();
  v_mi uuid := public.mi_usuario_id();
  v_eq public.equipos;
  v_g uuid;
  v_imei text := trim(coalesce(_imei, ''));
begin
  if v_rol is null then raise exception 'Sesión no válida'; end if;
  if not public.puede_operar_garantias() then
    raise exception 'Tu rol no puede ingresar garantías';
  end if;
  if _tienda is null then raise exception 'Falta la tienda que recibe la garantía'; end if;
  if v_rol in ('vendedor','jefe_tienda') and _tienda is distinct from public.mi_tienda() then
    raise exception 'Solo puedes ingresar garantías en tu tienda';
  end if;
  if v_imei !~ '^\d{15}$' then raise exception 'El IMEI debe tener 15 dígitos'; end if;
  if nullif(trim(coalesce(_falla,'')), '') is null then
    raise exception 'Describe la falla del equipo';
  end if;
  if nullif(trim(coalesce(_cliente_nombre,'')), '') is null then
    raise exception 'Falta el nombre del cliente';
  end if;

  select * into v_eq from public.equipos where imei = v_imei for update;

  if exists (select 1 from public.garantias where imei = v_imei and estado = 'abierta') then
    raise exception 'Ese IMEI ya tiene una garantía abierta';
  end if;

  insert into public.garantias
    (imei, equipo_id, cliente_nombre, cliente_telefono, falla, notas,
     estado, tienda_id, recibio_id)
  values
    (v_imei, v_eq.id, trim(_cliente_nombre), nullif(trim(coalesce(_cliente_telefono,'')), ''),
     trim(_falla), nullif(trim(coalesce(_notas,'')), ''), 'abierta', _tienda, v_mi)
  returning id into v_g;

  if v_eq.id is not null then
    update public.equipos
      set estado = 'GARANTIA', ubicacion_id = _tienda, updated_at = now()
      where id = v_eq.id;
    insert into public.equipos_historial (equipo_id, evento, usuario_id)
    values (v_eq.id, 'entró en garantía: ' || trim(_falla), v_mi);
  end if;

  return v_g;
end $$;

-- mandar a técnico desde la garantía
create or replace function public.garantia_mandar_tecnico(_garantia uuid, _servicios jsonb)
returns int
language plpgsql
security definer
set search_path to public
as $$
declare
  v_mi uuid := public.mi_usuario_id();
  v_g public.garantias;
  v_s jsonb;
  v_costo bigint;
  v_total bigint := 0;
  v_n int := 0;
begin
  if not public.puede_operar_garantias() then
    raise exception 'Tu rol no puede operar garantías';
  end if;
  select * into v_g from public.garantias where id = _garantia;
  if v_g.id is null then raise exception 'La garantía no existe'; end if;
  if v_g.estado <> 'abierta' then raise exception 'Esa garantía ya está cerrada'; end if;
  if v_g.equipo_id is null then
    raise exception 'Ese equipo no está en el inventario, no se puede mandar a técnico';
  end if;
  if _servicios is null or jsonb_array_length(_servicios) = 0 then
    raise exception 'Elige al menos un arreglo';
  end if;

  for v_s in select * from jsonb_array_elements(_servicios) loop
    v_costo := greatest(0, coalesce((v_s->>'costo')::bigint, 0));
    insert into public.servicios_equipo (equipo_id, tipo, costo, estado)
    values (v_g.equipo_id, (v_s->>'tipo')::tipo_servicio, v_costo, 'pendiente');
    v_total := v_total + v_costo;
    v_n := v_n + 1;
  end loop;

  perform set_config('app.costo_sistema', '1', true);
  update public.equipos
    set costo = coalesce(costo, 0) + v_total, estado = 'POR_REVISAR', updated_at = now()
    where id = v_g.equipo_id;
  perform set_config('app.costo_sistema', '0', true);

  insert into public.equipos_historial (equipo_id, evento, usuario_id)
  values (v_g.equipo_id, 'garantía: ' || v_n || ' arreglo(s) por hacer', v_mi);

  return v_n;
end $$;

-- resolver: reparado
create or replace function public.resolver_garantia_reparado(_garantia uuid)
returns void
language plpgsql
security definer
set search_path to public
as $$
declare
  v_mi uuid := public.mi_usuario_id();
  v_g public.garantias;
begin
  if not public.puede_operar_garantias() then
    raise exception 'Tu rol no puede resolver garantías';
  end if;
  select * into v_g from public.garantias where id = _garantia for update;
  if v_g.id is null then raise exception 'La garantía no existe'; end if;
  if v_g.estado <> 'abierta' then raise exception 'Esa garantía ya está cerrada'; end if;
  if public.mi_rol() in ('vendedor','jefe_tienda')
     and v_g.tienda_id is distinct from public.mi_tienda() then
    raise exception 'Solo puedes resolver garantías de tu tienda';
  end if;

  update public.garantias
    set estado = 'resuelta', resolucion = 'reparado', fecha_cierre = now()
    where id = _garantia;

  if v_g.equipo_id is not null then
    update public.equipos set estado = 'ENTREGADO', updated_at = now() where id = v_g.equipo_id;
    insert into public.equipos_historial (equipo_id, evento, usuario_id)
    values (v_g.equipo_id, 'garantía resuelta: reparado y devuelto al cliente', v_mi);
  end if;
end $$;

-- resolver: cambio por otro equipo
create or replace function public.resolver_garantia_cambio(
  _garantia uuid, _imei_reemplazo text, _diferencia bigint
) returns void
language plpgsql
security definer
set search_path to public
as $$
declare
  v_mi uuid := public.mi_usuario_id();
  v_g public.garantias;
  v_rep public.equipos;
  v_dif bigint := greatest(0, coalesce(_diferencia, 0));
  v_arreglo bigint;
  v_nuevo bigint;
  v_n int;
begin
  if not public.puede_operar_garantias() then
    raise exception 'Tu rol no puede resolver garantías';
  end if;
  select * into v_g from public.garantias where id = _garantia for update;
  if v_g.id is null then raise exception 'La garantía no existe'; end if;
  if v_g.estado <> 'abierta' then raise exception 'Esa garantía ya está cerrada'; end if;
  if public.mi_rol() in ('vendedor','jefe_tienda')
     and v_g.tienda_id is distinct from public.mi_tienda() then
    raise exception 'Solo puedes resolver garantías de tu tienda';
  end if;

  select * into v_rep from public.equipos where imei = trim(_imei_reemplazo) for update;
  if v_rep.id is null then raise exception 'El IMEI de reemplazo no está en el sistema'; end if;
  if v_rep.id = v_g.equipo_id then raise exception 'El reemplazo debe ser otro equipo'; end if;

  update public.equipos set estado = 'ENTREGADO', updated_at = now()
    where id = v_rep.id and estado = 'DISPONIBLE';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'El equipo de reemplazo (IMEI %) ya no está disponible', v_rep.imei;
  end if;

  v_arreglo := public.garantia_costo_arreglo(_garantia);
  v_nuevo := greatest(0, coalesce(v_rep.costo, 0) - v_dif + coalesce(v_arreglo, 0));

  if v_g.equipo_id is not null then
    perform set_config('app.costo_sistema', '1', true);
    update public.equipos
      set estado = 'POR_REVISAR', costo = v_nuevo, ubicacion_id = v_g.tienda_id,
          fecha_ingreso = now(), updated_at = now()
      where id = v_g.equipo_id;
    perform set_config('app.costo_sistema', '0', true);

    insert into public.equipos_historial (equipo_id, evento, usuario_id)
    values (v_g.equipo_id,
            'garantía resuelta con cambio: vuelve al inventario por revisar (entregado IMEI '
            || v_rep.imei || ')', v_mi);
  end if;

  insert into public.equipos_historial (equipo_id, evento, usuario_id)
  values (v_rep.id, 'entregado como cambio de garantía del IMEI ' || v_g.imei, v_mi);

  update public.garantias
    set estado = 'resuelta', resolucion = 'cambio', fecha_cierre = now(),
        imei_entregado = v_rep.imei, diferencia = v_dif
    where id = _garantia;
end $$;

grant execute on function public.garantia_buscar_imei(text) to authenticated;
grant execute on function public.crear_garantia(text, text, text, text, text, uuid) to authenticated;
grant execute on function public.garantia_mandar_tecnico(uuid, jsonb) to authenticated;
grant execute on function public.resolver_garantia_reparado(uuid) to authenticated;
grant execute on function public.resolver_garantia_cambio(uuid, text, bigint) to authenticated;
grant execute on function public.puede_operar_garantias() to authenticated;
grant execute on function public.garantia_costo_arreglo(uuid) to authenticated;