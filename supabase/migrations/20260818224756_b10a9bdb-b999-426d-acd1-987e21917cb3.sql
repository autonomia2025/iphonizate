create or replace function public.crear_reserva(
  _tienda uuid,
  _cliente uuid,
  _items jsonb,
  _abono bigint,
  _pagos jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol app_rol;
  v_mi uuid;
  v_it jsonb;
  v_pg jsonb;
  v_reserva uuid;
  v_total bigint := 0;
  v_pagado bigint := 0;
  v_n int;
  v_costo bigint;
  v_precio bigint;
  v_cant int;
  v_imei text;
  v_modelo text;
  v_metodo text;
  v_nombre text;
  v_acc text;
begin
  v_rol := public.mi_rol();
  v_mi := public.mi_usuario_id();
  if v_rol is null then raise exception 'Sesión no válida'; end if;
  if v_rol not in ('direccion','jefe_tienda','administracion','vendedor') then
    raise exception 'Tu rol no puede crear reservas';
  end if;
  if _tienda is null then raise exception 'Falta la tienda de la reserva'; end if;
  if not public.puede_ver_tienda(_tienda) then
    raise exception 'No puedes reservar equipos de esa tienda';
  end if;
  if _cliente is null then raise exception 'La reserva necesita un cliente'; end if;
  if _items is null or jsonb_array_length(_items) = 0 then
    raise exception 'La reserva no tiene ítems';
  end if;
  if _pagos is null or jsonb_array_length(_pagos) = 0 then
    raise exception 'Debes registrar el pago del abono';
  end if;

  for v_it in select * from jsonb_array_elements(_items) loop
    v_precio := coalesce((v_it->>'precio')::bigint, 0);
    if (v_it->>'tipo') = 'equipo' then
      if v_precio <= 0 then raise exception 'Hay un equipo sin precio en la reserva'; end if;
      select imei, modelo into v_imei, v_modelo
      from public.equipos where id = (v_it->>'equipo_id')::uuid for update;
      if v_imei is null then raise exception 'Uno de los equipos ya no existe'; end if;

      update public.equipos
        set estado = 'RESERVADO', ubicacion_id = _tienda, updated_at = now()
        where id = (v_it->>'equipo_id')::uuid and estado = 'DISPONIBLE';
      get diagnostics v_n = row_count;
      if v_n = 0 then
        raise exception 'El equipo % (IMEI %) ya no está disponible: otra venta o reserva lo tomó. Quítalo del carrito.', v_modelo, v_imei;
      end if;
      v_total := v_total + v_precio;
    elsif (v_it->>'tipo') = 'accesorio' then
      v_cant := greatest(1, coalesce((v_it->>'cantidad')::int, 1));
      select nombre into v_acc from public.accesorios where id = (v_it->>'accesorio_id')::uuid;
      if v_acc is null then raise exception 'Uno de los accesorios ya no existe'; end if;
      v_total := v_total + v_precio * v_cant;
    else
      raise exception 'Ítem de reserva no reconocido';
    end if;
  end loop;

  if coalesce(_abono, 0) <= 0 then raise exception 'El abono debe ser mayor que cero'; end if;
  if _abono >= v_total then
    raise exception 'El abono (%) no puede cubrir el total (%): eso ya es una venta', _abono, v_total;
  end if;

  for v_pg in select * from jsonb_array_elements(_pagos) loop
    v_metodo := v_pg->>'metodo';
    v_nombre := nullif(trim(coalesce(v_pg->>'nombre_pagador', '')), '');
    if v_metodo not in ('efectivo','transferencia','credito','partePago') then
      raise exception 'Método de pago no reconocido';
    end if;
    if v_metodo in ('transferencia','credito') and v_nombre is null then
      raise exception 'Falta el nombre de quien transfirió en uno de los pagos';
    end if;
    if v_metodo = 'partePago' and v_nombre is null then
      raise exception 'Describe el equipo recibido como parte de pago';
    end if;
    v_pagado := v_pagado + coalesce((v_pg->>'monto')::bigint, 0);
  end loop;

  if v_pagado <> _abono then
    raise exception 'Los pagos (%) no cuadran con el abono (%)', v_pagado, _abono;
  end if;

  insert into public.reservas (cliente_id, tienda_id, vendedor_id, total, abono, saldo, estado)
  values (_cliente, _tienda, v_mi, v_total, _abono, v_total - _abono, 'activa')
  returning id into v_reserva;

  for v_it in select * from jsonb_array_elements(_items) loop
    v_precio := coalesce((v_it->>'precio')::bigint, 0);
    if (v_it->>'tipo') = 'equipo' then
      select costo into v_costo from public.equipos where id = (v_it->>'equipo_id')::uuid;
      insert into public.reserva_items (reserva_id, equipo_id, precio, costo_snapshot)
      values (v_reserva, (v_it->>'equipo_id')::uuid, v_precio, coalesce(v_costo, 0));

      insert into public.equipos_historial (equipo_id, evento, usuario_id)
      values ((v_it->>'equipo_id')::uuid, 'Reservado con abono', v_mi);
    else
      v_cant := greatest(1, coalesce((v_it->>'cantidad')::int, 1));
      select costo into v_costo from public.accesorios where id = (v_it->>'accesorio_id')::uuid;
      for i in 1..v_cant loop
        insert into public.reserva_items (reserva_id, accesorio_id, precio, costo_snapshot)
        values (v_reserva, (v_it->>'accesorio_id')::uuid, v_precio, coalesce(v_costo, 0));
      end loop;
    end if;
  end loop;

  for v_pg in select * from jsonb_array_elements(_pagos) loop
    insert into public.pagos (reserva_id, metodo, monto, nombre_pagador)
    values (
      v_reserva,
      (v_pg->>'metodo')::metodo_pago,
      coalesce((v_pg->>'monto')::bigint, 0),
      nullif(trim(coalesce(v_pg->>'nombre_pagador', '')), '')
    );
  end loop;

  return v_reserva;
end $$;

revoke all on function public.crear_reserva(uuid, uuid, jsonb, bigint, jsonb) from public;
revoke execute on function public.crear_reserva(uuid, uuid, jsonb, bigint, jsonb) from anon;
grant execute on function public.crear_reserva(uuid, uuid, jsonb, bigint, jsonb) to authenticated;

create or replace function public.completar_reserva(
  _reserva uuid,
  _pagos jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol app_rol;
  v_mi uuid;
  v_r record;
  v_it record;
  v_pg jsonb;
  v_venta uuid;
  v_ganancia bigint := 0;
  v_pagado bigint := 0;
  v_metodo text;
  v_nombre text;
  v_n int;
  v_imei text;
  v_modelo text;
  v_stock int;
  v_acc text;
begin
  v_rol := public.mi_rol();
  v_mi := public.mi_usuario_id();
  if v_rol is null then raise exception 'Sesión no válida'; end if;
  if v_rol not in ('direccion','jefe_tienda','administracion','vendedor') then
    raise exception 'Tu rol no puede completar reservas';
  end if;

  select * into v_r from public.reservas where id = _reserva for update;
  if v_r.id is null then raise exception 'Esa reserva no existe'; end if;
  if not public.puede_ver_tienda(v_r.tienda_id) then
    raise exception 'No puedes completar reservas de otra tienda';
  end if;
  if v_r.estado <> 'activa' then raise exception 'Esa reserva ya está %', v_r.estado; end if;

  for v_pg in select * from jsonb_array_elements(coalesce(_pagos, '[]'::jsonb)) loop
    v_metodo := v_pg->>'metodo';
    v_nombre := nullif(trim(coalesce(v_pg->>'nombre_pagador', '')), '');
    if v_metodo not in ('efectivo','transferencia','credito','partePago') then
      raise exception 'Método de pago no reconocido';
    end if;
    if v_metodo in ('transferencia','credito') and v_nombre is null then
      raise exception 'Falta el nombre de quien transfirió en uno de los pagos';
    end if;
    if v_metodo = 'partePago' and v_nombre is null then
      raise exception 'Describe el equipo recibido como parte de pago';
    end if;
    v_pagado := v_pagado + coalesce((v_pg->>'monto')::bigint, 0);
  end loop;

  if v_pagado <> v_r.saldo then
    raise exception 'Los pagos (%) no cuadran con el saldo pendiente (%)', v_pagado, v_r.saldo;
  end if;

  for v_it in select * from public.reserva_items where reserva_id = _reserva loop
    if v_it.equipo_id is not null then
      select imei, modelo into v_imei, v_modelo from public.equipos
        where id = v_it.equipo_id for update;
      update public.equipos
        set estado = 'VENDIDO', ubicacion_id = v_r.tienda_id, updated_at = now()
        where id = v_it.equipo_id and estado = 'RESERVADO';
      get diagnostics v_n = row_count;
      if v_n = 0 then
        raise exception 'El equipo % (IMEI %) ya no está reservado: revisa su estado antes de cerrar', v_modelo, v_imei;
      end if;
    end if;
    v_ganancia := v_ganancia + (v_it.precio - coalesce(v_it.costo_snapshot, 0));
  end loop;

  insert into public.ventas (tienda_id, cliente_id, vendedor_id, total, ganancia, con_boleta, recargo_boleta, reserva_id)
  values (v_r.tienda_id, v_r.cliente_id, v_mi, v_r.total, v_ganancia, false, 0, _reserva)
  returning id into v_venta;

  for v_it in select * from public.reserva_items where reserva_id = _reserva loop
    insert into public.venta_items (venta_id, equipo_id, accesorio_id, precio, costo_snapshot)
    values (v_venta, v_it.equipo_id, v_it.accesorio_id, v_it.precio, coalesce(v_it.costo_snapshot, 0));

    if v_it.equipo_id is not null then
      insert into public.equipos_historial (equipo_id, evento, usuario_id)
      values (v_it.equipo_id, 'Vendido: reserva completada', v_mi);
    end if;
  end loop;

  for v_it in
    select accesorio_id, count(*)::int as cantidad
    from public.reserva_items
    where reserva_id = _reserva and accesorio_id is not null
    group by accesorio_id
  loop
    select nombre into v_acc from public.accesorios where id = v_it.accesorio_id;
    select cantidad into v_stock from public.accesorios_stock
      where accesorio_id = v_it.accesorio_id and tienda_id = v_r.tienda_id for update;
    if coalesce(v_stock, 0) < v_it.cantidad then
      raise exception 'No hay stock suficiente de % en esta tienda', v_acc;
    end if;
    update public.accesorios_stock set cantidad = cantidad - v_it.cantidad
      where accesorio_id = v_it.accesorio_id and tienda_id = v_r.tienda_id;
  end loop;

  for v_pg in select * from jsonb_array_elements(coalesce(_pagos, '[]'::jsonb)) loop
    insert into public.pagos (venta_id, metodo, monto, nombre_pagador)
    values (
      v_venta,
      (v_pg->>'metodo')::metodo_pago,
      coalesce((v_pg->>'monto')::bigint, 0),
      nullif(trim(coalesce(v_pg->>'nombre_pagador', '')), '')
    );
  end loop;

  update public.reservas set estado = 'completada', saldo = 0 where id = _reserva;

  return v_venta;
end $$;

revoke all on function public.completar_reserva(uuid, jsonb) from public;
revoke execute on function public.completar_reserva(uuid, jsonb) from anon;
grant execute on function public.completar_reserva(uuid, jsonb) to authenticated;

create or replace function public.cancelar_reserva(
  _reserva uuid,
  _destino_abono text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol app_rol;
  v_mi uuid;
  v_r record;
  v_it record;
begin
  v_rol := public.mi_rol();
  v_mi := public.mi_usuario_id();
  if v_rol is null then raise exception 'Sesión no válida'; end if;
  if v_rol not in ('direccion','jefe_tienda','administracion') then
    raise exception 'Tu rol no puede cancelar reservas';
  end if;
  if coalesce(_destino_abono, '') not in ('devuelto','retenido') then
    raise exception 'Indica si el abono se devuelve al cliente o se retiene';
  end if;

  select * into v_r from public.reservas where id = _reserva for update;
  if v_r.id is null then raise exception 'Esa reserva no existe'; end if;
  if not public.puede_ver_tienda(v_r.tienda_id) then
    raise exception 'No puedes cancelar reservas de otra tienda';
  end if;
  if v_r.estado <> 'activa' then raise exception 'Esa reserva ya está %', v_r.estado; end if;

  update public.reservas
    set estado = 'cancelada', destino_abono = _destino_abono
    where id = _reserva;

  for v_it in
    select equipo_id from public.reserva_items where reserva_id = _reserva and equipo_id is not null
  loop
    update public.equipos
      set estado = 'DISPONIBLE', ubicacion_id = coalesce(ubicacion_id, v_r.tienda_id), updated_at = now()
      where id = v_it.equipo_id and estado = 'RESERVADO';

    insert into public.equipos_historial (equipo_id, evento, usuario_id)
    values (v_it.equipo_id, 'Reserva cancelada: vuelve a disponible', v_mi);
  end loop;
end $$;

revoke all on function public.cancelar_reserva(uuid, text) from public;
revoke execute on function public.cancelar_reserva(uuid, text) from anon;
grant execute on function public.cancelar_reserva(uuid, text) to authenticated;

create or replace function public.marcar_revision_venta(
  _venta uuid,
  _estado text,
  _nota text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol app_rol;
  v_mi uuid;
  v_tienda uuid;
begin
  v_rol := public.mi_rol();
  v_mi := public.mi_usuario_id();
  if v_rol is null then raise exception 'Sesión no válida'; end if;
  if v_rol not in ('direccion','administracion') then
    raise exception 'Tu rol no puede revisar pagos';
  end if;
  if coalesce(_estado, '') not in ('pendiente','revisado','problema') then
    raise exception 'Estado de revisión no reconocido';
  end if;
  if _estado = 'problema' and nullif(trim(coalesce(_nota, '')), '') is null then
    raise exception 'Escribe la nota del problema detectado';
  end if;

  select tienda_id into v_tienda from public.ventas where id = _venta for update;
  if v_tienda is null then raise exception 'Esa venta no existe'; end if;

  update public.ventas set revision = _estado where id = _venta;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values (
    'revision_pago',
    jsonb_build_object('venta_id', _venta, 'estado', _estado, 'nota', nullif(trim(coalesce(_nota, '')), '')),
    v_mi,
    v_rol::text,
    v_tienda
  );
end $$;

revoke all on function public.marcar_revision_venta(uuid, text, text) from public;
revoke execute on function public.marcar_revision_venta(uuid, text, text) from anon;
grant execute on function public.marcar_revision_venta(uuid, text, text) to authenticated;