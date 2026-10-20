/* Arqueo de bodega · equipos pendientes:
   - Al terminar un arqueo, lo que no se escaneó pasa al estado PENDIENTE: se ve en Inventario,
     no en Stock, y no se vende, reserva, traslada ni va a técnico. No cuenta en el capital ni en
     el Dashboard (esos solo suman disponibles).
   - Si en un arqueo nuevo se escanea un pendiente, se avisa y se puede resolver en el momento.
   - Cada pendiente se resuelve eligiendo qué pasó (encontrado en bodega, estaba en otra
     ubicación, se vendió sin registrar, se cambió por otro equipo o error de registro) o se
     marca como perdido. Todo queda en Auditoría con estado anterior y nuevo.
   - Historia completa del equipo para revisarlo antes de resolver.
   Aplicar a mano desde el editor SQL (Lovable Cloud), DESPUÉS de 20261021120000_estado_pendiente.sql. */

-- 1) Pendientes: guardar cómo se resolvió --------------------------------------------------------
alter table public.arqueo_pendientes
  add column if not exists causa text,
  add column if not exists nota_resolucion text,
  add column if not exists resuelto_por uuid references public.usuarios(id) on delete set null,
  add column if not exists resuelto_at timestamptz;
alter table public.arqueo_pendientes drop constraint if exists arqueo_pendientes_estado_check;
alter table public.arqueo_pendientes add constraint arqueo_pendientes_estado_check
  check (estado in ('pendiente', 'perdido', 'aparecio', 'resuelto'));

-- 2) Los pendientes de arqueos ya terminados pasan al estado PENDIENTE -----------------------------
with afectados as (
  update public.equipos e
     set estado = 'PENDIENTE', updated_at = now()
   where e.estado = 'DISPONIBLE'
     and exists (
       select 1 from public.arqueo_pendientes p
       join public.arqueos a on a.id = p.arqueo_id
       where p.equipo_id = e.id and p.estado = 'pendiente' and e.ubicacion_id = a.tienda_id
         and not exists (
           select 1 from public.arqueo_escaneos s
           join public.arqueos o on o.id = s.arqueo_id
           where s.equipo_id = e.id and o.estado <> 'cancelado' and s.fecha > a.cerrado_at))
  returning e.id
)
insert into public.equipos_historial (equipo_id, evento)
select id, 'Pendiente: faltó en un arqueo de bodega y no se ha encontrado' from afectados;

