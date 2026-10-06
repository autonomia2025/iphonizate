/* 1) Venta presencial o con envío, 2) índices para que las pantallas carguen más rápido,
   3) el permiso especial "equipos.costo" ahora también vale en la base de datos.
   Aplicada a mano desde el editor SQL (Lovable Cloud). */

-- 1) Presencial o envío ---------------------------------------------------------------
alter table public.ventas add column if not exists modalidad text not null default 'presencial';
alter table public.ventas add column if not exists envio_detalle text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ventas_modalidad_check') then
    alter table public.ventas add constraint ventas_modalidad_check
      check (modalidad in ('presencial', 'envio'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ventas_envio_detalle_largo') then
    alter table public.ventas add constraint ventas_envio_detalle_largo
      check (envio_detalle is null or length(envio_detalle) <= 300);
  end if;
end $$;
grant select (modalidad, envio_detalle) on public.ventas to authenticated;

-- 2) Índices (si ya existen no hace nada) ---------------------------------------------
create index if not exists ventas_fecha_idx on public.ventas (fecha);
create index if not exists ventas_tienda_fecha_idx on public.ventas (tienda_id, fecha);
create index if not exists venta_items_venta_idx on public.venta_items (venta_id);
create index if not exists venta_items_equipo_idx on public.venta_items (equipo_id);
create index if not exists pagos_venta_idx on public.pagos (venta_id);
create index if not exists equipos_estado_idx on public.equipos (estado);
create index if not exists equipos_historial_equipo_idx on public.equipos_historial (equipo_id, fecha);
create index if not exists movimientos_equipo_idx on public.movimientos (equipo_id);
create index if not exists movimientos_fecha_idx on public.movimientos (fecha);
create index if not exists servicios_equipo_equipo_idx on public.servicios_equipo (equipo_id);
create index if not exists clientes_tienda_idx on public.clientes (tienda_id);

-- 3) Permiso "equipos.costo" ------------------------------------------------------------
/* La app ya mostraba el costo a quien tiene ese permiso, pero la base no lo aceptaba:
   el costo quedaba invisible y al editarlo salía error. Se agrega el permiso a la regla
   existente sin cambiar nada más. Si la regla en la base no es la esperada, no se toca. */
do $$
declare
  v_def text;
begin
  if to_regprocedure('public.tiene_permiso(text)') is null then
    raise exception 'Falta la función tiene_permiso: no se cambió ve_costos';
  end if;
  v_def := regexp_replace(pg_get_functiondef('public.ve_costos(uuid)'::regprocedure), '\s+', ' ', 'g');
  if v_def like '%tiene_permiso(''equipos.costo'')%' then
    raise notice 've_costos ya incluía el permiso equipos.costo';
    return;
  end if;
  if v_def not like '%when ''jefe_tienda'' then (_tienda is null or _tienda = public.mi_tienda())%' then
    raise exception 've_costos es distinta a la esperada: pégale a Claude el resultado de select pg_get_functiondef(''public.ve_costos(uuid)''::regprocedure);';
  end if;

  execute $f$
    create or replace function public.ve_costos(_tienda uuid default null)
    returns boolean language sql stable security definer set search_path = public as $b$
      select (case public.mi_rol()
                when 'direccion' then true
                when 'administracion' then true
                when 'jefe_tienda' then (_tienda is null or _tienda = public.mi_tienda())
                else false end)
             or public.tiene_permiso('equipos.costo')
    $b$
  $f$;
end $$;
