create extension if not exists pgcrypto;

create type public.equipo_estado as enum
  ('POR_REVISAR','EN_TECNICO','DISPONIBLE','RESERVADO','VENDIDO','ENTREGADO','GARANTIA');
create type public.app_rol as enum
  ('direccion','jefe_tienda','administracion','operaciones','vendedor');
create type public.metodo_pago as enum ('efectivo','transferencia','credito','partePago');
create type public.categoria_equipo as enum ('sellado','openbox','seminuevo','reacondicionado');
create type public.categoria_accesorio as enum ('cargador','carcasa','mica','audifonos','otro');
create type public.tipo_servicio as enum
  ('bateria','pantalla','chasis','camara','parlante','faceid','puerto_carga','limpieza','homologacion','otro');

create table public.tiendas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  slug text not null unique,
  color_acento text not null,
  es_bodega boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.tiendas to authenticated;
grant all on public.tiendas to service_role;
alter table public.tiendas enable row level security;

create table public.usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  nombre text not null,
  usuario text not null unique,
  email_interno text not null unique,
  rol public.app_rol not null,
  tienda_id uuid references public.tiendas(id) on delete set null,
  pin_hash text not null,
  activo boolean not null default true,
  debe_cambiar_pin boolean not null default true,
  intentos_fallidos int not null default 0,
  bloqueado_hasta timestamptz,
  created_at timestamptz not null default now()
);
grant select, update on public.usuarios to authenticated;
grant all on public.usuarios to service_role;
alter table public.usuarios enable row level security;

create or replace function public.mi_usuario_id()
returns uuid language sql stable security definer set search_path = public as $$
  select u.id from public.usuarios u where u.auth_user_id = auth.uid() and u.activo $$;

create or replace function public.mi_rol()
returns public.app_rol language sql stable security definer set search_path = public as $$
  select u.rol from public.usuarios u where u.auth_user_id = auth.uid() and u.activo $$;

create or replace function public.mi_tienda()
returns uuid language sql stable security definer set search_path = public as $$
  select u.tienda_id from public.usuarios u where u.auth_user_id = auth.uid() and u.activo $$;

create or replace function public.ve_todas_tiendas()
returns boolean language sql stable security definer set search_path = public as $$
  select public.mi_rol() in ('direccion','administracion','operaciones') $$;