-- 3) Terminar arqueo: lo que falta queda PENDIENTE --------------------------------------------------
create or replace function public.arqueo_terminar(_arqueo uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_a public.arqueos;
  v_aqui int;
  v_otro int;
  v_faltan int;
  v_salieron int;
  v_abiertos int;
  v_ids uuid[];
begin
  if not public.puede_arquear() then raise exception 'Solo dirección y administración hacen arqueos'; end if;
  select * into v_a from public.arqueos where id = _arqueo for update;
  if v_a.id is null then raise exception 'Ese arqueo no existe'; end if;
  if v_a.estado not in ('abierto', 'pausado') then raise exception 'Ese arqueo ya está %', v_a.estado; end if;

  select coalesce(array_agg(f), '{}') into v_ids from public.arqueo_faltan(_arqueo) f;

  insert into public.arqueo_pendientes (arqueo_id, equipo_id)
  select _arqueo, unnest(v_ids)
  on conflict (arqueo_id, equipo_id) do nothing;
  get diagnostics v_faltan = row_count;

  update public.equipos set estado = 'PENDIENTE', updated_at = now()
  where id = any(v_ids) and estado = 'DISPONIBLE';
  insert into public.equipos_historial (equipo_id, evento, usuario_id)
  select unnest(v_ids), 'Pendiente: faltó en el arqueo de bodega del '
         || to_char(now() at time zone 'America/Santiago', 'DD-MM-YYYY'), public.mi_usuario_id();

  select count(*) into v_aqui from public.arqueo_escaneos where arqueo_id = _arqueo;
  select count(*) into v_otro
  from public.arqueo_items i
  where i.arqueo_id = _arqueo
    and not exists (select 1 from public.arqueo_escaneos s where s.arqueo_id = _arqueo and s.equipo_id = i.equipo_id)
    and exists (
      select 1 from public.arqueo_escaneos s
      join public.arqueos o on o.id = s.arqueo_id
      where s.equipo_id = i.equipo_id and o.id <> _arqueo and o.estado <> 'cancelado'
        and (o.cerrado_at is null or o.cerrado_at >= v_a.abierto_at));
  v_salieron := greatest(0, v_a.esperados - v_aqui - v_otro - v_faltan);

  update public.arqueos
     set estado = 'terminado', cerrado_por = public.mi_usuario_id(), cerrado_at = now(),
         escaneados = v_aqui, contados_en_otro = v_otro, salieron = v_salieron, faltantes = v_faltan
   where id = _arqueo;

  select count(*) into v_abiertos from public.arqueos
  where estado in ('abierto', 'pausado') and id <> _arqueo;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('arqueo_terminado',
          jsonb_build_object('arqueo', _arqueo, 'esperados', v_a.esperados, 'escaneados', v_aqui,
                             'contados_en_otro', v_otro, 'salieron', v_salieron, 'faltantes', v_faltan),
          public.mi_usuario_id(), public.mi_rol()::text, v_a.tienda_id);

  return jsonb_build_object('esperados', v_a.esperados, 'escaneados', v_aqui,
                            'contados_en_otro', v_otro, 'salieron', v_salieron,
                            'faltantes', v_faltan, 'otros_abiertos', v_abiertos);
end $$;

-- 4) Escanear: un pendiente se avisa para resolverlo en el momento ---------------------------------
create or replace function public.arqueo_escanear(_arqueo uuid, _imei text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_a public.arqueos;
  v_eq public.equipos;
  v_imei text := regexp_replace(coalesce(_imei, ''), '\D', '', 'g');
  v_por text;
  v_fecha timestamptz;
  v_mismo boolean;
  v_desde timestamptz;
begin
  if not public.puede_arquear() then raise exception 'Solo dirección y administración hacen arqueos'; end if;
  select * into v_a from public.arqueos where id = _arqueo;
  if v_a.id is null then raise exception 'Ese arqueo no existe'; end if;
  if v_a.estado in ('terminado', 'cancelado') then raise exception 'Ese arqueo ya está %', v_a.estado; end if;
  if v_a.estado = 'pausado' then
    update public.arqueos set estado = 'abierto' where id = _arqueo;
  end if;

  select * into v_eq from public.equipos where imei = v_imei;
  if v_eq.id is null then
    return jsonb_build_object('resultado', 'no_en_lista', 'motivo', 'no_existe', 'imei', v_imei);
  end if;

  if v_eq.estado = 'PENDIENTE' then
    select min(a.cerrado_at) into v_desde
    from public.arqueo_pendientes p join public.arqueos a on a.id = p.arqueo_id
    where p.equipo_id = v_eq.id and p.estado = 'pendiente';
    return jsonb_build_object('resultado', 'pendiente', 'equipo_id', v_eq.id, 'imei', v_eq.imei,
                              'modelo', v_eq.modelo, 'gb', v_eq.gb, 'color', v_eq.color,
                              'desde', v_desde);
  end if;

  if not exists (select 1 from public.arqueo_items where arqueo_id = _arqueo and equipo_id = v_eq.id)
     or v_eq.estado <> 'DISPONIBLE' or v_eq.ubicacion_id is distinct from v_a.tienda_id then
    return jsonb_build_object('resultado', 'no_en_lista', 'motivo', 'fuera', 'imei', v_imei,
                              'modelo', v_eq.modelo, 'estado', v_eq.estado::text,
                              'tienda', (select nombre from public.tiendas where id = v_eq.ubicacion_id));
  end if;

  select u.nombre, s.fecha, s.arqueo_id = _arqueo into v_por, v_fecha, v_mismo
  from public.arqueo_escaneos s
  join public.arqueos o on o.id = s.arqueo_id
  left join public.usuarios u on u.id = s.usuario_id
  where s.equipo_id = v_eq.id
    and o.estado <> 'cancelado'
    and (o.cerrado_at is null or o.cerrado_at >= v_a.abierto_at)
  order by s.fecha
  limit 1;
  if v_fecha is not null then
    return jsonb_build_object('resultado', 'ya_escaneado', 'imei', v_imei, 'modelo', v_eq.modelo,
                              'por', v_por, 'fecha', v_fecha, 'mismo_arqueo', v_mismo);
  end if;

  insert into public.arqueo_escaneos (arqueo_id, equipo_id, usuario_id)
  values (_arqueo, v_eq.id, public.mi_usuario_id())
  on conflict (arqueo_id, equipo_id) do nothing;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('arqueo_escaneo', jsonb_build_object('arqueo', _arqueo, 'imei', v_eq.imei, 'modelo', v_eq.modelo),
          public.mi_usuario_id(), public.mi_rol()::text, v_a.tienda_id);

  return jsonb_build_object('resultado', 'ok', 'equipo_id', v_eq.id, 'imei', v_eq.imei,
                            'modelo', v_eq.modelo, 'gb', v_eq.gb, 'color', v_eq.color);
end $$;

-- 5) Lista de pendientes, con los días que lleva cada uno ------------------------------------------
drop function if exists public.arqueo_pendientes_lista();
create function public.arqueo_pendientes_lista()
returns table (
  pendiente_id uuid, arqueo_id uuid, desde timestamptz, dias int, equipo_id uuid,
  imei text, modelo text, gb int, color text, sim text, ubicacion text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.arqueo_id, d.desde,
         greatest(0, floor(extract(epoch from (now() - d.desde)) / 86400))::int,
         e.id, e.imei, e.modelo, e.gb, e.color, e.sim, t.nombre
  from public.equipos e
  left join public.tiendas t on t.id = e.ubicacion_id
  left join lateral (
    select min(a.cerrado_at) as desde from public.arqueo_pendientes ap
    join public.arqueos a on a.id = ap.arqueo_id
    where ap.equipo_id = e.id and ap.estado = 'pendiente'
  ) d on true
  left join lateral (
    select ap.id, ap.arqueo_id from public.arqueo_pendientes ap
    join public.arqueos a on a.id = ap.arqueo_id
    where ap.equipo_id = e.id and ap.estado = 'pendiente'
    order by a.cerrado_at desc limit 1
  ) p on true
  where public.puede_arquear() and e.estado = 'PENDIENTE'
  order by d.desde nulls last, e.modelo
$$;
revoke all on function public.arqueo_pendientes_lista() from public, anon;
grant execute on function public.arqueo_pendientes_lista() to authenticated;

-- 6) Marcar como perdido: ahora desde PENDIENTE ----------------------------------------------------
create or replace function public.arqueo_marcar_perdido(_pendiente uuid, _nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_p public.arqueo_pendientes;
  v_eq public.equipos;
  v_nota text := nullif(trim(coalesce(_nota, '')), '');
begin
  if not public.puede_arquear() then raise exception 'Solo dirección y administración hacen arqueos'; end if;
  select * into v_p from public.arqueo_pendientes where id = _pendiente for update;
  if v_p.id is null then raise exception 'Ese pendiente no existe'; end if;
  if v_p.estado <> 'pendiente' then raise exception 'Ese equipo ya está marcado (%)', v_p.estado; end if;
  select * into v_eq from public.equipos where id = v_p.equipo_id for update;
  if v_eq.estado not in ('PENDIENTE', 'DISPONIBLE') then
    raise exception 'El equipo está % : no se puede marcar como perdido', v_eq.estado;
  end if;

  update public.equipos set estado = 'PERDIDO', updated_at = now() where id = v_eq.id;
  update public.arqueo_pendientes
     set estado = 'perdido', nota = v_nota, marcado_por = public.mi_usuario_id(), marcado_at = now()
   where equipo_id = v_eq.id and estado = 'pendiente';

  insert into public.equipos_historial (equipo_id, evento, usuario_id)
  values (v_eq.id, 'marcado como perdido tras el arqueo de bodega' || coalesce(': ' || v_nota, ''),
          public.mi_usuario_id());
  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('equipo_perdido',
          jsonb_build_object('imei', v_eq.imei, 'modelo', v_eq.modelo, 'nota', v_nota, 'arqueo', v_p.arqueo_id,
                             'estado_antes', v_eq.estado::text, 'estado_despues', 'PERDIDO'),
          public.mi_usuario_id(), public.mi_rol()::text, v_eq.ubicacion_id);
end $$;

-- 7) Resolver un pendiente -------------------------------------------------------------------------
/* _causa y _datos:
   encontrado_bodega      {}
   otra_ubicacion         {"ubicacion_id": uuid, "estado": "DISPONIBLE" | "EN_TECNICO"}
   vendido_sin_registrar  {"ubicacion_id": uuid}  (queda disponible allí y se abre Vender)
   cambio                 {"imei_otro": "...", "estado": "ENTREGADO" | "GARANTIA"}
   error_registro         {"accion": "corregir_imei", "imei_nuevo": "..."} o {"accion": "baja_duplicado"} */
