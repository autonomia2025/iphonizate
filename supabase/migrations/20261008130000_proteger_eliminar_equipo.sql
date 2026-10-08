/* Eliminar un equipo borraba también su historial, traslados, arreglos y su línea en la venta,
   sin dejar rastro. Ahora:
   - no se puede eliminar un equipo vendido, entregado, reservado, en garantía ni uno que
     aparezca en alguna venta (la venta y el comprobante quedaban sin equipo);
   - cada eliminación queda en auditoría con quién, cuándo y una copia del equipo.
   La función original (hecha a mano en la base) no se reescribe: se renombra y se envuelve.
   Aplicada a mano desde el editor SQL (Lovable Cloud). */

do $$
begin
  if to_regprocedure('public.eliminar_equipo_sin_control(uuid)') is null then
    if to_regprocedure('public.eliminar_equipo(uuid)') is null then
      raise exception 'No existe la función eliminar_equipo: no se cambió nada';
    end if;
    alter function public.eliminar_equipo(uuid) rename to eliminar_equipo_sin_control;
  end if;
  revoke all on function public.eliminar_equipo_sin_control(uuid) from public, anon, authenticated;
end $$;

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
  values ('equipo_eliminado', jsonb_build_object('antes', to_jsonb(v_eq)),
          public.mi_usuario_id(), public.mi_rol()::text, v_eq.ubicacion_id);

  perform public.eliminar_equipo_sin_control(_equipo);
end $$;
revoke all on function public.eliminar_equipo(uuid) from public, anon;
grant execute on function public.eliminar_equipo(uuid) to authenticated;
