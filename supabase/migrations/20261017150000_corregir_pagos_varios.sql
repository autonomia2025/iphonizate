/* "Corregir forma de pago" ahora permite repartir el pago en varios métodos y montos
   (ej. $400.000 transferencia + $200.000 efectivo). Los pagos nuevos deben sumar lo mismo que
   los pagos actuales de la venta (en ventas de reserva los abonos van aparte y no se tocan).
   Mismas reglas que antes: no se puede si la caja de ese día está cerrada y la venta vuelve a
   quedar pendiente en Revisión de pagos. Aplicada a mano desde el editor SQL (Lovable Cloud). */
create or replace function public.reemplazar_pagos_venta(_venta uuid, _pagos jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_v public.ventas;
  v_actual bigint;
  v_nuevo bigint := 0;
  v_fecha timestamptz;
  v_antes jsonb;
  v_pg jsonb;
  v_metodo text;
  v_monto bigint;
  v_nombre text;
begin
  if not public.puede_corregir_ventas() then
    raise exception 'Solo dirección (Renato, Liz y Valentina) puede corregir pagos';
  end if;

  select * into v_v from public.ventas where id = _venta for update;
  if v_v.id is null then raise exception 'Esa venta no existe'; end if;
  if v_v.anulada then raise exception 'Esa venta está anulada'; end if;

  select coalesce(sum(monto), 0), min(fecha),
         coalesce(jsonb_agg(jsonb_build_object('metodo', metodo, 'monto', monto, 'nombre', nombre_pagador)
                            order by fecha), '[]'::jsonb)
    into v_actual, v_fecha, v_antes
  from public.pagos where venta_id = _venta;
  if v_actual <= 0 then raise exception 'Esa venta no tiene pagos para corregir'; end if;

  if exists (
    select 1 from public.cierres_caja c
    where c.tienda_id = v_v.tienda_id
      and (c.fecha at time zone 'America/Santiago')::date in (
        (coalesce(v_fecha, v_v.fecha) at time zone 'America/Santiago')::date,
        (v_v.fecha at time zone 'America/Santiago')::date
      )
  ) then
    raise exception 'La caja de ese día ya está cerrada: no se puede corregir el pago';
  end if;

  if jsonb_typeof(_pagos) is distinct from 'array' or jsonb_array_length(_pagos) = 0 then
    raise exception 'Agrega al menos un pago';
  end if;
  for v_pg in select * from jsonb_array_elements(_pagos) loop
    v_metodo := v_pg->>'metodo';
    v_monto := nullif(v_pg->>'monto', '')::bigint;
    v_nombre := nullif(trim(coalesce(v_pg->>'nombre_pagador', '')), '');
    if v_metodo is null or v_metodo not in ('efectivo', 'transferencia', 'credito', 'partePago') then
      raise exception 'Método de pago no reconocido';
    end if;
    if v_monto is null or v_monto <= 0 then raise exception 'Cada pago debe tener un monto mayor a 0'; end if;
    if v_metodo <> 'efectivo' and v_nombre is null then
      raise exception 'Falta el nombre de quien pagó o el equipo recibido';
    end if;
    v_nuevo := v_nuevo + v_monto;
  end loop;
  if v_nuevo <> v_actual then
    raise exception 'Los pagos suman % y deben sumar %', v_nuevo, v_actual;
  end if;

  delete from public.pagos where venta_id = _venta;
  insert into public.pagos (venta_id, metodo, monto, nombre_pagador, fecha)
  select _venta, (p->>'metodo')::public.metodo_pago, (p->>'monto')::bigint,
         case when p->>'metodo' = 'efectivo' then null else nullif(trim(coalesce(p->>'nombre_pagador', '')), '') end,
         coalesce(v_fecha, v_v.fecha)
  from jsonb_array_elements(_pagos) p;

  update public.ventas set revision = null where id = _venta;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('pagos_corregidos',
          jsonb_build_object('venta', _venta, 'total', v_actual, 'antes', v_antes,
                             'despues', (select jsonb_agg(jsonb_build_object(
                                          'metodo', p->>'metodo', 'monto', (p->>'monto')::bigint,
                                          'nombre', nullif(trim(coalesce(p->>'nombre_pagador', '')), '')))
                                         from jsonb_array_elements(_pagos) p)),
          public.mi_usuario_id(), public.mi_rol()::text, v_v.tienda_id);
end $$;
revoke all on function public.reemplazar_pagos_venta(uuid, jsonb) from public, anon;
grant execute on function public.reemplazar_pagos_venta(uuid, jsonb) to authenticated;
