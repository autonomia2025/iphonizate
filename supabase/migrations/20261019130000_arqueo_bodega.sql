/* Arqueo de bodega: conteo físico de los equipos DISPONIBLES de Oficina Central, escaneando
   IMEI uno por uno. Solo dirección y administración.
   - Al abrir se toma la lista de disponibles de la bodega. Cada IMEI escaneado sale de la lista;
     si un equipo se vende o se mueve durante el arqueo, también sale.
   - Puede haber varios arqueos abiertos: un IMEI escaneado en uno se descuenta de todos los que
     estuvieron abiertos al mismo tiempo. Los escaneos de un arqueo cancelado no cuentan.
   - Al terminar, lo que queda pasa a Pendientes; desde ahí se marca "Perdido" (sale del stock, no
     toca la ganancia) y desde Perdidos se puede marcar "Apareció" (vuelve a disponible).
   - Todo queda en Auditoría: apertura, escaneos, cierre, cancelación, perdido y apareció.
   Aplicar a mano desde el editor SQL (Lovable Cloud), DESPUÉS de 20261019120000_estado_perdido.sql. */

-- 1) Tablas -------------------------------------------------------------------------------------
create table if not exists public.arqueos (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references public.tiendas(id),
  estado text not null default 'abierto',
  abierto_por uuid references public.usuarios(id) on delete set null,
  abierto_at timestamptz not null default now(),
  cerrado_por uuid references public.usuarios(id) on delete set null,
  cerrado_at timestamptz,
  esperados int not null default 0,
  escaneados int,
  contados_en_otro int,
  salieron int,
  faltantes int,
  constraint arqueos_estado_check check (estado in ('abierto', 'pausado', 'terminado', 'cancelado'))
);
create index if not exists arqueos_estado_idx on public.arqueos (estado);

/* La foto de la bodega al abrir el arqueo */
create table if not exists public.arqueo_items (
  arqueo_id uuid not null references public.arqueos(id) on delete cascade,
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  primary key (arqueo_id, equipo_id)
);

create table if not exists public.arqueo_escaneos (
  id uuid primary key default gen_random_uuid(),
  arqueo_id uuid not null references public.arqueos(id) on delete cascade,
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete set null,
  fecha timestamptz not null default now(),
  unique (arqueo_id, equipo_id)
);
create index if not exists arqueo_escaneos_equipo_idx on public.arqueo_escaneos (equipo_id);

create table if not exists public.arqueo_pendientes (
  id uuid primary key default gen_random_uuid(),
  arqueo_id uuid not null references public.arqueos(id) on delete cascade,
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  estado text not null default 'pendiente',
  nota text,
  marcado_por uuid references public.usuarios(id) on delete set null,
  marcado_at timestamptz,
  aparecio_por uuid references public.usuarios(id) on delete set null,
  aparecio_at timestamptz,
  unique (arqueo_id, equipo_id),
  constraint arqueo_pendientes_estado_check check (estado in ('pendiente', 'perdido', 'aparecio'))
);
create index if not exists arqueo_pendientes_equipo_idx on public.arqueo_pendientes (equipo_id);

/* Nadie las lee ni escribe directo: todo pasa por las funciones de abajo */
alter table public.arqueos enable row level security;
alter table public.arqueo_items enable row level security;
alter table public.arqueo_escaneos enable row level security;
alter table public.arqueo_pendientes enable row level security;
revoke all on public.arqueos, public.arqueo_items, public.arqueo_escaneos, public.arqueo_pendientes
  from public, anon, authenticated;
grant all on public.arqueos, public.arqueo_items, public.arqueo_escaneos, public.arqueo_pendientes
  to service_role;

-- 2) Reglas -------------------------------------------------------------------------------------
create or replace function public.puede_arquear()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol() in ('direccion', 'administracion'), false)
$$;

