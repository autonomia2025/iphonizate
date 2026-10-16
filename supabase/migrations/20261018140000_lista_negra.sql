/* Inventario de lista negra: equipos con el IMEI reportado que la tienda compró y no se venden
   por el flujo normal (sin boleta ni garantía). Se ingresan igual que el inventario, suman a la
   inversión y terminan de dos formas:
   - Vendido: solo se anota el valor de la venta.
   - Cambiado: se ingresa el teléfono que se recibió a cambio y entra solo al inventario normal,
     heredando el costo del equipo de lista negra (la plata invertida pasa al equipo nuevo).
   Aplicar a mano desde el editor SQL (Lovable Cloud), DESPUÉS de 20261018120000_sim_esim.sql. */

-- 1) Tabla ------------------------------------------------------------------------------------
create table if not exists public.lista_negra (
  id uuid primary key default gen_random_uuid(),
  imei text not null,
  modelo text not null,
  gb int,
  color text,
  bateria int,
  sim text,
  costo bigint not null default 0,
  proveedor text,
  lote text,
  notas text,
  ubicacion_id uuid references public.tiendas(id) on delete set null,
  estado text not null default 'en_stock',
  valor_venta bigint,
  equipo_cambio_id uuid references public.equipos(id) on delete set null,
  fecha_ingreso timestamptz not null default now(),
  ingresado_por uuid references public.usuarios(id) on delete set null,
  cerrado_at timestamptz,
  cerrado_por uuid references public.usuarios(id) on delete set null,
  constraint lista_negra_imei_check check (imei ~ '^\d{15}$'),
  constraint lista_negra_estado_check check (estado in ('en_stock', 'vendido', 'cambiado')),
  constraint lista_negra_sim_check check (sim is null or sim in ('sim', 'esim'))
);
/* El mismo IMEI no puede estar dos veces en stock; sí puede volver después de venderse */
create unique index if not exists lista_negra_imei_en_stock
  on public.lista_negra (imei) where estado = 'en_stock';
create index if not exists lista_negra_estado_idx on public.lista_negra (estado);

/* Nadie lee ni escribe la tabla directo: lectura por la vista, cambios por las funciones */
alter table public.lista_negra enable row level security;
revoke all on public.lista_negra from public, anon, authenticated;
grant all on public.lista_negra to service_role;

-- 2) Vista ------------------------------------------------------------------------------------
/* Mismos roles que Inventario. El costo solo lo ve quien ve costos en esa tienda. */
create or replace view public.v_lista_negra
with (security_invoker = false) as
  select l.id, l.imei, l.modelo, l.gb, l.color, l.bateria, l.sim,
         l.ubicacion_id, t.nombre as tienda,
         l.proveedor, l.lote, l.notas, l.estado,
         l.fecha_ingreso, ui.nombre as ingresado_por,
         l.cerrado_at, uc.nombre as cerrado_por,
         l.valor_venta,
         l.equipo_cambio_id, e.imei as imei_cambio, e.modelo as modelo_cambio,
         case when public.ve_costos(l.ubicacion_id) then l.costo end as costo
    from public.lista_negra l
    left join public.tiendas t on t.id = l.ubicacion_id
    left join public.usuarios ui on ui.id = l.ingresado_por
    left join public.usuarios uc on uc.id = l.cerrado_por
    left join public.equipos e on e.id = l.equipo_cambio_id
   where public.mi_rol() in ('direccion', 'jefe_tienda', 'administracion', 'operaciones')
     and public.puede_ver_tienda(l.ubicacion_id);

revoke all on public.v_lista_negra from public, anon;
grant select on public.v_lista_negra to authenticated;
grant all on public.v_lista_negra to service_role;