create or replace function public.puede_ver_tienda(_tienda uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.mi_rol() is not null
     and (public.ve_todas_tiendas() or _tienda is null or _tienda = public.mi_tienda()) $$;

create or replace function public.ve_costos(_tienda uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.mi_rol()
    when 'direccion' then true
    when 'administracion' then true
    when 'jefe_tienda' then (_tienda is null or _tienda = public.mi_tienda())
    else false end $$;

create or replace function public.ve_ganancias(_tienda uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.mi_rol()
    when 'direccion' then true
    when 'jefe_tienda' then (_tienda is null or _tienda = public.mi_tienda())
    else false end $$;

create policy "tiendas visibles para autenticados" on public.tiendas
  for select to authenticated using (public.mi_rol() is not null);
create policy "usuarios visibles segun alcance" on public.usuarios
  for select to authenticated
  using (auth_user_id = auth.uid() or public.puede_ver_tienda(tienda_id));
create policy "usuarios update propio o direccion" on public.usuarios
  for update to authenticated
  using (auth_user_id = auth.uid() or public.mi_rol() = 'direccion');

create or replace function public.fn_bloquear_escalada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.rol is distinct from old.rol
      or new.tienda_id is distinct from old.tienda_id
      or new.auth_user_id is distinct from old.auth_user_id)
     and public.mi_rol() is distinct from 'direccion' then
    raise exception 'Solo dirección puede modificar rol, tienda o credenciales';
  end if;
  if new.pin_hash is distinct from old.pin_hash
     and public.mi_rol() is distinct from 'direccion'
     and new.id is distinct from public.mi_usuario_id() then
    raise exception 'Solo puedes cambiar tu propio PIN';
  end if;
  return new;
end $$;
create trigger trg_usuarios_no_escalada before update on public.usuarios
  for each row execute function public.fn_bloquear_escalada();

create table public.auditoria (
  id uuid primary key default gen_random_uuid(),
  accion text not null,
  detalle jsonb,
  usuario_id uuid references public.usuarios(id) on delete set null,
  rol text,
  tienda_id uuid references public.tiendas(id) on delete set null,
  fecha timestamptz not null default now()
);
grant select, insert on public.auditoria to authenticated;
grant all on public.auditoria to service_role;
alter table public.auditoria enable row level security;
create policy "auditoria lectura direccion y administracion" on public.auditoria
  for select to authenticated
  using (public.mi_rol() in ('direccion','administracion') and public.puede_ver_tienda(tienda_id));
create policy "auditoria solo insert" on public.auditoria
  for insert to authenticated with check (public.mi_rol() is not null);

create or replace function public.fn_auditoria_inmutable()
returns trigger language plpgsql as $$
begin raise exception 'auditoria es de solo inserción'; end $$;
create trigger trg_auditoria_no_update before update on public.auditoria
  for each row execute function public.fn_auditoria_inmutable();
create trigger trg_auditoria_no_delete before delete on public.auditoria
  for each row execute function public.fn_auditoria_inmutable();

create or replace function public.fn_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_detalle jsonb; v_fila jsonb; v_antes jsonb;
begin
  if tg_op = 'INSERT' then
    v_fila := public.fn_sin_sensibles(to_jsonb(new));
    v_detalle := jsonb_build_object('despues', v_fila);
  elsif tg_op = 'UPDATE' then
    v_fila := public.fn_sin_sensibles(to_jsonb(new));
    v_antes := public.fn_sin_sensibles(to_jsonb(old));
    v_detalle := jsonb_build_object('antes', v_antes, 'despues', v_fila);
  else
    v_fila := public.fn_sin_sensibles(to_jsonb(old));
    v_detalle := jsonb_build_object('antes', v_fila);
  end if;
  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values (tg_table_name || '.' || lower(tg_op), v_detalle,
          public.mi_usuario_id(), public.mi_rol()::text,
          coalesce(nullif(v_fila->>'tienda_id','')::uuid,
                   nullif(v_fila->>'ubicacion_id','')::uuid,
                   public.mi_tienda()));
  return null;
end $$;

create or replace function public.fn_sin_sensibles(_fila jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select _fila - 'costo' - 'ganancia' - 'costo_snapshot' - 'precio' - 'pin_hash'
$$;

create table public.tecnicos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, activo boolean not null default true,
  created_at timestamptz not null default now());
grant select, insert, update on public.tecnicos to authenticated;
grant all on public.tecnicos to service_role;
alter table public.tecnicos enable row level security;
create policy "tecnicos lectura" on public.tecnicos for select to authenticated
  using (public.mi_rol() is not null);
create policy "tecnicos insert" on public.tecnicos for insert to authenticated
  with check (public.mi_rol() in ('direccion','jefe_tienda','administracion','operaciones'));
create policy "tecnicos update" on public.tecnicos for update to authenticated
  using (public.mi_rol() in ('direccion','jefe_tienda','administracion','operaciones'));

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, telefono text, correo text, instagram text,
  created_at timestamptz not null default now());
grant select, insert, update on public.clientes to authenticated;
grant all on public.clientes to service_role;
alter table public.clientes enable row level security;
create policy "clientes lectura" on public.clientes for select to authenticated
  using (public.mi_rol() is not null);
create policy "clientes insert" on public.clientes for insert to authenticated
  with check (public.mi_rol() is not null);
create policy "clientes update" on public.clientes for update to authenticated
  using (public.mi_rol() is not null);

create table public.equipos (
  id uuid primary key default gen_random_uuid(),
  imei text not null,
  serie text, modelo text not null, gb int, color text,
  bateria int check (bateria between 0 and 100),
  email_vinculado text,
  categoria public.categoria_equipo not null default 'seminuevo',
  costo bigint not null default 0,
  proveedor text, lote text,
  estado public.equipo_estado not null default 'POR_REVISAR',
  ubicacion_id uuid references public.tiendas(id) on delete set null,
  fecha_ingreso timestamptz not null default now(),
  notas text,
  updated_at timestamptz not null default now(),
  constraint equipos_imei_15 check (imei ~ '^[0-9]{15}$')
);
create unique index equipos_imei_key on public.equipos (imei);
create index equipos_estado_idx on public.equipos (estado);
create index equipos_ubicacion_idx on public.equipos (ubicacion_id);

grant select (id, imei, serie, modelo, gb, color, bateria, email_vinculado, categoria,
              proveedor, lote, estado, ubicacion_id, fecha_ingreso, notas, updated_at)
  on public.equipos to authenticated;
grant insert, update on public.equipos to authenticated;
grant all on public.equipos to service_role;
alter table public.equipos enable row level security;
create policy "equipos lectura por alcance" on public.equipos for select to authenticated
  using (public.puede_ver_tienda(ubicacion_id));
create policy "equipos insert" on public.equipos for insert to authenticated
  with check (public.mi_rol() in ('direccion','jefe_tienda','administracion','operaciones')
              and public.puede_ver_tienda(ubicacion_id));
create policy "equipos update" on public.equipos for update to authenticated
  using (public.puede_ver_tienda(ubicacion_id));

create or replace function public.fn_equipos_costo_protegido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.costo is distinct from old.costo and not public.ve_costos(new.ubicacion_id) then
    raise exception 'Tu rol no puede modificar el costo de un equipo';
  end if;
  return new;
end $$;
create trigger trg_equipos_costo_protegido before update on public.equipos
  for each row execute function public.fn_equipos_costo_protegido();

create or replace function public.fn_equipos_reingreso()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_existente public.equipos;
begin
  select * into v_existente from public.equipos where imei = new.imei;
  if v_existente.id is null then return new; end if;
  if v_existente.estado in ('POR_REVISAR','EN_TECNICO','DISPONIBLE','RESERVADO','GARANTIA') then
    raise exception 'El IMEI % ya existe en estado activo (%)', new.imei, v_existente.estado;
  end if;
  update public.equipos set
    serie = coalesce(new.serie, serie), modelo = new.modelo,
    gb = coalesce(new.gb, gb), color = coalesce(new.color, color),
    bateria = coalesce(new.bateria, bateria), email_vinculado = new.email_vinculado,
    categoria = new.categoria, costo = new.costo,
    proveedor = coalesce(new.proveedor, proveedor), lote = coalesce(new.lote, lote),
    estado = new.estado, ubicacion_id = new.ubicacion_id,
    fecha_ingreso = now(), notas = new.notas, updated_at = now()
  where id = v_existente.id;
  insert into public.equipos_historial (equipo_id, evento, usuario_id)
  values (v_existente.id, 'reingreso desde ' || v_existente.estado, public.mi_usuario_id());
  return null;
end $$;

create table public.servicios_equipo (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  tipo public.tipo_servicio not null,
  costo bigint not null default 0,
  tecnico_id uuid references public.tecnicos(id) on delete set null,
  estado text not null default 'pendiente',
  asignado_at timestamptz, listo_at timestamptz,
  created_at timestamptz not null default now());
grant select (id, equipo_id, tipo, tecnico_id, estado, asignado_at, listo_at, created_at)
  on public.servicios_equipo to authenticated;
grant insert, update on public.servicios_equipo to authenticated;
grant all on public.servicios_equipo to service_role;
alter table public.servicios_equipo enable row level security;
create policy "servicios lectura" on public.servicios_equipo for select to authenticated
  using (exists (select 1 from public.equipos e
                 where e.id = equipo_id and public.puede_ver_tienda(e.ubicacion_id)));
create policy "servicios insert" on public.servicios_equipo for insert to authenticated
  with check (public.mi_rol() in ('direccion','jefe_tienda','administracion','operaciones'));
create policy "servicios update" on public.servicios_equipo for update to authenticated
  using (public.mi_rol() in ('direccion','jefe_tienda','administracion','operaciones'));

create table public.equipos_historial (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  evento text not null,
  usuario_id uuid references public.usuarios(id) on delete set null,
  fecha timestamptz not null default now());
grant select, insert on public.equipos_historial to authenticated;
grant all on public.equipos_historial to service_role;
alter table public.equipos_historial enable row level security;
create policy "historial lectura" on public.equipos_historial for select to authenticated
  using (exists (select 1 from public.equipos e
                 where e.id = equipo_id and public.puede_ver_tienda(e.ubicacion_id)));
create policy "historial insert" on public.equipos_historial for insert to authenticated
  with check (public.mi_rol() is not null);

create trigger trg_equipos_reingreso before insert on public.equipos
  for each row execute function public.fn_equipos_reingreso();

create table public.accesorios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria public.categoria_accesorio not null default 'otro',
  tipo text, modelo text,
  costo bigint not null default 0, precio bigint not null default 0,
  minimo int not null default 0,
  created_at timestamptz not null default now());
