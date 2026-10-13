/* Cargar el costo de un equipo vendido que quedó sin precio de compra: corrige el costo del
   ítem de la venta, ajusta la ganancia de esa venta y, si el equipo tenía costo 0, también
   se lo deja al equipo. Queda en auditoría. Aplicada a mano desde el editor SQL (Lovable Cloud). */
create or replace function public.corregir_costo_venta_item(_item uuid, _costo bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_it public.venta_items;
  v_v public.ventas;
  v_eq public.equipos;
begin
  if public.mi_rol() is null
     or public.mi_rol() not in ('direccion', 'administracion', 'jefe_tienda') then
    raise exception 'Tu rol no puede corregir costos de ventas';
  end if;
  if _costo is null or _costo <= 0 then raise exception 'El costo debe ser mayor a 0'; end if;

  select * into v_it from public.venta_items where id = _item for update;
  if v_it.id is null then raise exception 'Ese producto de la venta no existe'; end if;
  select * into v_v from public.ventas where id = v_it.venta_id for update;
  if not public.ve_costos(v_v.tienda_id) then
    raise exception 'No puedes ver ni corregir costos de esa tienda';
  end if;
  if v_it.costo_snapshot = _costo then return; end if;

  update public.venta_items set costo_snapshot = _costo where id = _item;
  -- La ganancia se ajusta por la diferencia, sin recalcular lo demás de la venta
  update public.ventas set ganancia = ganancia + (v_it.costo_snapshot - _costo) where id = v_v.id;

  if v_it.equipo_id is not null then
    select * into v_eq from public.equipos where id = v_it.equipo_id for update;
    if v_eq.id is not null and coalesce(v_eq.costo, 0) = 0 then
      perform set_config('app.costo_sistema', '1', true);
      update public.equipos set costo = _costo, updated_at = now() where id = v_eq.id;
      perform set_config('app.costo_sistema', '0', true);
    end if;
  end if;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('costo_venta_corregido',
          jsonb_build_object('venta', v_v.id, 'item', _item, 'imei', v_eq.imei, 'modelo', v_eq.modelo,
                             'costo_antes', v_it.costo_snapshot, 'costo_despues', _costo),
          public.mi_usuario_id(), public.mi_rol()::text, v_v.tienda_id);
end $$;
revoke all on function public.corregir_costo_venta_item(uuid, bigint) from public, anon;
grant execute on function public.corregir_costo_venta_item(uuid, bigint) to authenticated;