-- 3) Ingresar ---------------------------------------------------------------------------------
/* _datos: {"imei","modelo","gb","color","bateria","sim","costo","proveedor","lote","notas","ubicacion_id"} */
create or replace function public.lista_negra_ingresar(_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path to public
as $$
declare
  v_rol app_rol := public.mi_rol();
  v_imei text := trim(coalesce(_datos->>'imei', ''));
  v_modelo text := nullif(trim(coalesce(_datos->>'modelo', '')), '');
  v_ubicacion uuid := nullif(_datos->>'ubicacion_id', '')::uuid;
  v_sim text := nullif(_datos->>'sim', '');
  v_activo text;
  v_id uuid;
begin
  if v_rol is null or v_rol not in ('direccion', 'jefe_tienda', 'administracion', 'operaciones') then
    raise exception 'Tu rol no puede ingresar equipos';
  end if;
  if v_imei !~ '^\d{15}$' then raise exception 'El IMEI debe tener 15 dígitos'; end if;
  if v_modelo is null then raise exception 'Indica el modelo del equipo'; end if;
  if v_ubicacion is null then raise exception 'Selecciona la ubicación del equipo'; end if;
  if not public.puede_ver_tienda(v_ubicacion) then
    raise exception 'No puedes ingresar equipos en esa tienda';
  end if;
  if v_sim is not null and v_sim not in ('sim', 'esim') then raise exception 'Tipo de SIM no válido'; end if;
  if nullif(trim(coalesce(_datos->>'proveedor', '')), '') is null then
    raise exception 'Indica el proveedor del equipo';
  end if;

  if exists (select 1 from public.lista_negra where imei = v_imei and estado = 'en_stock') then
    raise exception 'Ese IMEI ya está en la lista negra';
  end if;
  select estado::text into v_activo from public.equipos
   where imei = v_imei and estado in ('POR_REVISAR', 'EN_TECNICO', 'DISPONIBLE', 'RESERVADO', 'GARANTIA');
  if v_activo is not null then
    raise exception 'Ese IMEI está en el inventario normal (%): no puede estar en los dos', v_activo;
  end if;

  insert into public.lista_negra
    (imei, modelo, gb, color, bateria, sim, costo, proveedor, lote, notas, ubicacion_id, ingresado_por)
  values
    (v_imei, v_modelo,
     nullif(_datos->>'gb', '')::int,
     nullif(trim(coalesce(_datos->>'color', '')), ''),
     least(100, greatest(0, nullif(_datos->>'bateria', '')::int)),
     v_sim,
     /* Quien no ve costos no puede cargarlos: queda en 0 y se completa después */
     case when public.ve_costos(v_ubicacion)
          then greatest(0, coalesce(nullif(_datos->>'costo', '')::bigint, 0)) else 0 end,
     trim(_datos->>'proveedor'),
     nullif(trim(coalesce(_datos->>'lote', '')), ''),
     nullif(trim(coalesce(_datos->>'notas', '')), ''),
     v_ubicacion,
     public.mi_usuario_id())
  returning id into v_id;

  insert into public.auditoria (accion, detalle, usuario_id, rol)
  values ('lista_negra_ingreso', jsonb_build_object('imei', v_imei, 'modelo', v_modelo),
          public.mi_usuario_id(), v_rol::text);
  return v_id;
end $$;

-- 4) Vendido: solo el valor de la venta ------------------------------------------------------
create or replace function public.lista_negra_vender(_id uuid, _valor bigint, _notas text default null)
returns void
language plpgsql
security definer
set search_path to public
as $$
declare
  v_rol app_rol := public.mi_rol();
  v_l public.lista_negra;
begin
  if v_rol is null or v_rol not in ('direccion', 'jefe_tienda', 'administracion', 'operaciones') then
    raise exception 'Tu rol no puede cerrar equipos de lista negra';
  end if;
  select * into v_l from public.lista_negra where id = _id for update;
  if v_l.id is null then raise exception 'Ese equipo no está en la lista negra'; end if;
  if v_l.estado <> 'en_stock' then raise exception 'Ese equipo ya se cerró (%)', v_l.estado; end if;
  if not public.puede_ver_tienda(v_l.ubicacion_id) then
    raise exception 'Ese equipo es de otra tienda';
  end if;
  if coalesce(_valor, 0) <= 0 then raise exception 'Ingresa el valor de la venta'; end if;

  update public.lista_negra
     set estado = 'vendido', valor_venta = _valor,
         notas = coalesce(nullif(trim(coalesce(_notas, '')), ''), notas),
         cerrado_at = now(), cerrado_por = public.mi_usuario_id()
   where id = _id;

  insert into public.auditoria (accion, detalle, usuario_id, rol)
  values ('lista_negra_vendido', jsonb_build_object('imei', v_l.imei, 'valor', _valor),
          public.mi_usuario_id(), v_rol::text);