/* Equipos que todavía faltan por escanear en un arqueo: estaban en la foto, siguen disponibles en
   la bodega y nadie los escaneó en un arqueo (no cancelado) que estuvo abierto al mismo tiempo. */
create or replace function public.arqueo_faltan(_arqueo uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select i.equipo_id
  from public.arqueo_items i
  join public.arqueos a on a.id = i.arqueo_id
  join public.equipos e on e.id = i.equipo_id
  where i.arqueo_id = _arqueo
    and e.estado = 'DISPONIBLE'
    and e.ubicacion_id = a.tienda_id
    and not exists (
      select 1 from public.arqueo_escaneos s
      join public.arqueos o on o.id = s.arqueo_id
      where s.equipo_id = i.equipo_id
        and o.estado <> 'cancelado'
        and (o.cerrado_at is null or o.cerrado_at >= a.abierto_at)
    )
$$;

-- 3) Abrir --------------------------------------------------------------------------------------
create or replace function public.arqueo_abrir()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_bodega uuid;
  v_id uuid;
  v_n int;
begin
  if not public.puede_arquear() then raise exception 'Solo dirección y administración hacen arqueos'; end if;
  select id into v_bodega from public.tiendas where es_bodega order by created_at limit 1;
  if v_bodega is null then raise exception 'No hay una bodega configurada'; end if;

  insert into public.arqueos (tienda_id, abierto_por) values (v_bodega, public.mi_usuario_id())
  returning id into v_id;
  insert into public.arqueo_items (arqueo_id, equipo_id)
  select v_id, e.id from public.equipos e where e.estado = 'DISPONIBLE' and e.ubicacion_id = v_bodega;
  get diagnostics v_n = row_count;
  update public.arqueos set esperados = v_n where id = v_id;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('arqueo_abierto', jsonb_build_object('arqueo', v_id, 'esperados', v_n),
          public.mi_usuario_id(), public.mi_rol()::text, v_bodega);
  return v_id;
end $$;

-- 4) Listados -----------------------------------------------------------------------------------
create or replace function public.arqueos_listar(_limite int default 100)
returns table (
  id uuid, estado text, tienda text, abierto_por text, abierto_at timestamptz,
  cerrado_por text, cerrado_at timestamptz, esperados int, escaneados int, quedan int,
  contados_en_otro int, salieron int, faltantes int
)
language sql stable security definer set search_path = public as $$
  select a.id, a.estado, t.nombre, ua.nombre, a.abierto_at, uc.nombre, a.cerrado_at, a.esperados,
         coalesce(a.escaneados, (select count(*) from public.arqueo_escaneos s where s.arqueo_id = a.id))::int,
         case when a.estado in ('abierto', 'pausado')
              then (select count(*) from public.arqueo_faltan(a.id))::int end,
         a.contados_en_otro, a.salieron, a.faltantes
  from public.arqueos a
  left join public.tiendas t on t.id = a.tienda_id
  left join public.usuarios ua on ua.id = a.abierto_por
  left join public.usuarios uc on uc.id = a.cerrado_por
  where public.puede_arquear()
  order by (a.estado in ('abierto', 'pausado')) desc, a.abierto_at desc
  limit _limite
$$;

/* Lo que falta por escanear en un arqueo, para mostrar en pantalla */
create or replace function public.arqueo_lista(_arqueo uuid)
returns table (equipo_id uuid, imei text, modelo text, gb int, color text, bateria int, sim text)
language sql stable security definer set search_path = public as $$
  select e.id, e.imei, e.modelo, e.gb, e.color, e.bateria, e.sim
  from public.arqueo_faltan(_arqueo) f(equipo_id)
  join public.equipos e on e.id = f.equipo_id
  where public.puede_arquear()
  order by e.modelo, e.gb, e.color, e.imei
$$;

