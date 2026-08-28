-- Deja los datos operativos en cero. Se conservan tiendas, usuarios, permisos
-- y el catálogo de modelos/colores Apple.
alter table public.auditoria disable trigger user;

delete from public.servicios_equipo;
delete from public.equipos_historial;
delete from public.equipos_reportes;
delete from public.venta_items;
delete from public.reserva_items;
delete from public.pagos;
delete from public.garantias;
delete from public.ventas;
delete from public.reservas;
delete from public.movimientos;
delete from public.clientes;
delete from public.equipos;
delete from public.accesorios_stock;
delete from public.accesorios;
delete from public.gastos;
delete from public.tareas;
delete from public.metas;
delete from public.cierres_caja;
delete from public.precios;
delete from public.tecnicos;
delete from public.lecturas_equipo;
delete from public.lector_agentes;
delete from public.imei_verificaciones;
delete from public.auditoria;

insert into public.auditoria (accion, detalle, rol)
values ('sistema.reinicio', jsonb_build_object('motivo', 'Puesta en cero del sistema antes de operar'), 'direccion');

alter table public.auditoria enable trigger user;