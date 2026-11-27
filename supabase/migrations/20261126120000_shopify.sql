/* Pedido del 26-11: conectar las tiendas Shopify (iPhonizate, Black Pink Phone y Riffstore)
   para que el sistema lea sus productos y su stock.
   - shopify_conexiones: una fila por tienda, con el link de instalación y el acceso que entrega
     Shopify. Los tokens solo los lee el servidor: la tabla no tiene políticas para la app.
   - shopify_variantes: la última lectura de productos y stock de cada tienda.
   Aplicar a mano desde el editor SQL (Lovable Cloud). */

create table if not exists public.shopify_conexiones (
  tienda text primary key check (tienda in ('iphonizate', 'black-pink-phone', 'riffstore')),
  shop text not null,
  link_instalacion text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'conectada', 'desconectada')),
  access_token text,
  access_expira timestamptz,
  refresh_token text,
  refresh_expira timestamptz,
  scopes text,
  oauth_state text,
  oauth_state_expira timestamptz,
  conectada_en timestamptz,
  ultima_lectura timestamptz,
  ultimo_error text,
  updated_at timestamptz not null default now()
);
alter table public.shopify_conexiones enable row level security;
revoke all on public.shopify_conexiones from anon, authenticated;

insert into public.shopify_conexiones (tienda, shop) values
  ('iphonizate', 'iphononizate.myshopify.com'),
  ('black-pink-phone', '0mcy8b-1t.myshopify.com'),
  ('riffstore', 'v9aj07-ap.myshopify.com')
on conflict (tienda) do nothing;

create table if not exists public.shopify_variantes (
  tienda text not null references public.shopify_conexiones (tienda) on delete cascade,
  variante_id text not null,
  producto_id text not null,
  producto text not null,
  variante text,
  estado_producto text,
  sku text,
  codigo_barras text,
  precio numeric,
  stock integer,
  controla_stock boolean,
  stock_por_ubicacion jsonb not null default '[]'::jsonb,
  leido_en timestamptz not null default now(),
  primary key (tienda, variante_id)
);
create index if not exists shopify_variantes_sku_idx on public.shopify_variantes (sku);
alter table public.shopify_variantes enable row level security;
revoke all on public.shopify_variantes from anon;
grant select on public.shopify_variantes to authenticated;

drop policy if exists "shopify_variantes_leer" on public.shopify_variantes;
create policy "shopify_variantes_leer" on public.shopify_variantes
  for select to authenticated
  using (public.mi_rol() in ('direccion', 'administracion'));

select tienda, shop, estado from public.shopify_conexiones order by tienda;