grant select (id, nombre, categoria, tipo, modelo, precio, minimo, created_at)
  on public.accesorios to authenticated;
grant insert, update on public.accesorios to authenticated;
grant all on public.accesorios to service_role;
alter table public.accesorios enable row level security;
create policy "accesorios lectura" on public.accesorios for select to authenticated
  using (public.mi_rol() is not null);
create policy "accesorios insert" on public.accesorios for insert to authenticated
  with check (public.mi_rol() in ('direccion','jefe_tienda','administracion','operaciones'));
create policy "accesorios update" on public.accesorios for update to authenticated
  using (public.mi_rol() in ('direccion','jefe_tienda','administracion','operaciones'));

create table public.accesorios_stock (
  id uuid primary key default gen_random_uuid(),
  accesorio_id uuid not null references public.accesorios(id) on delete cascade,
  tienda_id uuid not null references public.tiendas(id) on delete cascade,
  cantidad int not null default 0,
  unique (accesorio_id, tienda_id));
grant select, insert, update on public.accesorios_stock to authenticated;
grant all on public.accesorios_stock to service_role;
alter table public.accesorios_stock enable row level security;
create policy "accesorios_stock lectura" on public.accesorios_stock for select to authenticated
  using (public.mi_rol() is not null);
create policy "accesorios_stock insert" on public.accesorios_stock for insert to authenticated
  with check (public.puede_ver_tienda(tienda_id));
