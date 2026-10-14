/* El costo de los servicios (batería, pantalla, etc.) pasa a descontarse de la ganancia de la
   venta del equipo. Se completan con el catálogo "Costos de arreglo" los servicios que quedaron
   en $0 y las ventas ya hechas se ajustan solas. Aplicada a mano desde el editor SQL (Lovable Cloud).

   Regla: el costo de un servicio se carga a la primera venta vigente del equipo posterior
   al servicio (si el equipo se vendió, volvió y se vendió de nuevo, cada venta lleva lo suyo). */

/* 0) Las correcciones automáticas de costo pueden ajustar la ganancia de una venta aunque
      quien edite el servicio no sea de dirección. Solo se cambia si la regla es la esperada. */
do $$
declare v_def text;
begin
  v_def := regexp_replace(pg_get_functiondef('public.fn_ventas_campos_protegidos()'::regprocedure), '\s+', ' ', 'g');
  if v_def like '%app.costo_sistema%' then
    raise notice 'fn_ventas_campos_protegidos ya permitía ajustes automáticos';
  elsif v_def like '%Tu rol no puede anular ventas ni modificar sus montos%'
        and v_def not like '%elsif%'
        and (length(v_def) - length(replace(v_def, 'raise exception', ''))) / length('raise exception') = 1 then
    execute $f$
      create or replace function public.fn_ventas_campos_protegidos()
      returns trigger language plpgsql security definer set search_path = public as $b$
      begin
        if coalesce(current_setting('app.costo_sistema', true), '0') = '1' then
          return new;
        end if;
        if (new.anulada is distinct from old.anulada
            or new.total is distinct from old.total
            or new.ganancia is distinct from old.ganancia)
           and public.mi_rol() not in ('direccion','jefe_tienda','administracion') then
          raise exception 'Tu rol no puede anular ventas ni modificar sus montos';
        end if;
        return new;
      end $b$
    $f$;
  else
    raise notice 'fn_ventas_campos_protegidos es distinta a la esperada: no se cambió';
  end if;
end $$;

/* Venta a la que corresponde un servicio: la primera vigente del equipo después del servicio. */
create or replace function public.venta_item_de_servicio(_equipo uuid, _desde timestamptz)
returns uuid language sql stable security definer set search_path = public as $$
  select vi.id
  from public.venta_items vi join public.ventas v on v.id = vi.venta_id
  where vi.equipo_id = _equipo and not v.anulada and v.fecha >= _desde
  order by v.fecha asc limit 1
$$;
revoke all on function public.venta_item_de_servicio(uuid, timestamptz) from public, anon, authenticated;

/* Ajusta costo del ítem vendido y ganancia de la venta en `_delta`. */
create or replace function public.ajustar_venta_por_servicio(_item uuid, _delta bigint, _motivo jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_venta uuid; v_tienda uuid;
begin
  if _item is null or coalesce(_delta, 0) = 0 then return; end if;
  update public.venta_items set costo_snapshot = costo_snapshot + _delta
    where id = _item returning venta_id into v_venta;
  perform set_config('app.costo_sistema', '1', true);
  update public.ventas set ganancia = ganancia - _delta where id = v_venta returning tienda_id into v_tienda;
  perform set_config('app.costo_sistema', '0', true);
  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values ('costo_servicio_en_venta', _motivo || jsonb_build_object('venta', v_venta, 'ajuste', _delta),
          public.mi_usuario_id(), public.mi_rol()::text, v_tienda);
end $$;
revoke all on function public.ajustar_venta_por_servicio(uuid, bigint, jsonb) from public, anon, authenticated;

/* 1) Si cambia el costo de un servicio de un equipo ya vendido, la venta se ajusta. */
create or replace function public.fn_servicio_costo_a_venta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.ajustar_venta_por_servicio(
    public.venta_item_de_servicio(new.equipo_id, new.created_at),
    coalesce(new.costo, 0) - coalesce(old.costo, 0),
    jsonb_build_object('servicio', new.id, 'tipo', new.tipo, 'costo_antes', old.costo, 'costo_despues', new.costo));
  return new;
end $$;
drop trigger if exists trg_servicio_costo_a_venta on public.servicios_equipo;
create trigger trg_servicio_costo_a_venta after update of costo on public.servicios_equipo
  for each row when (old.costo is distinct from new.costo)
  execute function public.fn_servicio_costo_a_venta();

/* 2) Ventas nuevas: al vender un equipo se descuentan sus servicios (los posteriores a su venta
      anterior). Solo si la función de ventas de la base no lo hace ya, para no contar dos veces. */
create or replace function public.fn_venta_item_costo_servicios()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_desde timestamptz; v_total bigint;
begin
  if new.equipo_id is null then return new; end if;
  select max(v.fecha) into v_desde
  from public.venta_items vi join public.ventas v on v.id = vi.venta_id
  where vi.equipo_id = new.equipo_id and vi.id <> new.id and not v.anulada;
  select coalesce(sum(s.costo), 0) into v_total from public.servicios_equipo s
  where s.equipo_id = new.equipo_id and s.created_at > coalesce(v_desde, '-infinity'::timestamptz);
  perform public.ajustar_venta_por_servicio(new.id, v_total,
    jsonb_build_object('servicios_al_vender', v_total, 'equipo', new.equipo_id));
  return new;
end $$;
do $$
begin
  if exists (select 1 from pg_proc where proname = 'registrar_venta' and prosrc ilike '%servicios_equipo%') then
    drop trigger if exists trg_venta_item_costo_servicios on public.venta_items;
    raise notice 'registrar_venta ya descuenta servicios: no se agrega el ajuste al vender';
  else
    drop trigger if exists trg_venta_item_costo_servicios on public.venta_items;
    create trigger trg_venta_item_costo_servicios after insert on public.venta_items
      for each row execute function public.fn_venta_item_costo_servicios();
  end if;
end $$;

/* 3) Completar con "Costos de arreglo" los servicios en $0 (el trigger 1 ajusta las ventas). */
do $$
declare v_servicios int; v_ventas int;
begin
  update public.servicios_equipo s
    set costo = ca.costo
  from public.equipos e, public.costos_arreglo ca
  where s.equipo_id = e.id
    and coalesce(s.costo, 0) = 0
    and lower(trim(ca.modelo)) = lower(trim(e.modelo))
    and ca.tipo::text = s.tipo::text
    and ca.costo > 0;
  get diagnostics v_servicios = row_count;
  select count(distinct detalle->>'venta') into v_ventas from public.auditoria
  where accion = 'costo_servicio_en_venta' and fecha > now() - interval '1 minute';
  raise notice 'Servicios completados con el catálogo: % · ventas ajustadas: %', v_servicios, v_ventas;
end $$;