create or replace function public.pendiente_resolver(_equipo uuid, _causa text, _datos jsonb default '{}', _nota text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_mi uuid := public.mi_usuario_id();
  v_eq public.equipos;
  v_nota text := nullif(trim(coalesce(_nota, '')), '');
  v_datos jsonb := coalesce(_datos, '{}'::jsonb);
  v_bodega uuid;
  v_dest uuid;
  v_dest_nombre text;
  v_desde_nombre text;
  v_estado text;
  v_otro public.equipos;
  v_imei_nuevo text;
  v_texto text;
  v_resultado jsonb := '{}'::jsonb;
begin
  if not public.puede_arquear() then raise exception 'Solo dirección y administración resuelven pendientes'; end if;
  select * into v_eq from public.equipos where id = _equipo for update;
  if v_eq.id is null then raise exception 'Ese equipo no existe'; end if;
  if v_eq.estado <> 'PENDIENTE' then raise exception 'Ese equipo ya no está pendiente (%)', v_eq.estado; end if;
  select nombre into v_desde_nombre from public.tiendas where id = v_eq.ubicacion_id;

  if _causa in ('encontrado_bodega', 'otra_ubicacion', 'vendido_sin_registrar') then
    if _causa = 'encontrado_bodega' then
      select id into v_bodega from public.tiendas where es_bodega order by created_at limit 1;
      v_dest := coalesce(v_bodega, v_eq.ubicacion_id);
      v_estado := 'DISPONIBLE';
    else
      v_dest := nullif(v_datos->>'ubicacion_id', '')::uuid;
      if v_dest is null or not exists (select 1 from public.tiendas where id = v_dest) then
        raise exception 'Elige la ubicación correcta';
      end if;
      v_estado := case when _causa = 'otra_ubicacion' then coalesce(nullif(v_datos->>'estado', ''), 'DISPONIBLE')
                       else 'DISPONIBLE' end;
      if v_estado not in ('DISPONIBLE', 'EN_TECNICO') then raise exception 'Estado no válido'; end if;
    end if;
    select nombre into v_dest_nombre from public.tiendas where id = v_dest;

    if v_dest is distinct from v_eq.ubicacion_id then
      insert into public.movimientos (equipo_id, desde_id, hacia_id, usuario_id)
      values (v_eq.id, v_eq.ubicacion_id, v_dest, v_mi);
      insert into public.equipos_historial (equipo_id, evento, usuario_id)
      values (v_eq.id, 'traslado no registrado: ' || coalesce(v_desde_nombre, 'sin ubicación') || ' → '
              || coalesce(v_dest_nombre, '') || ' (anotado al resolver el pendiente)', v_mi);
    end if;
    update public.equipos set estado = v_estado::public.equipo_estado, ubicacion_id = v_dest, updated_at = now()
     where id = v_eq.id;

    v_texto := case _causa
      when 'encontrado_bodega' then 'Pendiente resuelto: encontrado en bodega'
      when 'otra_ubicacion' then 'Pendiente resuelto: estaba en ' || coalesce(v_dest_nombre, 'otra ubicación')
        || case when v_estado = 'EN_TECNICO' then ' (con el técnico)' else '' end
      else 'Pendiente resuelto: se vendió sin registrar en ' || coalesce(v_dest_nombre, '') || '; se registra la venta' end;
    if _causa = 'vendido_sin_registrar' then
      v_resultado := jsonb_build_object('abrir_venta', true, 'imei', v_eq.imei,
                                        'tienda_slug', (select slug from public.tiendas where id = v_dest));
    end if;

  elsif _causa = 'cambio' then
    select * into v_otro from public.equipos where imei = regexp_replace(coalesce(v_datos->>'imei_otro', ''), '\D', '', 'g');
    if v_otro.id is null then raise exception 'No encontré el otro equipo: escanea o escribe su IMEI'; end if;
    if v_otro.id = v_eq.id then raise exception 'Elige el otro equipo del cambio, no el mismo'; end if;
    v_estado := coalesce(nullif(v_datos->>'estado', ''), 'ENTREGADO');
    if v_estado not in ('ENTREGADO', 'GARANTIA') then raise exception 'Estado no válido'; end if;
    update public.equipos set estado = v_estado::public.equipo_estado, updated_at = now() where id = v_eq.id;
    insert into public.equipos_historial (equipo_id, evento, usuario_id)
    values (v_otro.id, 'vinculado por cambio con el IMEI ' || v_eq.imei || ' (pendiente resuelto)', v_mi);
    v_texto := 'Pendiente resuelto: se cambió por el IMEI ' || v_otro.imei
               || case when v_estado = 'GARANTIA' then ' (garantía no registrada)' else ' (cambio no registrado)' end;

  elsif _causa = 'error_registro' then
    if v_datos->>'accion' = 'corregir_imei' then
      v_imei_nuevo := regexp_replace(coalesce(v_datos->>'imei_nuevo', ''), '\D', '', 'g');
      if v_imei_nuevo !~ '^\d{15}$' then raise exception 'El IMEI correcto debe tener 15 dígitos'; end if;
      if v_imei_nuevo = v_eq.imei then raise exception 'Ese es el mismo IMEI'; end if;
      if exists (select 1 from public.equipos where imei = v_imei_nuevo) then
        raise exception 'El IMEI % ya existe en el sistema: si es el mismo equipo, usa "dar de baja el duplicado"', v_imei_nuevo;
      end if;
      update public.equipos set imei = v_imei_nuevo, estado = 'DISPONIBLE', updated_at = now() where id = v_eq.id;
      v_texto := 'Pendiente resuelto: IMEI mal ingresado, corregido de ' || v_eq.imei || ' a ' || v_imei_nuevo;
      v_estado := 'DISPONIBLE';
    elsif v_datos->>'accion' = 'baja_duplicado' then
      if exists (select 1 from public.venta_items where equipo_id = v_eq.id)
         or exists (select 1 from public.reserva_items where equipo_id = v_eq.id)
         or exists (select 1 from public.garantias where equipo_id = v_eq.id) then
        raise exception 'Este registro tiene ventas, reservas o garantías: no es un duplicado que se pueda dar de baja';
      end if;
      insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
      values ('equipo_eliminado_respaldo', jsonb_build_object('antes', to_jsonb(v_eq), 'motivo', 'duplicado (pendiente de arqueo)'),
              v_mi, public.mi_rol()::text, v_eq.ubicacion_id);
      v_estado := 'ELIMINADO';
      v_texto := 'Pendiente resuelto: registro duplicado dado de baja';
    else
      raise exception 'Elige si corriges el IMEI o das de baja el duplicado';
    end if;

  else
    raise exception 'Causa no válida';
  end if;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('pendiente_resuelto',
          jsonb_build_object('imei', v_eq.imei, 'modelo', v_eq.modelo, 'causa', _causa,
                             'estado_antes', 'PENDIENTE', 'estado_despues', v_estado,
                             'ubicacion_antes', v_desde_nombre, 'ubicacion_despues', coalesce(v_dest_nombre, v_desde_nombre),
                             'nota', v_nota, 'datos', v_datos),
          v_mi, public.mi_rol()::text, coalesce(v_dest, v_eq.ubicacion_id));

  if v_estado = 'ELIMINADO' then
    delete from public.equipos where id = v_eq.id;
  else
    update public.arqueo_pendientes
       set estado = 'resuelto', causa = _causa, nota_resolucion = v_nota,
           resuelto_por = v_mi, resuelto_at = now()
     where equipo_id = v_eq.id and estado = 'pendiente';
    insert into public.equipos_historial (equipo_id, evento, usuario_id)
    values (v_eq.id, v_texto || coalesce(' · ' || v_nota, ''), v_mi);
  end if;

  return v_resultado || jsonb_build_object('estado', v_estado);
end $$;
revoke all on function public.pendiente_resolver(uuid, text, jsonb, text) from public, anon;
grant execute on function public.pendiente_resolver(uuid, text, jsonb, text) to authenticated;

-- 8) Historia completa del equipo ------------------------------------------------------------------
/* "fisico" marca los eventos en que alguien tuvo el equipo en la mano (sirve para "última vez visto") */
create or replace function public.equipo_historia(_equipo uuid)
returns table (fecha timestamptz, tipo text, titulo text, detalle text, usuario text, fisico boolean)
language sql stable security definer set search_path = public as $$
  select * from (
    -- Ingreso
    select a.fecha, 'ingreso',
           'Ingreso al sistema en ' || coalesce(t.nombre, 'sin ubicación'),
           concat_ws(' · ',
             'Proveedor: ' || nullif(a.detalle->'despues'->>'proveedor', ''),
             case when coalesce(a.detalle->'despues'->>'proveedor', '') ilike '%parte de pago%'
                  then 'llegó en parte de pago' end,
             nullif(a.detalle->'despues'->>'notas', '')),
           u.nombre, true
    from public.auditoria a
    left join public.usuarios u on u.id = a.usuario_id
    left join public.tiendas t on t.id = nullif(a.detalle->'despues'->>'ubicacion_id', '')::uuid
    where a.accion = 'equipos.insert' and a.detalle->'despues'->>'id' = _equipo::text

    union all
    -- Cambios de estado
    select a.fecha, 'estado',
           'Estado: ' || initcap(replace(lower(a.detalle->'antes'->>'estado'), '_', ' ')) || ' → '
             || initcap(replace(lower(a.detalle->'despues'->>'estado'), '_', ' ')),
           null, u.nombre, false
    from public.auditoria a
    left join public.usuarios u on u.id = a.usuario_id
    where a.accion = 'equipos.update' and a.detalle->'antes'->>'id' = _equipo::text
      and a.detalle->'antes'->>'estado' is distinct from a.detalle->'despues'->>'estado'

    union all
    -- Traslados
    select m.fecha, 'movimiento',
           'Traslado: ' || coalesce(td.nombre, 'sin origen') || ' → ' || coalesce(th.nombre, 'sin destino'),
           null, u.nombre, true
    from public.movimientos m
    left join public.tiendas td on td.id = m.desde_id
    left join public.tiendas th on th.id = m.hacia_id
    left join public.usuarios u on u.id = m.usuario_id
    where m.equipo_id = _equipo

    union all
    -- Bitácora (sin los traslados, que ya salen arriba)
    select h.fecha, 'bitacora', h.evento, null, u.nombre, false
    from public.equipos_historial h
    left join public.usuarios u on u.id = h.usuario_id
    where h.equipo_id = _equipo and h.evento not ilike 'traslado de %' and h.evento <> 'Comentario en bitácora'

    union all
    -- Ventas
    select v.fecha, 'venta',
           case when v.anulada then 'Venta anulada' else 'Venta' end
             || coalesce(' ' || v.comprobante_numero, '') || ' en ' || coalesce(t.nombre, ''),
           case when v.anulada and v.fecha_anulacion is not null
                then 'Anulada el ' || to_char(v.fecha_anulacion at time zone 'America/Santiago', 'DD-MM-YYYY HH24:MI') end,
           u.nombre, true
    from public.venta_items vi
    join public.ventas v on v.id = vi.venta_id
    left join public.tiendas t on t.id = v.tienda_id
    left join public.usuarios u on u.id = v.vendedor_id
    where vi.equipo_id = _equipo

    union all
    -- Reservas
    select r.fecha, 'reserva', 'Reserva en ' || coalesce(t.nombre, '') || ' (' || r.estado || ')', null, u.nombre, false
    from public.reserva_items ri
    join public.reservas r on r.id = ri.reserva_id
    left join public.tiendas t on t.id = r.tienda_id
    left join public.usuarios u on u.id = r.vendedor_id
    where ri.equipo_id = _equipo

    union all
    -- Garantías: ingreso y resolución
    select g.fecha, 'garantia', 'Entró en garantía en ' || coalesce(t.nombre, ''), g.falla, u.nombre, true
    from public.garantias g
    left join public.tiendas t on t.id = g.tienda_id
    left join public.usuarios u on u.id = g.recibio_id
    where g.equipo_id = _equipo
    union all
    select g.fecha_cierre, 'garantia',
           'Garantía resuelta: ' || coalesce(g.resolucion, g.estado)
             || coalesce(' (se entregó el IMEI ' || g.imei_entregado || ')', ''),
           null, null, false
    from public.garantias g
    where g.equipo_id = _equipo and g.fecha_cierre is not null

    union all
    -- Taller
    select coalesce(s.listo_at, s.asignado_at, s.created_at), 'taller',
           'Taller: ' || s.tipo::text || ' · ' || s.estado,
           'Técnico: ' || tc.nombre, null, s.listo_at is not null
    from public.servicios_equipo s
    left join public.tecnicos tc on tc.id = s.tecnico_id
    where s.equipo_id = _equipo

    union all
    -- Arqueos: escaneado
    select s.fecha, 'arqueo',
           'Escaneado en el arqueo de bodega' || case when a.estado = 'cancelado' then ' (arqueo cancelado)' else '' end,
           null, u.nombre, true
    from public.arqueo_escaneos s
    join public.arqueos a on a.id = s.arqueo_id
    left join public.usuarios u on u.id = s.usuario_id
    where s.equipo_id = _equipo

    union all
    -- Arqueos: faltó, perdido, apareció, resuelto
    select a.cerrado_at, 'arqueo', 'Faltó en el arqueo de bodega', null, u.nombre, false
    from public.arqueo_pendientes p
    join public.arqueos a on a.id = p.arqueo_id
    left join public.usuarios u on u.id = a.cerrado_por
    where p.equipo_id = _equipo
    union all
    select p.marcado_at, 'arqueo', 'Marcado como perdido', p.nota, u.nombre, false
    from public.arqueo_pendientes p left join public.usuarios u on u.id = p.marcado_por
    where p.equipo_id = _equipo and p.marcado_at is not null
    union all
    select p.aparecio_at, 'arqueo', 'Apareció: vuelve a disponible', null, u.nombre, true
    from public.arqueo_pendientes p left join public.usuarios u on u.id = p.aparecio_por
    where p.equipo_id = _equipo and p.aparecio_at is not null
  ) h(fecha, tipo, titulo, detalle, usuario, fisico)
  where public.puede_arquear() and h.fecha is not null
  order by h.fecha desc
