/* Pedido del 19-11: revisión completa de los costos de compra de los equipos en stock y vendidos.
   La página "Revisión de costos" marca los que no tienen costo o parecen mal digitados, se baja
   un Excel con la columna "Costo real" y, al subirlo, se corrigen los costos en el sistema.
   Si el equipo está vendido, también se corrige el costo de esa venta y su ganancia.
   Solo Dirección y Administración. Aplicar a mano desde el editor SQL (Lovable Cloud). */

/* Datos de la revisión: un solo jsonb para no toparse con el límite de filas de la API. */
create or replace function public.revision_costos_datos()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_rol() is null or public.mi_rol() not in ('direccion', 'administracion') then
    raise exception 'Solo Dirección y Administración pueden revisar costos';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id, 'imei', e.imei, 'modelo', e.modelo, 'gb', e.gb, 'color', e.color,
             'estado', e.estado, 'ubicacion', t.nombre, 'proveedor', e.proveedor, 'lote', e.lote,
             'fecha_ingreso', e.fecha_ingreso, 'costo', coalesce(e.costo, 0),
             'precio_venta', vt.precio, 'fecha_venta', vt.fecha, 'tienda_venta', vt.tienda)
           order by e.modelo, e.gb, e.fecha_ingreso)
      from public.equipos e
      left join public.tiendas t on t.id = e.ubicacion_id
      left join lateral (
        select vi.precio, v.fecha, tv.nombre as tienda
          from public.venta_items vi
          join public.ventas v on v.id = vi.venta_id and not v.anulada
          left join public.tiendas tv on tv.id = v.tienda_id
         where vi.equipo_id = e.id
         order by v.fecha desc
         limit 1
      ) vt on e.estado = 'VENDIDO'
     where e.estado in ('DISPONIBLE', 'RESERVADO', 'POR_REVISAR', 'EN_TECNICO', 'VENDIDO')
  ), '[]'::jsonb);
end $$;
revoke all on function public.revision_costos_datos() from public, anon;
grant execute on function public.revision_costos_datos() to authenticated;

/* Aplica los costos reales: [{equipo_id, costo}]. Todo o nada.
   En un equipo vendido, la diferencia también se suma al costo de su última venta vigente y se
   descuenta de la ganancia (así no se pierde lo que ya sumaron los servicios). */
create or replace function public.revision_costos_aplicar(_cambios jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_mi uuid := public.mi_usuario_id();
  v_c jsonb;
  v_eq public.equipos;
  v_nuevo bigint;
  v_antes bigint;
  v_item public.venta_items;
  v_snap bigint;
  v_n int := 0;
  v_ventas int := 0;
begin
  if public.mi_rol() is null or public.mi_rol() not in ('direccion', 'administracion') then
    raise exception 'Solo Dirección y Administración pueden corregir costos';
  end if;
  if jsonb_typeof(_cambios) is distinct from 'array' then
    raise exception 'Formato de cambios no válido';
  end if;

  for v_c in select * from jsonb_array_elements(_cambios) loop
    select * into v_eq from public.equipos where id = (v_c->>'equipo_id')::uuid for update;
    if v_eq.id is null then raise exception 'Uno de los equipos del archivo ya no existe'; end if;
    v_nuevo := nullif(v_c->>'costo', '')::bigint;
    if v_nuevo is null or v_nuevo <= 0 then
      raise exception 'El costo del IMEI % debe ser mayor a 0', v_eq.imei;
    end if;
    v_antes := coalesce(v_eq.costo, 0);
    continue when v_nuevo = v_antes;

    perform set_config('app.costo_sistema', '1', true);
    update public.equipos set costo = v_nuevo, updated_at = now() where id = v_eq.id;

    v_item := null;
    if v_eq.estado = 'VENDIDO' then
      select vi.* into v_item
        from public.venta_items vi
        join public.ventas v on v.id = vi.venta_id and not v.anulada
       where vi.equipo_id = v_eq.id
       order by v.fecha desc
       limit 1;
      if v_item.id is not null then
        v_snap := greatest(0, coalesce(v_item.costo_snapshot, 0) + (v_nuevo - v_antes));
        update public.venta_items set costo_snapshot = v_snap where id = v_item.id;
        update public.ventas
           set ganancia = ganancia - (v_snap - coalesce(v_item.costo_snapshot, 0))
         where id = v_item.venta_id;
        v_ventas := v_ventas + 1;
      end if;
    end if;
    perform set_config('app.costo_sistema', '0', true);

    insert into public.equipos_historial (equipo_id, evento, usuario_id)
    values (v_eq.id, 'costo corregido en la revisión de costos: $' || v_antes || ' → $' || v_nuevo, v_mi);
    insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
    values ('costo_revisado',
            jsonb_build_object('equipo', v_eq.id, 'imei', v_eq.imei, 'modelo', v_eq.modelo,
                               'costo_antes', v_antes, 'costo_despues', v_nuevo,
                               'venta', v_item.venta_id),
            v_mi, public.mi_rol()::text, v_eq.ubicacion_id);
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('actualizados', v_n, 'ventas_ajustadas', v_ventas);
end $$;
revoke all on function public.revision_costos_aplicar(jsonb) from public, anon;
grant execute on function public.revision_costos_aplicar(jsonb) to authenticated;

select 'revisión de costos lista' as resultado;