create policy "accesorios_stock update" on public.accesorios_stock for update to authenticated
  using (public.puede_ver_tienda(tienda_id));

create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  tienda_id uuid not null references public.tiendas(id) on delete restrict,
  vendedor_id uuid references public.usuarios(id) on delete set null,
  total bigint not null default 0, abono bigint not null default 0,
  saldo bigint not null default 0, estado text not null default 'activa',
  destino_abono text, fecha timestamptz not null default now());
grant select, insert, update on public.reservas to authenticated;
grant all on public.reservas to service_role;
alter table public.reservas enable row level security;
create policy "reservas lectura" on public.reservas for select to authenticated
  using (public.puede_ver_tienda(tienda_id));
create policy "reservas insert" on public.reservas for insert to authenticated
  with check (public.puede_ver_tienda(tienda_id));
create policy "reservas update" on public.reservas for update to authenticated
  using (public.puede_ver_tienda(tienda_id));

create table public.reserva_items (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references public.reservas(id) on delete cascade,
  equipo_id uuid references public.equipos(id) on delete set null,
  accesorio_id uuid references public.accesorios(id) on delete set null,
  precio bigint not null default 0, costo_snapshot bigint not null default 0,
  check (equipo_id is not null or accesorio_id is not null));
grant select (id, reserva_id, equipo_id, accesorio_id, precio) on public.reserva_items to authenticated;
grant insert, update on public.reserva_items to authenticated;
grant all on public.reserva_items to service_role;
alter table public.reserva_items enable row level security;
create policy "reserva_items lectura" on public.reserva_items for select to authenticated
  using (exists (select 1 from public.reservas r
                 where r.id = reserva_id and public.puede_ver_tienda(r.tienda_id)));
create policy "reserva_items insert" on public.reserva_items for insert to authenticated
  with check (exists (select 1 from public.reservas r
                      where r.id = reserva_id and public.puede_ver_tienda(r.tienda_id)));
