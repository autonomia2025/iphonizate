/* Permiso por persona "ganancias.ocultar": aunque su rol vea ganancias (dirección o jefe de
   tienda), esa persona no ve los montos de ganancia. Aplicada a mano desde el editor SQL. */
do $$
declare v_def text;
begin
  v_def := regexp_replace(pg_get_functiondef('public.ve_ganancias(uuid)'::regprocedure), '\s+', ' ', 'g');
  if v_def like '%ganancias.ocultar%' then
    raise notice 've_ganancias ya respeta ganancias.ocultar';
    return;
  end if;
  if v_def not like '%when ''jefe_tienda'' then (_tienda is null or _tienda = public.mi_tienda())%' then
    raise exception 've_ganancias es distinta a la esperada: pégale a Claude el resultado de select pg_get_functiondef(''public.ve_ganancias(uuid)''::regprocedure);';
  end if;
  execute $f$
    create or replace function public.ve_ganancias(_tienda uuid default null)
    returns boolean language sql stable security definer set search_path = public as $b$
      select (case public.mi_rol()
                when 'direccion' then true
                when 'jefe_tienda' then (_tienda is null or _tienda = public.mi_tienda())
                else false end)
             and not public.tiene_permiso('ganancias.ocultar')
    $b$
  $f$;
end $$;
