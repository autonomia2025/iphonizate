/* Eliminar una venta ahora pide un motivo obligatorio, y la auditoría guarda el motivo,
   el comprobante y los equipos (IMEI y modelo) que tenía la venta.
   La versión sin motivo queda bloqueada con un aviso para recargar la página.
   Aplicada a mano desde el editor SQL (Lovable Cloud). */

create or replace function public.eliminar_venta(_venta uuid, _motivo text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_mi uuid;
  v_tienda uuid;
  v_total bigint;
  v_num text;
  v_fecha timestamptz;
  v_equipos jsonb;
  v_motivo text := nullif(trim(coalesce(_motivo, '')), '');
  v_r record;
begin
  if not public.puede_corregir_ventas() then
    raise exception 'No tienes permiso para eliminar ventas';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Indica el motivo para eliminar la venta';
  end if;

  v_mi := public.mi_usuario_id();

  select tienda_id, total, comprobante_numero, fecha into v_tienda, v_total, v_num, v_fecha
  from public.ventas where id = _venta for update;
  if v_tienda is null then raise exception 'Esa venta no existe'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('imei', e.imei, 'modelo', e.modelo)), '[]'::jsonb)
    into v_equipos
  from public.venta_items vi join public.equipos e on e.id = vi.equipo_id
  where vi.venta_id = _venta;

  -- Equipos vuelven a disponible
  for v_r in
    select equipo_id from public.venta_items
    where venta_id = _venta and equipo_id is not null
  loop
    update public.equipos
      set estado = 'DISPONIBLE',
          ubicacion_id = coalesce(ubicacion_id, v_tienda),
          updated_at = now()
      where id = v_r.equipo_id and estado in ('VENDIDO','ENTREGADO');
    insert into public.equipos_historial (equipo_id, evento, usuario_id)
    values (v_r.equipo_id, 'Venta eliminada: vuelve a disponible (' || v_motivo || ')', v_mi);
  end loop;

  -- Accesorios vuelven al stock
  for v_r in
    select accesorio_id, count(*)::int as cantidad from public.venta_items
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
  update public.reservas set estado = 'activa'
    where id = (select reserva_id from public.ventas where id = _venta);
  delete from public.ventas where id = _venta;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values (
    'venta_eliminada',
    jsonb_build_object('venta_id', _venta, 'total', v_total, 'comprobante', v_num,
                       'fecha_venta', v_fecha, 'motivo', v_motivo, 'equipos', v_equipos),
    v_mi, public.mi_rol()::text, v_tienda
  );
end $function$;
revoke all on function public.eliminar_venta(uuid, text) from public, anon;
grant execute on function public.eliminar_venta(uuid, text) to authenticated;

/* La versión antigua (sin motivo) ya no elimina: si alguien tiene la página sin actualizar, le avisa. */
create or replace function public.eliminar_venta(_venta uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  raise exception 'Actualiza la página (tecla F5): ahora hay que indicar el motivo para eliminar una venta';
end $function$;