create policy "reserva_items update" on public.reserva_items for update to authenticated
  using (exists (select 1 from public.reservas r
                 where r.id = reserva_id and public.puede_ver_tienda(r.tienda_id)));

create table public.ventas (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references public.tiendas(id) on delete restrict,
  cliente_id uuid references public.clientes(id) on delete set null,
  vendedor_id uuid references public.usuarios(id) on delete set null,
  total bigint not null default 0, ganancia bigint not null default 0,
  con_boleta boolean not null default false, recargo_boleta bigint not null default 0,
  revision text, anulada boolean not null default false, fecha_anulacion timestamptz,
  reserva_id uuid references public.reservas(id) on delete set null,
  fecha timestamptz not null default now());
grant select (id, tienda_id, cliente_id, vendedor_id, total, con_boleta, recargo_boleta,
              revision, anulada, fecha_anulacion, reserva_id, fecha)
  on public.ventas to authenticated;
grant insert, update on public.ventas to authenticated;
grant all on public.ventas to service_role;
alter table public.ventas enable row level security;
create policy "ventas lectura" on public.ventas for select to authenticated
  using (public.puede_ver_tienda(tienda_id));
create policy "ventas insert" on public.ventas for insert to authenticated
  with check (public.puede_ver_tienda(tienda_id));
create policy "ventas update" on public.ventas for update to authenticated
  using (public.puede_ver_tienda(tienda_id));

create or replace function public.fn_ventas_campos_protegidos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.anulada is distinct from old.anulada
      or new.total is distinct from old.total
      or new.ganancia is distinct from old.ganancia)
     and public.mi_rol() not in ('direccion','jefe_tienda','administracion') then
    raise exception 'Tu rol no puede anular ventas ni modificar sus montos';
  end if;
  return new;
end $$;
create trigger trg_ventas_campos_protegidos before update on public.ventas
  for each row execute function public.fn_ventas_campos_protegidos();

create table public.venta_items (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas(id) on delete cascade,
  equipo_id uuid references public.equipos(id) on delete set null,
  accesorio_id uuid references public.accesorios(id) on delete set null,
  precio bigint not null default 0, costo_snapshot bigint not null default 0,
  check (equipo_id is not null or accesorio_id is not null));
grant select (id, venta_id, equipo_id, accesorio_id, precio) on public.venta_items to authenticated;
grant insert, update on public.venta_items to authenticated;
grant all on public.venta_items to service_role;
alter table public.venta_items enable row level security;
create policy "venta_items lectura" on public.venta_items for select to authenticated
  using (exists (select 1 from public.ventas v
                 where v.id = venta_id and public.puede_ver_tienda(v.tienda_id)));
create policy "venta_items insert" on public.venta_items for insert to authenticated
  with check (exists (select 1 from public.ventas v
                      where v.id = venta_id and public.puede_ver_tienda(v.tienda_id)));
create policy "venta_items update" on public.venta_items for update to authenticated
  using (exists (select 1 from public.ventas v
                 where v.id = venta_id and public.puede_ver_tienda(v.tienda_id)));

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid references public.ventas(id) on delete cascade,
  reserva_id uuid references public.reservas(id) on delete cascade,
  metodo public.metodo_pago not null, monto bigint not null default 0,
  nombre_pagador text, fecha timestamptz not null default now(),
  check (venta_id is not null or reserva_id is not null));
grant select, insert, update on public.pagos to authenticated;
grant all on public.pagos to service_role;
alter table public.pagos enable row level security;
create policy "pagos lectura" on public.pagos for select to authenticated
  using (exists (select 1 from public.ventas v where v.id = venta_id and public.puede_ver_tienda(v.tienda_id))
      or exists (select 1 from public.reservas r where r.id = reserva_id and public.puede_ver_tienda(r.tienda_id)));
create policy "pagos insert" on public.pagos for insert to authenticated
  with check (exists (select 1 from public.ventas v where v.id = venta_id and public.puede_ver_tienda(v.tienda_id))
           or exists (select 1 from public.reservas r where r.id = reserva_id and public.puede_ver_tienda(r.tienda_id)));
create policy "pagos update" on public.pagos for update to authenticated
  using (public.mi_rol() in ('direccion','jefe_tienda','administracion'));