end $$;

-- 5) Cambiado: el teléfono recibido entra al inventario normal ------------------------------
/* _equipo: {"imei","modelo","gb","color","bateria","sim","categoria","costo","proveedor","ubicacion_id","notas"}
   Si quien lo hace no ve costos, o no indica costo, el equipo nuevo hereda el costo del de
   lista negra. Entra Disponible; si necesita arreglos se le agregan desde Técnico. */
create or replace function public.lista_negra_cambiar(_id uuid, _equipo jsonb)
returns uuid
language plpgsql
security definer
set search_path to public
as $$
declare
  v_rol app_rol := public.mi_rol();
  v_mi uuid := public.mi_usuario_id();
  v_l public.lista_negra;
  v_imei text := trim(coalesce(_equipo->>'imei', ''));
  v_modelo text := nullif(trim(coalesce(_equipo->>'modelo', '')), '');
  v_ubicacion uuid := coalesce(nullif(_equipo->>'ubicacion_id', '')::uuid, null);
  v_sim text := nullif(_equipo->>'sim', '');
  v_categoria text := coalesce(nullif(_equipo->>'categoria', ''), 'seminuevo');
  v_costo bigint;
  v_activo text;
  v_id uuid;
begin
  if v_rol is null or v_rol not in ('direccion', 'jefe_tienda', 'administracion', 'operaciones') then
    raise exception 'Tu rol no puede cerrar equipos de lista negra';
  end if;
  select * into v_l from public.lista_negra where id = _id for update;
  if v_l.id is null then raise exception 'Ese equipo no está en la lista negra'; end if;
  if v_l.estado <> 'en_stock' then raise exception 'Ese equipo ya se cerró (%)', v_l.estado; end if;
  if not public.puede_ver_tienda(v_l.ubicacion_id) then
    raise exception 'Ese equipo es de otra tienda';
  end if;

  v_ubicacion := coalesce(v_ubicacion, v_l.ubicacion_id);
  if v_ubicacion is null then raise exception 'Selecciona la ubicación del equipo recibido'; end if;
  if not public.puede_ver_tienda(v_ubicacion) then
    raise exception 'No puedes ingresar equipos en esa tienda';
  end if;
  if v_imei !~ '^\d{15}$' then raise exception 'El IMEI del equipo recibido debe tener 15 dígitos'; end if;
  if v_imei = v_l.imei then raise exception 'El equipo recibido debe ser otro teléfono'; end if;
  if v_modelo is null then raise exception 'Indica el modelo del equipo recibido'; end if;
  if v_sim is not null and v_sim not in ('sim', 'esim') then raise exception 'Tipo de SIM no válido'; end if;
  if v_categoria not in ('sellado', 'openbox', 'seminuevo', 'reacondicionado') then
    raise exception 'Categoría no válida';
  end if;
  if nullif(trim(coalesce(_equipo->>'proveedor', '')), '') is null then
    raise exception 'Indica de quién se recibió el equipo (proveedor)';
  end if;

  select estado::text into v_activo from public.equipos
   where imei = v_imei and estado in ('POR_REVISAR', 'EN_TECNICO', 'DISPONIBLE', 'RESERVADO', 'GARANTIA');
  if v_activo is not null then
    raise exception 'El IMEI % ya está en el inventario (%)', v_imei, v_activo;
  end if;
  if exists (select 1 from public.lista_negra where imei = v_imei and estado = 'en_stock') then
    raise exception 'El IMEI % está en la lista negra', v_imei;
  end if;

  v_costo := case
    when public.ve_costos(v_ubicacion) and coalesce(nullif(_equipo->>'costo', '')::bigint, 0) > 0
      then (_equipo->>'costo')::bigint
    else v_l.costo end;

  /* Si el IMEI ya pasó por la cadena (vendido), la regla de reingreso actualiza esa ficha */
  insert into public.equipos
    (imei, modelo, gb, color, bateria, sim, categoria, costo, proveedor, estado, ubicacion_id, notas)
  values
    (v_imei, v_modelo,
     nullif(_equipo->>'gb', '')::int,
     nullif(trim(coalesce(_equipo->>'color', '')), ''),
     least(100, greatest(0, nullif(_equipo->>'bateria', '')::int)),
     v_sim,
     v_categoria::categoria_equipo,
     v_costo,
     trim(_equipo->>'proveedor'),
     'DISPONIBLE',
     v_ubicacion,
     concat_ws(E'\n',
       nullif(trim(coalesce(_equipo->>'notas', '')), ''),
       'Recibido en cambio por un equipo de lista negra (IMEI ' || v_l.imei || ')'));

  select id into v_id from public.equipos where imei = v_imei;
  insert into public.equipos_historial (equipo_id, evento, usuario_id)
  values (v_id, 'ingresó por cambio de un equipo de lista negra (IMEI ' || v_l.imei || ')', v_mi);

  update public.lista_negra
     set estado = 'cambiado', equipo_cambio_id = v_id,
         cerrado_at = now(), cerrado_por = v_mi
   where id = _id;

  insert into public.auditoria (accion, detalle, usuario_id, rol)
  values ('lista_negra_cambiado',
          jsonb_build_object('imei', v_l.imei, 'imei_recibido', v_imei, 'costo_traspasado', v_costo),
          v_mi, v_rol::text);
  return v_id;
