create or replace function public.registrar_venta(
  _tienda uuid,
  _cliente uuid,
  _con_boleta boolean,
  _items jsonb,
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
  v_venta uuid;
  v_base bigint := 0;
  v_recargo bigint := 0;
  v_total bigint := 0;
  v_ganancia bigint := 0;
  v_pagado bigint := 0;
  v_n int;
  v_costo bigint;
  v_precio bigint;
  v_cant int;
  v_imei text;
  v_modelo text;
  v_metodo text;
  v_nombre text;
  v_stock int;
  v_acc text;
begin
  v_rol := public.mi_rol();
  v_mi := public.mi_usuario_id();
  if v_rol is null then raise exception 'Sesión no válida'; end if;
  if _tienda is null then raise exception 'Falta la tienda de la venta'; end if;
  if not public.puede_ver_tienda(_tienda) then
    raise exception 'No puedes registrar ventas en esa tienda';
  end if;
  if _items is null or jsonb_array_length(_items) = 0 then
    raise exception 'La venta no tiene ítems';
  end if;
  if _pagos is null or jsonb_array_length(_pagos) = 0 then
    raise exception 'Debes registrar al menos un pago';
  end if;

  -- 1) equipos: pasan a VENDIDO solo si siguen DISPONIBLE
  for v_it in select * from jsonb_array_elements(_items) loop
    v_precio := coalesce((v_it->>'precio')::bigint, 0);
    if (v_it->>'tipo') = 'equipo' then
      if v_precio <= 0 then raise exception 'Hay un equipo sin precio en la venta'; end if;
      select imei, modelo, costo into v_imei, v_modelo, v_costo
      from public.equipos where id = (v_it->>'equipo_id')::uuid for update;
      if v_imei is null then raise exception 'Uno de los equipos ya no existe'; end if;

      update public.equipos
        set estado = 'VENDIDO', ubicacion_id = _tienda, updated_at = now()
        where id = (v_it->>'equipo_id')::uuid and estado = 'DISPONIBLE';
      get diagnostics v_n = row_count;
      if v_n = 0 then
        raise exception 'El equipo % (IMEI %) ya no está disponible: otra venta lo tomó. Quítalo del carrito.', v_modelo, v_imei;
      end if;

      v_base := v_base + v_precio;
      v_ganancia := v_ganancia + (v_precio - coalesce(v_costo, 0));
    elsif (v_it->>'tipo') = 'accesorio' then
      v_cant := greatest(1, coalesce((v_it->>'cantidad')::int, 1));
      select costo, nombre into v_costo, v_acc from public.accesorios
        where id = (v_it->>'accesorio_id')::uuid;
      if v_acc is null then raise exception 'Uno de los accesorios ya no existe'; end if;
      v_base := v_base + v_precio * v_cant;
      v_ganancia := v_ganancia + (v_precio - coalesce(v_costo, 0)) * v_cant;
    else
      raise exception 'Ítem de venta no reconocido';
    end if;
  end loop;

  v_recargo := case when coalesce(_con_boleta, false) then round(v_base * 0.09) else 0 end;
  v_total := v_base + v_recargo;

  -- pagos deben cuadrar exactamente
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

  if v_pagado <> v_total then
    raise exception 'Los pagos (%) no cuadran con el total de la venta (%)', v_pagado, v_total;
  end if;

  -- 2) venta
  insert into public.ventas (tienda_id, cliente_id, vendedor_id, total, ganancia, con_boleta, recargo_boleta)
  values (_tienda, _cliente, v_mi, v_total, v_ganancia, coalesce(_con_boleta, false), v_recargo)
  returning id into v_venta;

  -- 3) ítems con costo congelado, 6) stock de accesorios, 7) historial
  for v_it in select * from jsonb_array_elements(_items) loop
    v_precio := coalesce((v_it->>'precio')::bigint, 0);
    if (v_it->>'tipo') = 'equipo' then
      select costo into v_costo from public.equipos where id = (v_it->>'equipo_id')::uuid;
      insert into public.venta_items (venta_id, equipo_id, precio, costo_snapshot)
      values (v_venta, (v_it->>'equipo_id')::uuid, v_precio, coalesce(v_costo, 0));

      insert into public.equipos_historial (equipo_id, evento, usuario_id)
      values ((v_it->>'equipo_id')::uuid, 'Vendido', v_mi);
    else
      v_cant := greatest(1, coalesce((v_it->>'cantidad')::int, 1));
      select costo, nombre into v_costo, v_acc from public.accesorios
        where id = (v_it->>'accesorio_id')::uuid;

      for i in 1..v_cant loop
        insert into public.venta_items (venta_id, accesorio_id, precio, costo_snapshot)
        values (v_venta, (v_it->>'accesorio_id')::uuid, v_precio, coalesce(v_costo, 0));
      end loop;

      select cantidad into v_stock from public.accesorios_stock
        where accesorio_id = (v_it->>'accesorio_id')::uuid and tienda_id = _tienda for update;
      if coalesce(v_stock, 0) < v_cant then
        raise exception 'No hay stock suficiente de % en esta tienda', v_acc;
      end if;
      update public.accesorios_stock set cantidad = cantidad - v_cant
        where accesorio_id = (v_it->>'accesorio_id')::uuid and tienda_id = _tienda;
    end if;
  end loop;

  -- 5) pagos
  for v_pg in select * from jsonb_array_elements(_pagos) loop
    insert into public.pagos (venta_id, metodo, monto, nombre_pagador)
    values (
      v_venta,
      (v_pg->>'metodo')::metodo_pago,
      coalesce((v_pg->>'monto')::bigint, 0),
      nullif(trim(coalesce(v_pg->>'nombre_pagador', '')), '')
    );
  end loop;

  return v_venta;