create table public.garantias (
  id uuid primary key default gen_random_uuid(),
  imei text not null,
  equipo_id uuid references public.equipos(id) on delete set null,
  cliente_nombre text not null, cliente_telefono text,
  falla text not null, notas text,
  estado text not null default 'abierta', resolucion text,
  imei_entregado text, diferencia bigint not null default 0,
  tienda_id uuid not null references public.tiendas(id) on delete restrict,
  recibio_id uuid references public.usuarios(id) on delete set null,
  fecha timestamptz not null default now(), fecha_cierre timestamptz);
grant select, insert, update on public.garantias to authenticated;
grant all on public.garantias to service_role;
alter table public.garantias enable row level security;
create policy "garantias lectura" on public.garantias for select to authenticated
  using (public.puede_ver_tienda(tienda_id));
create policy "garantias insert" on public.garantias for insert to authenticated
  with check (public.puede_ver_tienda(tienda_id));
create policy "garantias update" on public.garantias for update to authenticated
  using (public.puede_ver_tienda(tienda_id));

create table public.movimientos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  desde_id uuid references public.tiendas(id) on delete set null,
  hacia_id uuid references public.tiendas(id) on delete set null,
  usuario_id uuid references public.usuarios(id) on delete set null,
  fecha timestamptz not null default now());
grant select, insert on public.movimientos to authenticated;
grant all on public.movimientos to service_role;
alter table public.movimientos enable row level security;
create policy "movimientos lectura" on public.movimientos for select to authenticated
  using (public.puede_ver_tienda(desde_id) or public.puede_ver_tienda(hacia_id));
create policy "movimientos insert" on public.movimientos for insert to authenticated
  with check (public.mi_rol() in ('direccion','jefe_tienda','administracion','operaciones'));

create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  categoria text not null, descripcion text, monto bigint not null,
  tienda_id uuid references public.tiendas(id) on delete set null,
  usuario_id uuid references public.usuarios(id) on delete set null,
  fecha timestamptz not null);
grant select, insert, update on public.gastos to authenticated;
grant all on public.gastos to service_role;
alter table public.gastos enable row level security;
create policy "gastos lectura" on public.gastos for select to authenticated
  using (public.puede_ver_tienda(tienda_id)
         and public.mi_rol() in ('direccion','jefe_tienda','administracion'));
create policy "gastos insert" on public.gastos for insert to authenticated
  with check (public.puede_ver_tienda(tienda_id));
create policy "gastos update" on public.gastos for update to authenticated
  using (public.mi_rol() in ('direccion','jefe_tienda','administracion'));

create table public.precios (
  id uuid primary key default gen_random_uuid(),
  modelo text not null, gb int not null, precio bigint not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuarios(id) on delete set null,
  unique (modelo, gb));
grant select, insert, update on public.precios to authenticated;
grant all on public.precios to service_role;
alter table public.precios enable row level security;
create policy "precios lectura" on public.precios for select to authenticated
  using (public.mi_rol() is not null);
create policy "precios insert" on public.precios for insert to authenticated
  with check (public.mi_rol() in ('direccion','jefe_tienda','administracion'));
create policy "precios update" on public.precios for update to authenticated
  using (public.mi_rol() in ('direccion','jefe_tienda','administracion'));

create table public.tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null, descripcion text,
  urgencia text not null default 'media', tipo text,
  asignado_id uuid references public.usuarios(id) on delete set null,
  hecha boolean not null default false,
  created_by uuid references public.usuarios(id) on delete set null,
  fecha timestamptz not null default now());
grant select, insert, update on public.tareas to authenticated;
grant all on public.tareas to service_role;
alter table public.tareas enable row level security;
create policy "tareas lectura" on public.tareas for select to authenticated
  using (public.mi_rol() is not null);
create policy "tareas insert" on public.tareas for insert to authenticated
  with check (public.mi_rol() is not null);
create policy "tareas update" on public.tareas for update to authenticated
  using (asignado_id = public.mi_usuario_id() or created_by = public.mi_usuario_id()
         or public.mi_rol() in ('direccion','jefe_tienda','administracion'));

