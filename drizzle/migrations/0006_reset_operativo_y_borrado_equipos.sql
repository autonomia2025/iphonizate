-- 1) Limpieza de datos operativos (se conservan tiendas, usuarios, catálogos, precios y Finanzas)
set session_replication_role = replica;

delete from public.servicios_equipo;
delete from public.equipos_bitacora;
delete from public.equipos_historial;
delete from public.equipos_reportes;
delete from public.venta_items;
delete from public.reserva_items;
delete from public.pagos;
delete from public.ventas;
delete from public.reservas;
delete from public.garantias;
delete from public.movimientos;
delete from public.clientes;
delete from public.equipos;
delete from public.tecnicos;
delete from public.metas;
delete from public.cierres_caja;
delete from public.tareas;
delete from public.lecturas_equipo;
delete from public.lector_agentes;
delete from public.imei_verificaciones;
delete from public.auditoria;

set session_replication_role = default;

insert into public.auditoria (accion, detalle)
values ('sistema.reset_operativo',
        jsonb_build_object('nota', 'Datos operativos borrados: sistema en cero. Se conservan tiendas, usuarios, catálogos, precios y Finanzas.'));

-- 2) Permiso de borrado de equipos: solo Renato y Liz
create or replace function public.puede_borrar_equipos()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.activo
      and u.nombre in ('Renato', 'Liz')
  )
$$;

grant execute on function public.puede_borrar_equipos() to authenticated;

create or replace function public.eliminar_equipo(_equipo uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_eq public.equipos;
  v_mi uuid := public.mi_usuario_id();
  v_venta uuid;
begin
  select * into v_eq from public.equipos where id = _equipo for update;
  if not found then raise exception 'El equipo no existe'; end if;

  if not public.puede_borrar_equipos() then
    raise exception 'Solo Renato o Liz pueden eliminar equipos del inventario';
  end if;

  -- se borra todo lo colgado del equipo
  delete from public.servicios_equipo where equipo_id = _equipo;
  delete from public.equipos_reportes where equipo_id = _equipo;
  delete from public.reserva_items where equipo_id = _equipo;

  for v_venta in
    select distinct venta_id from public.venta_items where equipo_id = _equipo
  loop
    delete from public.venta_items where equipo_id = _equipo and venta_id = v_venta;

    if not exists (select 1 from public.venta_items where venta_id = v_venta) then
      update public.ventas
        set anulada = true,
            fecha_anulacion = coalesce(fecha_anulacion, now()),
            total = 0,
            ganancia = 0
        where id = v_venta;
    else
      update public.ventas v
        set total = s.total,
            ganancia = s.ganancia
        from (
          select coalesce(sum(precio), 0)::bigint as total,
                 coalesce(sum(precio - coalesce(costo_snapshot, 0)), 0)::bigint as ganancia
          from public.venta_items where venta_id = v_venta
        ) s
        where v.id = v_venta;
    end if;
  end loop;

  alter table public.movimientos disable trigger user;
  delete from public.movimientos where equipo_id = _equipo;
  alter table public.movimientos enable trigger user;

  alter table public.equipos_bitacora disable trigger user;
  delete from public.equipos_bitacora where equipo_id = _equipo;
  alter table public.equipos_bitacora enable trigger user;

  alter table public.equipos_historial disable trigger user;
  delete from public.equipos_historial where equipo_id = _equipo;
  alter table public.equipos_historial enable trigger user;

  update public.garantias set equipo_id = null where equipo_id = _equipo;

  delete from public.equipos where id = _equipo;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('equipo_eliminado',
          jsonb_build_object('equipo_id', _equipo, 'imei', v_eq.imei, 'modelo', v_eq.modelo, 'estado', v_eq.estado::text),
          v_mi, public.mi_rol()::text, v_eq.ubicacion_id);
end;
$$;
