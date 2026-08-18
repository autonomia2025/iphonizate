drop view if exists public.v_stock;

create view public.v_stock
with (security_invoker = false) as
  select e.id, e.imei, e.modelo, e.gb, e.color, e.bateria, e.categoria,
         e.estado, e.ubicacion_id, t.nombre as tienda, e.fecha_ingreso
    from public.equipos e
    left join public.tiendas t on t.id = e.ubicacion_id
   where public.mi_rol() is not null;

revoke all on public.v_stock from anon;
grant select on public.v_stock to authenticated;
grant all on public.v_stock to service_role;