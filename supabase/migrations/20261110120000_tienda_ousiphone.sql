/* Pedido del 10-11: tienda nueva "OusiPhone", azul fuerte, funciona igual que las otras.
   Su jefe de tienda es Aaron, que ya estaba registrado: queda asignado a esta tienda.
   Si hay más de un Aaron, el update falla ("more than one row") y no cambia nada.
   Aplicar a mano desde el editor SQL (Lovable Cloud). */

insert into public.tiendas (nombre, slug, color_acento, es_bodega)
values ('OusiPhone', 'ousiphone', '#2563EB', false)
on conflict (slug) do nothing;

update public.usuarios
   set rol = 'jefe_tienda',
       tienda_id = (select id from public.tiendas where slug = 'ousiphone')
 where id = (select id from public.usuarios where nombre ilike 'aaron%');

select u.nombre, u.usuario, u.rol, t.nombre as tienda
  from public.usuarios u
  left join public.tiendas t on t.id = u.tienda_id
 where u.nombre ilike 'aaron%' or t.slug = 'ousiphone';