end $$;

revoke all on function public.registrar_venta(uuid, uuid, boolean, jsonb, jsonb) from public;
revoke execute on function public.registrar_venta(uuid, uuid, boolean, jsonb, jsonb) from anon;
grant execute on function public.registrar_venta(uuid, uuid, boolean, jsonb, jsonb) to authenticated;

create or replace function public.anular_venta(_venta uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol app_rol;
  v_mi uuid;
  v_tienda uuid;
  v_anulada boolean;
  v_r record;
begin
  v_rol := public.mi_rol();
  v_mi := public.mi_usuario_id();
  if v_rol is null then raise exception 'Sesión no válida'; end if;
  if v_rol not in ('direccion','jefe_tienda','administracion') then
    raise exception 'Tu rol no puede anular ventas';
  end if;

  select tienda_id, anulada into v_tienda, v_anulada from public.ventas where id = _venta for update;
  if v_tienda is null then raise exception 'Esa venta no existe'; end if;
  if not public.puede_ver_tienda(v_tienda) then
    raise exception 'No puedes anular ventas de otra tienda';
  end if;
  if v_anulada then raise exception 'Esa venta ya está anulada'; end if;

  update public.ventas set anulada = true, fecha_anulacion = now() where id = _venta;

  for v_r in
    select equipo_id from public.venta_items where venta_id = _venta and equipo_id is not null
  loop
    update public.equipos
      set estado = 'DISPONIBLE', ubicacion_id = coalesce(ubicacion_id, v_tienda), updated_at = now()
      where id = v_r.equipo_id and estado in ('VENDIDO','ENTREGADO');

    insert into public.equipos_historial (equipo_id, evento, usuario_id)
    values (v_r.equipo_id, 'Venta anulada: vuelve a disponible', v_mi);
  end loop;

  for v_r in
    select accesorio_id, count(*)::int as cantidad
    from public.venta_items
    where venta_id = _venta and accesorio_id is not null
    group by accesorio_id
  loop
    insert into public.accesorios_stock (accesorio_id, tienda_id, cantidad)
    values (v_r.accesorio_id, v_tienda, v_r.cantidad)
    on conflict (accesorio_id, tienda_id)
      do update set cantidad = public.accesorios_stock.cantidad + excluded.cantidad;
  end loop;
end $$;

revoke all on function public.anular_venta(uuid) from public;
revoke execute on function public.anular_venta(uuid) from anon;
grant execute on function public.anular_venta(uuid) to authenticated;