-- 5) Escanear -----------------------------------------------------------------------------------
/* Devuelve {resultado: ok | ya_escaneado | no_en_lista, ...}. Solo "ok" guarda algo. */
create or replace function public.arqueo_escanear(_arqueo uuid, _imei text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_a public.arqueos;
  v_eq public.equipos;
  v_imei text := regexp_replace(coalesce(_imei, ''), '\D', '', 'g');
  v_por text;
  v_fecha timestamptz;
  v_mismo boolean;
begin
  if not public.puede_arquear() then raise exception 'Solo dirección y administración hacen arqueos'; end if;
  select * into v_a from public.arqueos where id = _arqueo;
  if v_a.id is null then raise exception 'Ese arqueo no existe'; end if;
  if v_a.estado in ('terminado', 'cancelado') then raise exception 'Ese arqueo ya está %', v_a.estado; end if;
  if v_a.estado = 'pausado' then
    update public.arqueos set estado = 'abierto' where id = _arqueo;
  end if;

  select * into v_eq from public.equipos where imei = v_imei;
  if v_eq.id is null then
    return jsonb_build_object('resultado', 'no_en_lista', 'motivo', 'no_existe', 'imei', v_imei);
  end if;
  if not exists (select 1 from public.arqueo_items where arqueo_id = _arqueo and equipo_id = v_eq.id)
     or v_eq.estado <> 'DISPONIBLE' or v_eq.ubicacion_id is distinct from v_a.tienda_id then
    return jsonb_build_object('resultado', 'no_en_lista', 'motivo', 'fuera', 'imei', v_imei,
                              'modelo', v_eq.modelo, 'estado', v_eq.estado::text,
                              'tienda', (select nombre from public.tiendas where id = v_eq.ubicacion_id));
  end if;

  select u.nombre, s.fecha, s.arqueo_id = _arqueo into v_por, v_fecha, v_mismo
  from public.arqueo_escaneos s
  join public.arqueos o on o.id = s.arqueo_id
  left join public.usuarios u on u.id = s.usuario_id
  where s.equipo_id = v_eq.id
    and o.estado <> 'cancelado'
    and (o.cerrado_at is null or o.cerrado_at >= v_a.abierto_at)
  order by s.fecha
  limit 1;
  if v_fecha is not null then
    return jsonb_build_object('resultado', 'ya_escaneado', 'imei', v_imei, 'modelo', v_eq.modelo,
                              'por', v_por, 'fecha', v_fecha, 'mismo_arqueo', v_mismo);
  end if;

  insert into public.arqueo_escaneos (arqueo_id, equipo_id, usuario_id)
  values (_arqueo, v_eq.id, public.mi_usuario_id())
  on conflict (arqueo_id, equipo_id) do nothing;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('arqueo_escaneo', jsonb_build_object('arqueo', _arqueo, 'imei', v_eq.imei, 'modelo', v_eq.modelo),
          public.mi_usuario_id(), public.mi_rol()::text, v_a.tienda_id);

  return jsonb_build_object('resultado', 'ok', 'equipo_id', v_eq.id, 'imei', v_eq.imei,
                            'modelo', v_eq.modelo, 'gb', v_eq.gb, 'color', v_eq.color);
end $$;

-- 6) Pausar, terminar y cancelar ----------------------------------------------------------------
create or replace function public.arqueo_pausar(_arqueo uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.puede_arquear() then raise exception 'Solo dirección y administración hacen arqueos'; end if;
  update public.arqueos set estado = 'pausado' where id = _arqueo and estado = 'abierto';
end $$;

create or replace function public.arqueo_terminar(_arqueo uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_a public.arqueos;
  v_aqui int;
  v_otro int;
  v_faltan int;
  v_salieron int;
  v_abiertos int;
begin
  if not public.puede_arquear() then raise exception 'Solo dirección y administración hacen arqueos'; end if;
  select * into v_a from public.arqueos where id = _arqueo for update;
  if v_a.id is null then raise exception 'Ese arqueo no existe'; end if;
  if v_a.estado not in ('abierto', 'pausado') then raise exception 'Ese arqueo ya está %', v_a.estado; end if;

  /* Lo que queda en la lista pasa a Pendientes */
  insert into public.arqueo_pendientes (arqueo_id, equipo_id)
  select _arqueo, f from public.arqueo_faltan(_arqueo) f
  on conflict (arqueo_id, equipo_id) do nothing;
  get diagnostics v_faltan = row_count;

  select count(*) into v_aqui from public.arqueo_escaneos where arqueo_id = _arqueo;
  select count(*) into v_otro
  from public.arqueo_items i
  where i.arqueo_id = _arqueo
    and not exists (select 1 from public.arqueo_escaneos s where s.arqueo_id = _arqueo and s.equipo_id = i.equipo_id)
    and exists (
      select 1 from public.arqueo_escaneos s
      join public.arqueos o on o.id = s.arqueo_id
      where s.equipo_id = i.equipo_id and o.id <> _arqueo and o.estado <> 'cancelado'
        and (o.cerrado_at is null or o.cerrado_at >= v_a.abierto_at));
  v_salieron := greatest(0, v_a.esperados - v_aqui - v_otro - v_faltan);

  update public.arqueos
     set estado = 'terminado', cerrado_por = public.mi_usuario_id(), cerrado_at = now(),
         escaneados = v_aqui, contados_en_otro = v_otro, salieron = v_salieron, faltantes = v_faltan
   where id = _arqueo;

  select count(*) into v_abiertos from public.arqueos
  where estado in ('abierto', 'pausado') and id <> _arqueo;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('arqueo_terminado',
          jsonb_build_object('arqueo', _arqueo, 'esperados', v_a.esperados, 'escaneados', v_aqui,
                             'contados_en_otro', v_otro, 'salieron', v_salieron, 'faltantes', v_faltan),
          public.mi_usuario_id(), public.mi_rol()::text, v_a.tienda_id);

  return jsonb_build_object('esperados', v_a.esperados, 'escaneados', v_aqui,
                            'contados_en_otro', v_otro, 'salieron', v_salieron,
                            'faltantes', v_faltan, 'otros_abiertos', v_abiertos);
end $$;

/* Se descartan sus escaneos (dejan de contar para cualquier arqueo) y el stock no cambia */
create or replace function public.arqueo_cancelar(_arqueo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_a public.arqueos;
  v_n int;
begin
  if not public.puede_arquear() then raise exception 'Solo dirección y administración hacen arqueos'; end if;
  select * into v_a from public.arqueos where id = _arqueo for update;
  if v_a.id is null then raise exception 'Ese arqueo no existe'; end if;
  if v_a.estado not in ('abierto', 'pausado') then raise exception 'Ese arqueo ya está %', v_a.estado; end if;

  select count(*) into v_n from public.arqueo_escaneos where arqueo_id = _arqueo;
  update public.arqueos
     set estado = 'cancelado', cerrado_por = public.mi_usuario_id(), cerrado_at = now(), escaneados = v_n
   where id = _arqueo;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('arqueo_cancelado', jsonb_build_object('arqueo', _arqueo, 'escaneos_descartados', v_n),
          public.mi_usuario_id(), public.mi_rol()::text, v_a.tienda_id);
end $$;

-- 7) Pendientes y perdidos ----------------------------------------------------------------------
/* Faltantes de arqueos terminados que siguen sin aparecer: el equipo sigue disponible en la
   bodega y nadie lo escaneó en un arqueo posterior. Un equipo aparece una sola vez. */
create or replace function public.arqueo_pendientes_lista()
returns table (
  pendiente_id uuid, arqueo_id uuid, arqueo_fecha timestamptz, equipo_id uuid,
  imei text, modelo text, gb int, color text, sim text
)
language sql stable security definer set search_path = public as $$
  select distinct on (p.equipo_id)
         p.id, p.arqueo_id, a.cerrado_at, e.id, e.imei, e.modelo, e.gb, e.color, e.sim
  from public.arqueo_pendientes p
  join public.arqueos a on a.id = p.arqueo_id
  join public.equipos e on e.id = p.equipo_id
  where public.puede_arquear()
    and p.estado = 'pendiente'
    and e.estado = 'DISPONIBLE'
    and e.ubicacion_id = a.tienda_id
    and not exists (
      select 1 from public.arqueo_escaneos s
      join public.arqueos o on o.id = s.arqueo_id
      where s.equipo_id = p.equipo_id and o.estado <> 'cancelado' and s.fecha > a.cerrado_at)
  order by p.equipo_id, a.cerrado_at desc
$$;

create or replace function public.arqueo_marcar_perdido(_pendiente uuid, _nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_p public.arqueo_pendientes;
  v_eq public.equipos;
  v_nota text := nullif(trim(coalesce(_nota, '')), '');
begin
  if not public.puede_arquear() then raise exception 'Solo dirección y administración hacen arqueos'; end if;
  select * into v_p from public.arqueo_pendientes where id = _pendiente for update;
  if v_p.id is null then raise exception 'Ese pendiente no existe'; end if;
  if v_p.estado <> 'pendiente' then raise exception 'Ese equipo ya está marcado (%)', v_p.estado; end if;
  select * into v_eq from public.equipos where id = v_p.equipo_id for update;
  if v_eq.estado <> 'DISPONIBLE' then
    raise exception 'El equipo ya no está disponible (%): no se puede marcar como perdido', v_eq.estado;
  end if;

  update public.equipos set estado = 'PERDIDO', updated_at = now() where id = v_eq.id;
  update public.arqueo_pendientes
     set estado = 'perdido', nota = v_nota, marcado_por = public.mi_usuario_id(), marcado_at = now()
   where equipo_id = v_eq.id and estado = 'pendiente';

  insert into public.equipos_historial (equipo_id, evento, usuario_id)
  values (v_eq.id, 'marcado como perdido tras el arqueo de bodega' || coalesce(': ' || v_nota, ''),
          public.mi_usuario_id());
  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('equipo_perdido',
          jsonb_build_object('imei', v_eq.imei, 'modelo', v_eq.modelo, 'nota', v_nota, 'arqueo', v_p.arqueo_id),
          public.mi_usuario_id(), public.mi_rol()::text, v_eq.ubicacion_id);
end $$;

create or replace function public.perdidos_lista()
returns table (
  equipo_id uuid, imei text, modelo text, gb int, color text, sim text, tienda text,
  nota text, marcado_por text, marcado_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select e.id, e.imei, e.modelo, e.gb, e.color, e.sim, t.nombre, p.nota, u.nombre, p.marcado_at
  from public.equipos e
  left join public.tiendas t on t.id = e.ubicacion_id
  left join lateral (
    select ap.nota, ap.marcado_por, ap.marcado_at from public.arqueo_pendientes ap
    where ap.equipo_id = e.id and ap.estado = 'perdido'
    order by ap.marcado_at desc nulls last limit 1
  ) p on true
  left join public.usuarios u on u.id = p.marcado_por
  where public.puede_arquear() and e.estado = 'PERDIDO'
  order by p.marcado_at desc nulls last
$$;

create or replace function public.equipo_aparecio(_equipo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_eq public.equipos;
begin
  if not public.puede_arquear() then raise exception 'Solo dirección y administración hacen arqueos'; end if;
  select * into v_eq from public.equipos where id = _equipo for update;
  if v_eq.id is null then raise exception 'Ese equipo no existe'; end if;
  if v_eq.estado <> 'PERDIDO' then raise exception 'Ese equipo no está marcado como perdido'; end if;

  update public.equipos set estado = 'DISPONIBLE', updated_at = now() where id = _equipo;
  update public.arqueo_pendientes
     set estado = 'aparecio', aparecio_por = public.mi_usuario_id(), aparecio_at = now()
   where equipo_id = _equipo and estado = 'perdido';

  insert into public.equipos_historial (equipo_id, evento, usuario_id)
  values (_equipo, 'apareció: vuelve a disponible', public.mi_usuario_id());
  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('equipo_aparecio', jsonb_build_object('imei', v_eq.imei, 'modelo', v_eq.modelo),
          public.mi_usuario_id(), public.mi_rol()::text, v_eq.ubicacion_id);
end $$;

revoke all on function public.puede_arquear() from public, anon;
revoke all on function public.arqueo_faltan(uuid) from public, anon, authenticated;
revoke all on function public.arqueo_abrir() from public, anon;
revoke all on function public.arqueos_listar(int) from public, anon;
revoke all on function public.arqueo_lista(uuid) from public, anon;
revoke all on function public.arqueo_escanear(uuid, text) from public, anon;
revoke all on function public.arqueo_pausar(uuid) from public, anon;
revoke all on function public.arqueo_terminar(uuid) from public, anon;
revoke all on function public.arqueo_cancelar(uuid) from public, anon;
revoke all on function public.arqueo_pendientes_lista() from public, anon;
revoke all on function public.arqueo_marcar_perdido(uuid, text) from public, anon;
revoke all on function public.perdidos_lista() from public, anon;
revoke all on function public.equipo_aparecio(uuid) from public, anon;
grant execute on function public.puede_arquear() to authenticated;
grant execute on function public.arqueo_abrir() to authenticated;
grant execute on function public.arqueos_listar(int) to authenticated;
grant execute on function public.arqueo_lista(uuid) to authenticated;
grant execute on function public.arqueo_escanear(uuid, text) to authenticated;
grant execute on function public.arqueo_pausar(uuid) to authenticated;
grant execute on function public.arqueo_terminar(uuid) to authenticated;
grant execute on function public.arqueo_cancelar(uuid) to authenticated;
grant execute on function public.arqueo_pendientes_lista() to authenticated;
grant execute on function public.arqueo_marcar_perdido(uuid, text) to authenticated;
grant execute on function public.perdidos_lista() to authenticated;
grant execute on function public.equipo_aparecio(uuid) to authenticated;

-- 8) Un equipo perdido no se traslada ni va a técnico --------------------------------------------
/* Se agrega 'PERDIDO' a la lista de estados bloqueados de cada función que está en la base.
   Si alguna no tiene la forma esperada no se toca (la pantalla igual lo bloquea). */
do $$
declare
  v_fn text;
  v_def text;
  v_nuevo text;
begin
  foreach v_fn in array array[
    'public.trasladar_equipos(text[],uuid,uuid)',
    'public.asignar_equipos_tecnico(text[],uuid)',
    'public.agregar_servicios_equipo(uuid,jsonb)'
  ] loop
    if to_regprocedure(v_fn) is null then
      raise notice '% no existe: no se cambió', v_fn;
      continue;
    end if;
    v_def := pg_get_functiondef(v_fn::regprocedure);
    if v_def like '%''PERDIDO''%' then
      raise notice '% ya bloqueaba equipos perdidos', v_fn;
      continue;
    end if;
    v_nuevo := regexp_replace(v_def, '''VENDIDO'',\s*''ENTREGADO'',\s*''RESERVADO''\)',
                              '''VENDIDO'', ''ENTREGADO'', ''RESERVADO'', ''PERDIDO'')', 'g');
    if v_nuevo = v_def then
      raise notice '% es distinta a la esperada: no se cambió', v_fn;
    else
      execute v_nuevo;
    end if;
  end loop;
end $$;

-- Resultado para el editor: cuántos equipos disponibles hay hoy en la bodega
select t.nombre as bodega, count(e.id) as disponibles
from public.tiendas t
left join public.equipos e on e.ubicacion_id = t.id and e.estado = 'DISPONIBLE'
where t.es_bodega
group by t.nombre;
