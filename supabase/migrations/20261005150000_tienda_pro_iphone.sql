/* Tienda nueva Pro iPhone, verde. Funciona igual que las demás: el slug debe calzar con
   src/lib/stores.ts y src/lib/finanzas.ts. Aplicada a mano desde el editor SQL (Lovable Cloud). */
insert into public.tiendas (nombre, slug, color_acento, es_bodega)
values ('Pro iPhone', 'pro-iphone', '#16A34A', false)
on conflict (slug) do nothing;