end $$;

-- 6) Inversión en stock: inventario normal + lista negra -------------------------------------
/* Suma el costo de lo que todavía es de la empresa (por revisar, en técnico, disponible y
   reservado) más la lista negra en stock. Cada quien ve la suma de las tiendas donde ve costos. */
create or replace function public.inversion_stock()
returns table (inventario bigint, equipos bigint, lista_negra bigint, lista_negra_equipos bigint)
language sql
stable
security definer
set search_path to public
as $$
  select
    (select coalesce(sum(e.costo), 0)::bigint from public.equipos e
      where e.estado in ('POR_REVISAR', 'EN_TECNICO', 'DISPONIBLE', 'RESERVADO')
        and public.ve_costos(e.ubicacion_id)),
    (select count(*) from public.equipos e
      where e.estado in ('POR_REVISAR', 'EN_TECNICO', 'DISPONIBLE', 'RESERVADO')
        and public.ve_costos(e.ubicacion_id)),
    (select coalesce(sum(l.costo), 0)::bigint from public.lista_negra l
      where l.estado = 'en_stock' and public.ve_costos(l.ubicacion_id)),
    (select count(*) from public.lista_negra l
      where l.estado = 'en_stock' and public.ve_costos(l.ubicacion_id))
  where public.mi_rol() is not null
$$;

revoke all on function public.lista_negra_ingresar(jsonb) from public, anon;
revoke all on function public.lista_negra_vender(uuid, bigint, text) from public, anon;
revoke all on function public.lista_negra_cambiar(uuid, jsonb) from public, anon;
revoke all on function public.inversion_stock() from public, anon;
grant execute on function public.lista_negra_ingresar(jsonb) to authenticated;
grant execute on function public.lista_negra_vender(uuid, bigint, text) to authenticated;
grant execute on function public.lista_negra_cambiar(uuid, jsonb) to authenticated;
grant execute on function public.inversion_stock() to authenticated;

-- Resultado para el editor
select 'lista_negra lista' as estado, (select count(*) from public.lista_negra) as equipos;
