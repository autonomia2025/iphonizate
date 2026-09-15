do $$
begin
  alter table public.auditoria disable trigger user;
  alter table public.equipos_bitacora disable trigger user;
  alter table public.equipos_historial disable trigger user;
  alter table public.movimientos disable trigger user;
  alter table public.lecturas_equipo disable trigger user;
  alter table public.equipos disable trigger user;
  alter table public.ventas disable trigger user;

  delete from public.servicios_equipo;
  delete from public.equipos_historial;
  delete from public.equipos_bitacora;
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
  delete from public.accesorios_stock;
  delete from public.accesorios;
  delete from public.auditoria;

  insert into public.auditoria (accion, detalle) values ('reset_operativo', jsonb_build_object('motivo','limpieza total repetida'));

  alter table public.auditoria enable trigger user;
  alter table public.equipos_bitacora enable trigger user;
  alter table public.equipos_historial enable trigger user;
  alter table public.movimientos enable trigger user;
  alter table public.lecturas_equipo enable trigger user;
  alter table public.equipos enable trigger user;
  alter table public.ventas enable trigger user;
end $$;