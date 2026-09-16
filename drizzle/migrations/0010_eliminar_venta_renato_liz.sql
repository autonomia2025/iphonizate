create or replace function public.eliminar_venta(_venta uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mi uuid;
  v_tienda uuid;
  v_total bigint;
  v_num text;
  v_r record;
begin
  if not public.puede_borrar_equipos() then
    raise exception 'No tienes permiso para eliminar ventas';
  end if;
  v_mi := public.mi_usuario_id();

  select tienda_id, total, comprobante_numero
    into v_tienda, v_total, v_num
  from public.ventas where id = _venta for update;
  if v_tienda is null then raise exception 'Esa venta no existe'; end if;

  -- Equipos vuelven a disponible
  for v_r in select equipo_id from public.venta_items where venta_id = _venta and equipo_id is not null loop
    update public.equipos
      set estado = 'DISPONIBLE', ubicacion_id = coalesce(ubicacion_id, v_tienda), updated_at = now()
      where id = v_r.equipo_id and estado in ('VENDIDO','ENTREGADO');
    insert into public.equipos_historial (equipo_id, evento, usuario_id)
    values (v_r.equipo_id, 'Venta eliminada: vuelve a disponible', v_mi);
  end loop;

  -- Accesorios vuelven al stock
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

  delete from public.pagos where venta_id = _venta;
  delete from public.venta_items where venta_id = _venta;
  update public.reservas set estado = 'activa' where id = (select reserva_id from public.ventas where id = _venta);
  delete from public.ventas where id = _venta;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('venta_eliminada',
          jsonb_build_object('venta_id', _venta, 'total', v_total, 'comprobante', v_num),
          v_mi, public.mi_rol()::text, v_tienda);
end $function$;

revoke all on function public.eliminar_venta(uuid) from public;
grant execute on function public.eliminar_venta(uuid) to authenticated;