/* Garantías:
   1) Todos pueden ingresarlas y resolverlas, en cualquier tienda. Antes vendedor y jefe de
      tienda solo podían en la suya y les salía "Solo puedes … garantías de tu tienda".
   2) Un teléfono vendido antes de que existiera el sistema no estaba en el inventario: su
      garantía quedaba sin equipo y no se podía mandar a técnico ni resolver con cambio.
      Ahora se agrega el equipo desde la misma garantía y el flujo sigue solo.
   Aplicar a mano desde el editor SQL (Lovable Cloud), ANTES de subir el código. */

-- 1) Quitar la restricción por tienda ---------------------------------------------------------
/* Se borra solo el bloque "if … mi_tienda() then raise exception 'Solo puedes … garantías …'"
   de cada función que está en la base; lo demás queda igual. */
do $$
declare
  v_fn text;
  v_def text;
  v_nuevo text;
begin
  foreach v_fn in array array[
    'public.crear_garantia(text,text,text,text,text,uuid)',
    'public.resolver_garantia_reparado(uuid)',
    'public.resolver_garantia_cambio(uuid,text,bigint)'
  ] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    v_nuevo := regexp_replace(
      v_def,
      '\mif\s[^;]*?mi_tienda\(\)\s+then\s+raise exception ''Solo puedes [^'']*garant[^'']*'';\s+end if;',
      '',
      'g'
    );
    if v_nuevo = v_def then
      if v_def ~ 'Solo puedes [^'']*garant' then
        raise exception '% es distinta a la esperada: pégale a Claude el resultado de select pg_get_functiondef(''%''::regprocedure);', v_fn, v_fn;
      end if;
      raise notice '% ya permitía todas las tiendas', v_fn;
    else
      execute v_nuevo;
      raise notice '% ahora permite todas las tiendas', v_fn;
    end if;
  end loop;
end $$;

-- 2) Agregar el equipo de una garantía que quedó sin equipo ---------------------------------
/* _equipo: {"modelo": "iPhone 13", "gb": 128, "color": "Azul", "bateria": 87, "sim": "esim"}
   Si el IMEI ya está en el sistema (vendido), se enlaza ese equipo en vez de crear otro. */
create or replace function public.garantia_agregar_equipo(_garantia uuid, _equipo jsonb)
returns uuid
language plpgsql
security definer
set search_path to public
as $$
declare
  v_mi uuid := public.mi_usuario_id();
  v_g public.garantias;
  v_eq public.equipos;
  v_id uuid;
  v_modelo text := nullif(trim(coalesce(_equipo->>'modelo', '')), '');
  v_color text := nullif(trim(coalesce(_equipo->>'color', '')), '');
  v_gb int := nullif(_equipo->>'gb', '')::int;
  v_bateria int := least(100, greatest(0, nullif(_equipo->>'bateria', '')::int));
  v_sim text := nullif(_equipo->>'sim', '');
begin
  if not public.puede_operar_garantias() then
    raise exception 'Tu rol no puede operar garantías';
  end if;
  select * into v_g from public.garantias where id = _garantia for update;
  if v_g.id is null then raise exception 'La garantía no existe'; end if;
  if v_g.estado <> 'abierta' then raise exception 'Esa garantía ya está cerrada'; end if;
  if v_g.equipo_id is not null then raise exception 'Esa garantía ya tiene su equipo'; end if;
  if v_sim is not null and v_sim not in ('sim', 'esim') then
    raise exception 'Tipo de SIM no válido';
  end if;

  select * into v_eq from public.equipos where imei = v_g.imei for update;

  if v_eq.id is not null then
    if v_eq.estado in ('POR_REVISAR', 'EN_TECNICO', 'DISPONIBLE', 'RESERVADO') then
      raise exception 'Ese IMEI está en el inventario (%): no puede estar en garantía a la vez', v_eq.estado;
    end if;
    update public.equipos
      set estado = 'GARANTIA', ubicacion_id = v_g.tienda_id, updated_at = now()
      where id = v_eq.id;
    v_id := v_eq.id;
  else
    if v_modelo is null then raise exception 'Indica el modelo del equipo'; end if;
    /* Costo 0: no se sabe cuánto costó. Si la garantía termina en cambio, el equipo vuelve al
       inventario con el costo que calcula "resolver con cambio". */
    insert into public.equipos
      (imei, modelo, gb, color, bateria, sim, categoria, costo, estado, ubicacion_id, notas)
    values
      (v_g.imei, v_modelo, v_gb, v_color, v_bateria, v_sim, 'seminuevo', 0, 'GARANTIA',
       v_g.tienda_id, 'Vendido antes del sistema: agregado desde Garantías');
    select id into v_id from public.equipos where imei = v_g.imei;
    insert into public.equipos_historial (equipo_id, evento, usuario_id)
    values (v_id, 'agregado al sistema desde Garantías (venta anterior al sistema)', v_mi);
  end if;

  update public.garantias set equipo_id = v_id where id = _garantia;
  insert into public.equipos_historial (equipo_id, evento, usuario_id)
  values (v_id, 'entró en garantía: ' || v_g.falla, v_mi);

  return v_id;
end $$;

revoke all on function public.garantia_agregar_equipo(uuid, jsonb) from public, anon;
grant execute on function public.garantia_agregar_equipo(uuid, jsonb) to authenticated;

-- Resultado para el editor: garantías abiertas que todavía no tienen equipo
select count(*) as garantias_abiertas_sin_equipo
from public.garantias
where estado = 'abierta' and equipo_id is null;
