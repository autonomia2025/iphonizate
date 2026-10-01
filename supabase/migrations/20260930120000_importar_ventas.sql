/* Importar ventas históricas desde Excel (Historial de ventas → Importar ventas).
   Aplicada a mano desde el editor SQL (Lovable Cloud). */

/* Marca de cada venta importada: si se sube el mismo archivo dos veces, no se duplica. */
alter table public.ventas add column if not exists clave_importacion text;
create unique index if not exists ventas_clave_importacion_key
  on public.ventas (clave_importacion) where clave_importacion is not null;

/* Recibe ventas ya agrupadas por la pantalla:
     [{ clave, tienda_id, fecha: 'AAAA-MM-DD', vendedor, cliente: {nombre, telefono, correo},
        items: [{ imei, modelo, gb, color, precio, costo }],
        pagos: [{ metodo, monto, nombre_pagador }] }]
   Con _probar = true revisa todo y deshace los cambios: sirve para la vista previa.
   Cada venta se guarda o falla por separado; devuelve el resultado de cada una. */
create or replace function public.importar_ventas(_ventas jsonb, _probar boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_mi uuid := public.mi_usuario_id();
  v_res jsonb := '[]'::jsonb;
  v_ok int := 0;
  v_v jsonb;
  v_it jsonb;
  v_pg jsonb;
  v_avisos jsonb;
  v_resueltos jsonb;
  v_tienda uuid;
  v_dia date;
  v_fecha timestamptz;
  v_txt text;
  v_vendedor uuid;
  v_cliente uuid;
  v_venta uuid;
  v_eq public.equipos;
  v_equipo uuid;
  v_acc uuid;
  v_acc_costo bigint;
  v_imei text;
  v_precio bigint;
  v_costo bigint;
  v_total bigint;
  v_ganancia bigint;
  v_pagado bigint;
begin
  if not public.puede_corregir_ventas() then
    raise exception 'Solo Renato, Liz y Valentina pueden importar ventas';
  end if;
  if jsonb_typeof(_ventas) is distinct from 'array' then
    raise exception 'Formato de importación no válido';
  end if;
  if jsonb_array_length(_ventas) > 200 then
    raise exception 'Máximo 200 ventas por envío';
  end if;

  begin -- en modo prueba este bloque completo se deshace al final
    for v_v in select * from jsonb_array_elements(_ventas) loop
      v_avisos := '[]'::jsonb;
      begin -- cada venta en su propia subtransacción
        if nullif(trim(coalesce(v_v->>'clave', '')), '') is null then
          raise exception 'Venta sin clave de importación';
        end if;
        if exists (select 1 from public.ventas where clave_importacion = v_v->>'clave') then
          raise exception 'Esta venta ya se importó antes';
        end if;

        v_tienda := nullif(v_v->>'tienda_id', '')::uuid;
        if v_tienda is null or not exists (select 1 from public.tiendas where id = v_tienda) then
          raise exception 'Tienda no válida';
        end if;
        if not public.puede_ver_tienda(v_tienda) then
          raise exception 'No puedes registrar ventas en esa tienda';
        end if;

        if coalesce(v_v->>'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$' then
          raise exception 'Fecha no válida';
        end if;
        v_dia := (v_v->>'fecha')::date;
        if v_dia > (now() at time zone 'America/Santiago')::date then
          raise exception 'La fecha % está en el futuro', to_char(v_dia, 'DD-MM-YYYY');
        end if;
        v_fecha := (v_dia + time '12:00') at time zone 'America/Santiago';

        if jsonb_array_length(coalesce(v_v->'items', '[]'::jsonb)) = 0 then
          raise exception 'La venta no tiene productos';
        end if;
        if jsonb_array_length(coalesce(v_v->'pagos', '[]'::jsonb)) = 0 then
          raise exception 'La venta no tiene pagos';
        end if;

        -- vendedor por nombre, primer nombre o usuario (sin tildes ni mayúsculas)
        v_vendedor := null;
        v_txt := translate(lower(trim(coalesce(v_v->>'vendedor', ''))), 'áéíóúüñ', 'aeiouun');
        if v_txt <> '' then
          select u.id into v_vendedor from public.usuarios u
          where translate(lower(u.nombre), 'áéíóúüñ', 'aeiouun') = v_txt
             or lower(u.usuario) = v_txt
             or translate(lower(split_part(u.nombre, ' ', 1)), 'áéíóúüñ', 'aeiouun') = v_txt
          order by (translate(lower(u.nombre), 'áéíóúüñ', 'aeiouun') = v_txt) desc, u.activo desc
          limit 1;
          if v_vendedor is null then
            v_avisos := v_avisos || jsonb_build_array(
              format('Vendedor "%s" no existe en el sistema: queda sin vendedor', v_v->>'vendedor'));
          end if;
        end if;

        -- productos: se resuelven antes de crear la venta para calcular total y ganancia
        v_resueltos := '[]'::jsonb;
        v_total := 0;
        v_ganancia := 0;
        for v_it in select * from jsonb_array_elements(v_v->'items') loop
          v_precio := nullif(v_it->>'precio', '')::bigint;
          if v_precio is null or v_precio <= 0 then
            raise exception 'Hay un producto sin precio';
          end if;
          if nullif(trim(coalesce(v_it->>'modelo', '')), '') is null then
            raise exception 'Hay un producto sin modelo';
          end if;
          v_costo := nullif(v_it->>'costo', '')::bigint;
          v_imei := nullif(trim(coalesce(v_it->>'imei', '')), '');
          v_equipo := null;
          v_acc := null;

          if v_imei is not null then
            if v_imei !~ '^[0-9]{15}$' then
              raise exception 'El IMEI % no tiene 15 dígitos', v_imei;
            end if;
            select * into v_eq from public.equipos where imei = v_imei for update;
            if v_eq.id is not null then
              if exists (
                select 1 from public.venta_items vi join public.ventas v on v.id = vi.venta_id
                where vi.equipo_id = v_eq.id and not v.anulada
                  and (v.fecha at time zone 'America/Santiago')::date = v_dia
              ) then
                raise exception 'El IMEI % ya tiene una venta registrada ese día', v_imei;
              end if;
              -- El equipo ya está en el sistema (por ejemplo, volvió como parte de pago):
              -- se asocia a la venta sin cambiar su estado actual.
              v_equipo := v_eq.id;
              v_costo := coalesce(v_costo, v_eq.costo, 0);
              v_avisos := v_avisos || jsonb_build_array(format(
                'El IMEI %s ya existe en el sistema (%s): se asocia sin cambiar su estado',
                v_imei, v_eq.estado));
            end if;
          else
            select a.id, a.costo into v_acc, v_acc_costo from public.accesorios a
            where lower(trim(a.nombre)) = lower(trim(v_it->>'modelo'))
            limit 1;
            if v_acc is not null then
              v_costo := coalesce(v_costo, v_acc_costo, 0);
            else
              -- equipo sin IMEI: se registra con un código interno que empieza con 00000
              loop
                v_imei := '00000' || lpad((floor(random() * 1e10))::bigint::text, 10, '0');
                exit when not exists (select 1 from public.equipos where imei = v_imei);
              end loop;
              v_avisos := v_avisos || jsonb_build_array(
                format('%s sin IMEI: se registra con el código interno %s', v_it->>'modelo', v_imei));
            end if;
          end if;

          if v_equipo is null and v_acc is null then
            if v_costo is null then
              v_avisos := v_avisos || jsonb_build_array(
                format('%s sin costo: su ganancia queda igual al precio', v_it->>'modelo'));
            end if;
            insert into public.equipos (imei, modelo, gb, color, categoria, costo, estado,
                                        ubicacion_id, fecha_ingreso, notas)
            values (
              v_imei, trim(v_it->>'modelo'), nullif(v_it->>'gb', '')::int,
              nullif(trim(coalesce(v_it->>'color', '')), ''), 'seminuevo', coalesce(v_costo, 0),
              'VENDIDO', v_tienda, v_fecha,
              case when v_imei like '00000%' then 'Venta histórica importada sin IMEI'
                   else 'Venta histórica importada' end
            )
            returning id into v_equipo;
          end if;

          v_costo := coalesce(v_costo, 0);
          v_total := v_total + v_precio;
          v_ganancia := v_ganancia + (v_precio - v_costo);
          v_resueltos := v_resueltos || jsonb_build_array(jsonb_build_object(
            'equipo_id', v_equipo, 'accesorio_id', v_acc, 'precio', v_precio, 'costo', v_costo));
        end loop;

        -- pagos: deben cuadrar con el total
        v_pagado := 0;
        for v_pg in select * from jsonb_array_elements(v_v->'pagos') loop
          if coalesce(v_pg->>'metodo', '') not in ('efectivo','transferencia','credito','partePago') then
            raise exception 'Método de pago no reconocido';
          end if;
          v_pagado := v_pagado + coalesce(nullif(v_pg->>'monto', '')::bigint, 0);
        end loop;
        if v_pagado <> v_total then
          raise exception 'Los pagos (%) no cuadran con el total (%)', v_pagado, v_total;
        end if;

        -- cliente: se reutiliza si ya existe en esa tienda con el mismo nombre
        v_cliente := null;
        v_txt := nullif(trim(coalesce(v_v->'cliente'->>'nombre', '')), '');
        if v_txt is not null then
          select c.id into v_cliente from public.clientes c
          where c.tienda_id = v_tienda and lower(trim(c.nombre)) = lower(v_txt)
            and (nullif(trim(coalesce(v_v->'cliente'->>'telefono', '')), '') is null
                 or c.telefono is null
                 or c.telefono = trim(v_v->'cliente'->>'telefono'))
          limit 1;
          if v_cliente is null then
            insert into public.clientes (nombre, telefono, correo, tienda_id)
            values (
              v_txt,
              nullif(trim(coalesce(v_v->'cliente'->>'telefono', '')), ''),
              nullif(trim(coalesce(v_v->'cliente'->>'correo', '')), ''),
              v_tienda
            )
            returning id into v_cliente;
          end if;
        end if;

        -- venta ya revisada: no aparece como pendiente en Revisión de pagos
        insert into public.ventas (tienda_id, cliente_id, vendedor_id, total, ganancia, con_boleta,
                                   recargo_boleta, revision, fecha, clave_importacion)
        values (v_tienda, v_cliente, v_vendedor, v_total, v_ganancia, false, 0, 'revisado',
                v_fecha, v_v->>'clave')
        returning id into v_venta;

        for v_it in select * from jsonb_array_elements(v_resueltos) loop
          insert into public.venta_items (venta_id, equipo_id, accesorio_id, precio, costo_snapshot)
          values (v_venta, nullif(v_it->>'equipo_id', '')::uuid, nullif(v_it->>'accesorio_id', '')::uuid,
                  (v_it->>'precio')::bigint, (v_it->>'costo')::bigint);
          if nullif(v_it->>'equipo_id', '') is not null then
            insert into public.equipos_historial (equipo_id, evento, usuario_id, fecha)
            values ((v_it->>'equipo_id')::uuid, 'Vendido (venta importada desde Excel)', v_mi, v_fecha);
          end if;
        end loop;

        for v_pg in select * from jsonb_array_elements(v_v->'pagos') loop
          insert into public.pagos (venta_id, metodo, monto, nombre_pagador, fecha,
                                    confirmado, confirmado_at, confirmado_por)
          values (
            v_venta, (v_pg->>'metodo')::public.metodo_pago, (v_pg->>'monto')::bigint,
            nullif(trim(coalesce(v_pg->>'nombre_pagador', '')), ''), v_fecha,
            true, now(), v_mi
          );
        end loop;

        v_ok := v_ok + 1;
        v_res := v_res || jsonb_build_array(jsonb_build_object(
          'clave', v_v->>'clave', 'ok', true, 'avisos', v_avisos));
      exception when others then
        v_res := v_res || jsonb_build_array(jsonb_build_object(
          'clave', v_v->>'clave', 'ok', false, 'error', sqlerrm, 'avisos', v_avisos));
      end;
    end loop;

    if v_ok > 0 then
      insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
      values ('ventas_importadas',
              jsonb_build_object('importadas', v_ok, 'enviadas', jsonb_array_length(_ventas)),
              v_mi, public.mi_rol()::text, null);
    end if;

    if _probar then
      raise exception using errcode = 'P0901', message = 'simulacion';
    end if;
  exception when sqlstate 'P0901' then
    null; -- modo prueba: se deshace todo, pero el resultado de cada venta se devuelve igual
  end;

  return v_res;
end $$;
revoke all on function public.importar_ventas(jsonb, boolean) from public, anon;
grant execute on function public.importar_ventas(jsonb, boolean) to authenticated;