create table public.metas (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references public.tiendas(id) on delete cascade,
  periodo text not null, equipos_objetivo int not null default 0,
  ganancia_objetivo bigint not null default 0,
  unique (tienda_id, periodo));
grant select, insert, update on public.metas to authenticated;
grant all on public.metas to service_role;
alter table public.metas enable row level security;
create policy "metas lectura" on public.metas for select to authenticated
  using (public.puede_ver_tienda(tienda_id));
create policy "metas insert" on public.metas for insert to authenticated
  with check (public.mi_rol() in ('direccion','jefe_tienda','administracion'));
create policy "metas update" on public.metas for update to authenticated
  using (public.mi_rol() in ('direccion','jefe_tienda','administracion'));

create table public.cierres_caja (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references public.tiendas(id) on delete restrict,
  usuario_id uuid references public.usuarios(id) on delete set null,
  fondo_inicial bigint not null default 0,
  esperado_efectivo bigint not null default 0, contado_efectivo bigint not null default 0,
  esperado_transferencia bigint not null default 0, contado_transferencia bigint not null default 0,
  esperado_credito bigint not null default 0, contado_credito bigint not null default 0,
  esperado_parte_pago bigint not null default 0, contado_parte_pago bigint not null default 0,
  equipos_esperados int not null default 0, equipos_contados int not null default 0,
  imeis_faltantes text[] not null default '{}',
  fecha timestamptz not null default now());
grant select, insert, update on public.cierres_caja to authenticated;
grant all on public.cierres_caja to service_role;
alter table public.cierres_caja enable row level security;
create policy "cierres lectura" on public.cierres_caja for select to authenticated
  using (public.puede_ver_tienda(tienda_id));
create policy "cierres insert" on public.cierres_caja for insert to authenticated
  with check (public.puede_ver_tienda(tienda_id));
create policy "cierres update" on public.cierres_caja for update to authenticated
  using (public.mi_rol() in ('direccion','jefe_tienda','administracion'));

create trigger trg_aud_equipos_estado after update of estado on public.equipos
  for each row when (old.estado is distinct from new.estado) execute function public.fn_auditar();
create trigger trg_aud_equipos_costo after update of costo on public.equipos
  for each row when (old.costo is distinct from new.costo) execute function public.fn_auditar();
create trigger trg_aud_equipos_ins after insert on public.equipos
  for each row execute function public.fn_auditar();
create trigger trg_aud_precios after insert or update on public.precios
  for each row execute function public.fn_auditar();
create trigger trg_aud_ventas_ins after insert on public.ventas
  for each row execute function public.fn_auditar();
create trigger trg_aud_ventas_anulacion after update of anulada on public.ventas
  for each row when (old.anulada is distinct from new.anulada) execute function public.fn_auditar();
create trigger trg_aud_movimientos after insert on public.movimientos
  for each row execute function public.fn_auditar();
create trigger trg_aud_garantias after insert or update on public.garantias
  for each row execute function public.fn_auditar();
create trigger trg_aud_reservas after insert or update on public.reservas
  for each row execute function public.fn_auditar();
create trigger trg_aud_gastos after insert or update on public.gastos
  for each row execute function public.fn_auditar();
create trigger trg_aud_cierres after insert or update on public.cierres_caja
  for each row execute function public.fn_auditar();
create trigger trg_aud_servicios after insert or update on public.servicios_equipo
  for each row execute function public.fn_auditar();

create view public.v_stock with (security_invoker = true) as
select e.id, e.imei, e.modelo, e.gb, e.color, e.bateria, e.categoria, e.estado,
       e.ubicacion_id, t.nombre as tienda, e.fecha_ingreso
from public.equipos e left join public.tiendas t on t.id = e.ubicacion_id;
grant select on public.v_stock to authenticated;

create view public.v_equipos_full as
select e.*, t.nombre as tienda
from public.equipos e left join public.tiendas t on t.id = e.ubicacion_id
where public.ve_costos(e.ubicacion_id);
grant select on public.v_equipos_full to authenticated;

create view public.v_ventas_full as
select v.* from public.ventas v where public.ve_ganancias(v.tienda_id);
grant select on public.v_ventas_full to authenticated;

