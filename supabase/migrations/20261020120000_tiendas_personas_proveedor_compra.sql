/* Pedidos del 19-10:
   1) "Pro iPhone" pasa a llamarse "Pro Phone" (el slug pro-iphone no cambia: lo usa el código).
   2) Tienda nueva "Markt Store", roja.
   3) v_stock trae el proveedor, para filtrar por proveedor en Inventario aunque no se vean costos.
   4) Al ingresar un equipo se elige la fecha de compra (se guarda como fecha de ingreso): un
      reingreso también respeta la fecha elegida en vez de poner siempre "ahora".
   5) Crear personas desde Configuración: la app crea la cuenta de acceso y esta función guarda
      a la persona con su PIN inicial (solo la llama el servidor, nunca el navegador).
   Aplicar a mano desde el editor SQL (Lovable Cloud), ANTES de subir el código. */

-- 1) y 2) Tiendas ---------------------------------------------------------------------------------
update public.tiendas set nombre = 'Pro Phone' where slug = 'pro-iphone';

insert into public.tiendas (nombre, slug, color_acento, es_bodega)
values ('Markt Store', 'markt-store', '#DC2626', false)
on conflict (slug) do nothing;

-- 3) v_stock: las mismas columnas + proveedor al final ---------------------------------------------
do $$
declare
  v_cols text;
begin
  select string_agg(column_name::text, ',' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'v_stock';

  if v_cols like '%,proveedor' then
    raise notice 'v_stock ya tenía la columna proveedor';
    return;
  end if;
  if v_cols is distinct from 'id,imei,modelo,gb,color,bateria,categoria,estado,ubicacion_id,tienda,fecha_ingreso,serie,imei2,icloud_activo,lista_negra,bloqueo_operador,reemplazado_apple,garantia_estado,pais_compra,fecha_compra_estimada,bloqueo_usa,verificado_at,sim' then
    raise exception 'v_stock es distinta a la esperada: pégale a Claude el resultado de select pg_get_viewdef(''public.v_stock''::regclass);';
  end if;

  execute $v$
    create or replace view public.v_stock
    with (security_invoker = false) as
      select e.id, e.imei, e.modelo, e.gb, e.color, e.bateria, e.categoria,
             e.estado, e.ubicacion_id, t.nombre as tienda, e.fecha_ingreso,
             e.serie, e.imei2, e.icloud_activo, e.lista_negra, e.bloqueo_operador,
             e.reemplazado_apple, e.garantia_estado, e.pais_compra,
             e.fecha_compra_estimada, e.bloqueo_usa, e.verificado_at,
             e.sim, e.proveedor
        from public.equipos e
        left join public.tiendas t on t.id = e.ubicacion_id
       where public.mi_rol() is not null
  $v$;
end $$;

-- 4) Reingreso con la fecha de compra elegida ------------------------------------------------------
do $$
declare
  v_def text;
  v_nuevo text;
begin
  v_def := pg_get_functiondef('public.fn_equipos_reingreso()'::regprocedure);
  if v_def like '%fecha_ingreso = coalesce(new.fecha_ingreso, now())%' then
    raise notice 'fn_equipos_reingreso ya respetaba la fecha de compra';
    return;
  end if;
  v_nuevo := regexp_replace(v_def, 'fecha_ingreso = now\(\)', 'fecha_ingreso = coalesce(new.fecha_ingreso, now())');
  if v_nuevo = v_def then
    raise notice 'fn_equipos_reingreso es distinta a la esperada: no se cambió (los reingresos quedan con la fecha de hoy)';
    return;
  end if;
  execute v_nuevo;
end $$;

-- 5) Crear personas ------------------------------------------------------------------------------
create or replace function public.usuario_crear(
  _nombre text, _usuario text, _rol public.app_rol, _tienda uuid, _pin text, _auth uuid
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_usuario text := lower(trim(coalesce(_usuario, '')));
begin
  if length(trim(coalesce(_nombre, ''))) < 2 then raise exception 'Escribe el nombre de la persona'; end if;
  if v_usuario !~ '^[a-z0-9._]{3,30}$' then
    raise exception 'El usuario debe tener entre 3 y 30 letras o números, sin espacios ni tildes';
  end if;
  if exists (select 1 from public.usuarios where lower(usuario) = v_usuario) then
    raise exception 'Ya existe el usuario %', v_usuario;
  end if;
  if coalesce(_pin, '') !~ '^[0-9]{6}$' then raise exception 'El PIN debe tener 6 dígitos'; end if;
  if _rol in ('vendedor', 'jefe_tienda') and _tienda is null then
    raise exception 'Elige la tienda de la persona';
  end if;

  insert into public.usuarios
    (nombre, usuario, email_interno, rol, tienda_id, pin_hash, auth_user_id, debe_cambiar_pin)
  values
    (trim(_nombre), v_usuario, v_usuario || '@riffstore.local', _rol, _tienda,
     crypt(_pin, gen_salt('bf')), _auth, true)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.usuario_crear(text, text, public.app_rol, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.usuario_crear(text, text, public.app_rol, uuid, text, uuid)
  to service_role;

-- Resultado para el editor: tiendas
select nombre, slug, color_acento, es_bodega from public.tiendas order by es_bodega, nombre;
