/* Lista oficial de proveedores. Al ingresar un equipo el proveedor se elige de esta lista (o se
   agrega uno nuevo), para poder buscar después por proveedor (por ejemplo, para pedir garantía).
   Los nombres que solo difieren en mayúsculas, tildes, puntos o espacios se unen solos.
   Aplicada a mano desde el editor SQL (Lovable Cloud). */

-- "ALEJANDRO COLO", "alejandro colo." y "Alejandro  Colo" → "alejandrocolo"
create or replace function public.normalizar_proveedor(_t text)
returns text language sql immutable as $$
  select nullif(regexp_replace(translate(lower(trim(coalesce(_t, ''))), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '', 'g'), '')
$$;

create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  clave text generated always as (public.normalizar_proveedor(nombre)) stored,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid
);
create unique index if not exists proveedores_clave_key on public.proveedores (clave);
alter table public.proveedores enable row level security;
grant select on public.proveedores to authenticated;
drop policy if exists "proveedores lectura" on public.proveedores;
create policy "proveedores lectura" on public.proveedores for select to authenticated
  using (public.mi_rol() is not null);

/* 1) Lista inicial con los proveedores ya usados: de cada grupo igual se toma la forma más
      usada, con mayúscula inicial. */
insert into public.proveedores (nombre)
select initcap(lower(trim(nombre)))
from (
  select distinct on (public.normalizar_proveedor(proveedor)) proveedor as nombre
  from public.equipos
  where public.normalizar_proveedor(proveedor) is not null
  group by proveedor
  order by public.normalizar_proveedor(proveedor), count(*) desc, proveedor
) t
on conflict (clave) do nothing;

/* 2) Al guardar un equipo, su proveedor queda escrito como en la lista; si no existía, se agrega. */
create or replace function public.fn_equipos_proveedor()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nombre text;
begin
  if public.normalizar_proveedor(new.proveedor) is null then
    new.proveedor := null;
    return new;
  end if;
  select nombre into v_nombre from public.proveedores where clave = public.normalizar_proveedor(new.proveedor);
  if v_nombre is null then
    insert into public.proveedores (nombre, created_by)
    values (trim(new.proveedor), public.mi_usuario_id())
    returning nombre into v_nombre;
  end if;
  new.proveedor := v_nombre;
  return new;
end $$;
drop trigger if exists trg_equipos_proveedor on public.equipos;
create trigger trg_equipos_proveedor before insert or update of proveedor on public.equipos
  for each row execute function public.fn_equipos_proveedor();

-- 3) Los equipos que ya existían quedan con el nombre de la lista
update public.equipos e
set proveedor = p.nombre
from public.proveedores p
where public.normalizar_proveedor(e.proveedor) = p.clave and e.proveedor is distinct from p.nombre;
update public.equipos set proveedor = null
where proveedor is not null and public.normalizar_proveedor(proveedor) is null;

/* Agregar un proveedor nuevo desde "Ingresar equipo". Si ya existe (escrito distinto), devuelve
   el de la lista en vez de duplicarlo. */
create or replace function public.agregar_proveedor(_nombre text)
returns text language plpgsql security definer set search_path = public as $$
declare v_nombre text; v_limpio text := regexp_replace(trim(coalesce(_nombre, '')), '\s+', ' ', 'g');
begin
  if public.mi_rol() is null then raise exception 'Sesión no válida'; end if;
  if length(v_limpio) < 2 or length(v_limpio) > 60 then
    raise exception 'El nombre del proveedor debe tener entre 2 y 60 caracteres';
  end if;
  select nombre into v_nombre from public.proveedores where clave = public.normalizar_proveedor(v_limpio);
  if v_nombre is not null then
    update public.proveedores set activo = true where clave = public.normalizar_proveedor(v_limpio);
    return v_nombre;
  end if;
  insert into public.proveedores (nombre, created_by) values (v_limpio, public.mi_usuario_id())
  returning nombre into v_nombre;
  insert into public.auditoria (accion, detalle, usuario_id, rol)
  values ('proveedor_agregado', jsonb_build_object('nombre', v_nombre), public.mi_usuario_id(), public.mi_rol()::text);
  return v_nombre;