$$;
revoke all on function public.equipo_historia(uuid) from public, anon;
grant execute on function public.equipo_historia(uuid) to authenticated;

-- 9) Un pendiente no se traslada, no va a técnico y no se puede volver a ingresar ----------------
do $$
declare
  v_fn text;
  v_def text;
  v_nuevo text;
begin
  foreach v_fn in array array[
    'public.trasladar_equipos(text[],uuid,uuid)',
    'public.asignar_equipos_tecnico(text[],uuid)',
    'public.agregar_servicios_equipo(uuid,jsonb)'
  ] loop
    if to_regprocedure(v_fn) is null then continue; end if;
    v_def := pg_get_functiondef(v_fn::regprocedure);
    if v_def like '%''PENDIENTE''%' then continue; end if;
    v_nuevo := regexp_replace(v_def, '''PERDIDO''\)', '''PERDIDO'', ''PENDIENTE'')', 'g');
    if v_nuevo = v_def then
      raise notice '% es distinta a la esperada: no se cambió', v_fn;
    else
      execute v_nuevo;
    end if;
  end loop;

  v_def := pg_get_functiondef('public.fn_equipos_reingreso()'::regprocedure);
  if v_def not like '%''PENDIENTE''%' then
    v_nuevo := regexp_replace(v_def, '''RESERVADO'',\s*''GARANTIA''\)', '''RESERVADO'',''GARANTIA'',''PENDIENTE'')');
    if v_nuevo = v_def then
      raise notice 'fn_equipos_reingreso es distinta a la esperada: no se cambió';
    else
      execute v_nuevo;
    end if;
  end if;
end $$;

-- Resultado para el editor: cuántos equipos quedaron pendientes
select count(*) as equipos_pendientes from public.equipos where estado = 'PENDIENTE';
