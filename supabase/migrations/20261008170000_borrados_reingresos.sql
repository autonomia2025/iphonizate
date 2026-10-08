/* Revisión de borrados y equipos que volvieron, filtro de Auditoría completo e índice.
   Aplicada a mano desde el editor SQL (Lovable Cloud). */

-- Índice para ordenar Inventario y Stock por fecha de ingreso
create index if not exists equipos_fecha_ingreso_idx on public.equipos (fecha_ingreso);

/* Equipos con una venta vigente que hoy NO figuran como vendidos ni entregados
   (volvieron por garantía, devolución o porque se reingresó el IMEI). */
create or replace function public.equipos_con_venta_activa()
returns table (
  equipo_id uuid, imei text, modelo text, estado text, ubicacion text,
  venta_id uuid, venta_fecha timestamptz, comprobante text, vendida_en text,
  ultimo_evento text, ultimo_evento_fecha timestamptz, ultimo_evento_por text
)
language sql stable security definer set search_path = public as $$
  select e.id, e.imei, e.modelo, e.estado::text, te.nombre,
         v.id, v.fecha, v.comprobante_numero, tv.nombre,
         h.evento, h.fecha, u.nombre
  from public.equipos e
  join lateral (
    select v.id, v.fecha, v.comprobante_numero, v.tienda_id
    from public.venta_items vi join public.ventas v on v.id = vi.venta_id
    where vi.equipo_id = e.id and not v.anulada
    order by v.fecha desc limit 1
  ) v on true
  left join public.tiendas te on te.id = e.ubicacion_id
  left join public.tiendas tv on tv.id = v.tienda_id
  left join lateral (
    select h.evento, h.fecha, h.usuario_id from public.equipos_historial h
    where h.equipo_id = e.id order by h.fecha desc limit 1
  ) h on true
  left join public.usuarios u on u.id = h.usuario_id
  where public.mi_rol() is not null
    and e.estado not in ('VENDIDO', 'ENTREGADO')
  order by v.fecha desc
$$;
revoke all on function public.equipos_con_venta_activa() from public, anon;
grant execute on function public.equipos_con_venta_activa() to authenticated;

-- Todos los tipos de acción de Auditoría (la consulta directa se cortaba en 1.000 filas)
create or replace function public.acciones_auditoria()
returns setof text language sql stable security definer set search_path = public as $$
  select distinct accion from public.auditoria
  where public.mi_rol() in ('direccion', 'administracion')
  order by 1
$$;
revoke all on function public.acciones_auditoria() from public, anon;
grant execute on function public.acciones_auditoria() to authenticated;

/* La función original de eliminar equipo ya registra 'equipo_eliminado' con IMEI y modelo.
   La copia completa que agrega la protección se guarda con otro nombre para no duplicar. */
create or replace function public.eliminar_equipo(_equipo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_eq public.equipos;
  v_ventas int;
begin
  if not public.puede_borrar_equipos() then
    raise exception 'No tienes permiso para eliminar equipos';
  end if;

  select * into v_eq from public.equipos where id = _equipo for update;
  if v_eq.id is null then raise exception 'Ese equipo ya no existe'; end if;

  if v_eq.estado in ('VENDIDO', 'ENTREGADO', 'RESERVADO', 'GARANTIA') then
    raise exception 'No se puede eliminar un equipo en estado %: tiene un cliente asociado. Si hay un error, corrige la venta o la reserva.', v_eq.estado;
  end if;

  select count(*) into v_ventas from public.venta_items where equipo_id = _equipo;
  if v_ventas > 0 then
    raise exception 'No se puede eliminar: el equipo aparece en % venta(s). Si volvió a la tienda, trasládalo o márcalo disponible en vez de borrarlo.', v_ventas;
  end if;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('equipo_eliminado_respaldo', jsonb_build_object('antes', to_jsonb(v_eq)),
          public.mi_usuario_id(), public.mi_rol()::text, v_eq.ubicacion_id);

  perform public.eliminar_equipo_sin_control(_equipo);
end $$;
revoke all on function public.eliminar_equipo(uuid) from public, anon;
grant execute on function public.eliminar_equipo(uuid) to authenticated;
