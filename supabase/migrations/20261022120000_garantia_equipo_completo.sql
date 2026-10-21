/* Garantía de un teléfono que no estaba en el sistema: se piden los mismos datos que al ingresar
   un equipo al inventario (categoría, email vinculado, costo de compra, proveedor, lote, fecha de
   compra, notas, además de modelo, GB, color, batería y SIM). Solo cambia lo que se guarda.
   Aplicar a mano desde el editor SQL (Lovable Cloud), ANTES de subir el código. */

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
  v_categoria text := coalesce(nullif(_equipo->>'categoria', ''), 'seminuevo');
  v_proveedor text := nullif(trim(coalesce(_equipo->>'proveedor', '')), '');
  v_fecha timestamptz := coalesce(nullif(_equipo->>'fecha_ingreso', '')::timestamptz, now());
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
  if v_categoria not in ('sellado', 'openbox', 'seminuevo', 'reacondicionado') then
    raise exception 'Categoría no válida';
  end if;
  if v_fecha > now() + interval '1 day' then raise exception 'La fecha de compra no puede ser futura'; end if;

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
    if v_sim is null then raise exception 'Indica si el equipo es SIM física o eSIM'; end if;
    if v_proveedor is null then raise exception 'Indica el proveedor del equipo'; end if;

    insert into public.equipos
      (imei, modelo, gb, color, bateria, sim, categoria, email_vinculado, costo, proveedor, lote,
       estado, ubicacion_id, fecha_ingreso, notas)
    values
      (v_g.imei, v_modelo, v_gb, v_color, v_bateria, v_sim, v_categoria::public.categoria_equipo,
       nullif(trim(coalesce(_equipo->>'email_vinculado', '')), ''),
       /* Quien no ve costos no puede cargarlos: queda en 0 */
       case when public.ve_costos(v_g.tienda_id)
            then greatest(0, coalesce(nullif(_equipo->>'costo', '')::bigint, 0)) else 0 end,
       v_proveedor,
       nullif(trim(coalesce(_equipo->>'lote', '')), ''),
       'GARANTIA', v_g.tienda_id, v_fecha,
       concat_ws(E'\n', nullif(trim(coalesce(_equipo->>'notas', '')), ''),
                 'Vendido antes del sistema: agregado desde Garantías'));
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

select 'garantia_agregar_equipo actualizada' as resultado;