create or replace function public.login_lookup(_usuario text, _pin text)
returns table (email_interno text, debe_cambiar_pin boolean)
language plpgsql security definer set search_path = public as $$
declare u public.usuarios;
begin
  select * into u from public.usuarios where lower(usuario) = lower(_usuario);
  if u.id is null or not u.activo then raise exception 'Usuario o PIN incorrecto'; end if;
  if u.bloqueado_hasta is not null and u.bloqueado_hasta > now() then
    raise exception 'Usuario bloqueado por intentos fallidos. Intenta más tarde.';
  end if;
  if u.pin_hash = crypt(_pin, u.pin_hash) then
    update public.usuarios set intentos_fallidos = 0, bloqueado_hasta = null where id = u.id;
    return query select u.email_interno, u.debe_cambiar_pin;
  else
    update public.usuarios
      set intentos_fallidos = u.intentos_fallidos + 1,
          bloqueado_hasta = case when u.intentos_fallidos + 1 >= 5
                                 then now() + interval '15 minutes' else null end
      where id = u.id;
    raise exception 'Usuario o PIN incorrecto';
  end if;
end $$;
revoke all on function public.login_lookup(text, text) from public;
grant execute on function public.login_lookup(text, text) to anon, authenticated;

create or replace function public.cambiar_pin(_pin_nuevo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := public.mi_usuario_id();
  if v_id is null then raise exception 'Sesión no válida'; end if;
  if _pin_nuevo !~ '^[0-9]{6}$' then raise exception 'El PIN debe tener 6 dígitos'; end if;
  update public.usuarios
    set pin_hash = crypt(_pin_nuevo, gen_salt('bf')),
        debe_cambiar_pin = false,
        intentos_fallidos = 0,
        bloqueado_hasta = null
    where id = v_id;
end $$;
revoke all on function public.cambiar_pin(text) from public;
grant execute on function public.cambiar_pin(text) to authenticated;

insert into public.tiendas (nombre, slug, color_acento, es_bodega) values
  ('Black Pink Phone','black-pink-phone','#EC4899',false),
  ('Riffstore','riffstore','#8B5CF6',false),
  ('iPhonizate','iphonizate','#F59E0B',false),
  ('Bodega central','bodega','#64748B',true);

insert into public.usuarios (nombre, usuario, email_interno, rol, tienda_id, pin_hash) values
  ('Renato','renato','renato@riffstore.local','direccion',null, crypt('204060', gen_salt('bf'))),
  ('Valentina Galaz','vgalaz','vgalaz@riffstore.local','direccion',null, crypt('204061', gen_salt('bf'))),
  ('Amaru','amaru','amaru@riffstore.local','jefe_tienda',(select id from public.tiendas where slug='riffstore'), crypt('310501', gen_salt('bf'))),
  ('Liz','liz','liz@riffstore.local','administracion',null, crypt('410701', gen_salt('bf'))),
  ('Alanis','alanis','alanis@riffstore.local','operaciones',(select id from public.tiendas where slug='bodega'), crypt('510901', gen_salt('bf'))),
  ('Yihan','yihan','yihan@riffstore.local','operaciones',(select id from public.tiendas where slug='bodega'), crypt('510902', gen_salt('bf'))),
  ('Sofía','sofia','sofia@riffstore.local','vendedor',(select id from public.tiendas where slug='black-pink-phone'), crypt('610101', gen_salt('bf'))),
  ('Aaron','aaron','aaron@riffstore.local','vendedor',(select id from public.tiendas where slug='black-pink-phone'), crypt('610102', gen_salt('bf'))),
  ('Bam','bam','bam@riffstore.local','vendedor',(select id from public.tiendas where slug='riffstore'), crypt('610201', gen_salt('bf'))),
  ('Matías','matias','matias@riffstore.local','vendedor',(select id from public.tiendas where slug='iphonizate'), crypt('610301', gen_salt('bf'))),
  ('Valentina','valentina','valentina@riffstore.local','vendedor',(select id from public.tiendas where slug='iphonizate'), crypt('610302', gen_salt('bf')));