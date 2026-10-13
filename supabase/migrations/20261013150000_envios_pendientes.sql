/* Envíos pendientes: toda venta con envío queda "pendiente" hasta que alguien de la tienda
   la marca como enviada (queda quién y cuándo). Aplicada a mano desde el editor SQL (Lovable Cloud). */

alter table public.ventas add column if not exists envio_estado text;
alter table public.ventas add column if not exists enviado_at timestamptz;
alter table public.ventas add column if not exists enviado_por uuid references public.usuarios(id) on delete set null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ventas_envio_estado_check') then
    alter table public.ventas add constraint ventas_envio_estado_check
      check (envio_estado is null or envio_estado in ('pendiente', 'enviado'));
  end if;
end $$;
grant select (envio_estado, enviado_at, enviado_por) on public.ventas to authenticated;

/* Al marcar una venta como envío queda pendiente sola; si vuelve a presencial se limpia. */
create or replace function public.fn_ventas_envio_estado()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.modalidad = 'envio' and new.envio_estado is null then
    new.envio_estado := 'pendiente';
  elsif new.modalidad is distinct from 'envio' then
    new.envio_estado := null;
    new.enviado_at := null;
    new.enviado_por := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_ventas_envio_estado on public.ventas;
create trigger trg_ventas_envio_estado before insert or update of modalidad, envio_estado on public.ventas
  for each row execute function public.fn_ventas_envio_estado();

-- Las ventas con envío que ya existían quedan pendientes, para que la tienda las confirme
update public.ventas set envio_estado = 'pendiente'
where modalidad = 'envio' and envio_estado is null;

/* Marca un envío como enviado (o lo devuelve a pendiente si fue un error). */
create or replace function public.marcar_envio(_venta uuid, _enviado boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_v public.ventas;
begin
  if public.mi_rol() is null then raise exception 'Sesión no válida'; end if;
  select * into v_v from public.ventas where id = _venta for update;
  if v_v.id is null then raise exception 'Esa venta no existe'; end if;
  if not public.puede_ver_tienda(v_v.tienda_id) then
    raise exception 'Solo puedes marcar envíos de tu tienda';
  end if;
  if v_v.modalidad is distinct from 'envio' then raise exception 'Esa venta no es con envío'; end if;
  if v_v.anulada then raise exception 'Esa venta está anulada'; end if;

  update public.ventas
    set envio_estado = case when _enviado then 'enviado' else 'pendiente' end,
        enviado_at = case when _enviado then now() else null end,
        enviado_por = case when _enviado then public.mi_usuario_id() else null end
    where id = _venta;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values (case when _enviado then 'envio_enviado' else 'envio_pendiente' end,
          jsonb_build_object('venta', _venta, 'envio_detalle', v_v.envio_detalle),
          public.mi_usuario_id(), public.mi_rol()::text, v_v.tienda_id);
end $$;
revoke all on function public.marcar_envio(uuid, boolean) from public, anon;
grant execute on function public.marcar_envio(uuid, boolean) to authenticated;