end $$;
revoke all on function public.agregar_proveedor(text) from public, anon;
grant execute on function public.agregar_proveedor(text) to authenticated;

-- Lista para Configuración, con cuántos equipos tiene cada proveedor
create or replace function public.listar_proveedores()
returns table (id uuid, nombre text, activo boolean, equipos bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.activo,
         (select count(*) from public.equipos e where e.proveedor = p.nombre)
  from public.proveedores p
  where public.mi_rol() is not null
  order by p.nombre
$$;
revoke all on function public.listar_proveedores() from public, anon;
grant execute on function public.listar_proveedores() to authenticated;

/* Renombrar, unir (todos los equipos del primero pasan al segundo) y ocultar: solo dirección
   y administración. */
create or replace function public.renombrar_proveedor(_id uuid, _nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare v_p public.proveedores; v_limpio text := regexp_replace(trim(coalesce(_nombre, '')), '\s+', ' ', 'g');
begin
  if public.mi_rol() is null or public.mi_rol() not in ('direccion', 'administracion') then
    raise exception 'Solo dirección y administración pueden editar proveedores';
  end if;
  if length(v_limpio) < 2 or length(v_limpio) > 60 then
    raise exception 'El nombre del proveedor debe tener entre 2 y 60 caracteres';
  end if;
  select * into v_p from public.proveedores where id = _id for update;
  if v_p.id is null then raise exception 'Ese proveedor no existe'; end if;
  if exists (select 1 from public.proveedores where clave = public.normalizar_proveedor(v_limpio) and id <> _id) then
    raise exception 'Ya existe un proveedor con ese nombre: usa "Unir con" en vez de renombrar';
  end if;
  update public.proveedores set nombre = v_limpio where id = _id;
  update public.equipos set proveedor = v_limpio
  where public.normalizar_proveedor(proveedor) = v_p.clave;
  insert into public.auditoria (accion, detalle, usuario_id, rol)
  values ('proveedor_renombrado', jsonb_build_object('antes', v_p.nombre, 'despues', v_limpio),
          public.mi_usuario_id(), public.mi_rol()::text);
end $$;

create or replace function public.unir_proveedores(_origen uuid, _destino uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_o public.proveedores; v_d public.proveedores; v_n bigint;
begin
  if public.mi_rol() is null or public.mi_rol() not in ('direccion', 'administracion') then
    raise exception 'Solo dirección y administración pueden editar proveedores';
  end if;
  if _origen = _destino then raise exception 'Elige dos proveedores distintos'; end if;
  select * into v_o from public.proveedores where id = _origen for update;
  select * into v_d from public.proveedores where id = _destino for update;
  if v_o.id is null or v_d.id is null then raise exception 'Uno de los proveedores no existe'; end if;
  update public.equipos set proveedor = v_d.nombre
  where public.normalizar_proveedor(proveedor) = v_o.clave;
  get diagnostics v_n = row_count;
  delete from public.proveedores where id = _origen;
  insert into public.auditoria (accion, detalle, usuario_id, rol)
  values ('proveedores_unidos', jsonb_build_object('de', v_o.nombre, 'en', v_d.nombre, 'equipos', v_n),
          public.mi_usuario_id(), public.mi_rol()::text);
  return v_n;
end $$;

create or replace function public.activar_proveedor(_id uuid, _activo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.mi_rol() is null or public.mi_rol() not in ('direccion', 'administracion') then
    raise exception 'Solo dirección y administración pueden editar proveedores';
  end if;
  update public.proveedores set activo = _activo where id = _id;
end $$;

revoke all on function public.renombrar_proveedor(uuid, text) from public, anon;
revoke all on function public.unir_proveedores(uuid, uuid) from public, anon;
revoke all on function public.activar_proveedor(uuid, boolean) from public, anon;
grant execute on function public.renombrar_proveedor(uuid, text) to authenticated;
grant execute on function public.unir_proveedores(uuid, uuid) to authenticated;
grant execute on function public.activar_proveedor(uuid, boolean) to authenticated;

-- Resultado para el editor: cuántos proveedores quedaron en la lista
select count(*) as proveedores_en_la_lista,
       (select count(distinct proveedor) from public.equipos where proveedor is not null) as nombres_distintos_en_equipos
from public.proveedores;
