/* SIM física o eSIM: se elige al ingresar el equipo y sale impresa en la etiqueta junto a la
   batería. Aplicar a mano desde el editor SQL (Lovable Cloud), ANTES de subir el código. */

-- 1) Columna nueva ---------------------------------------------------------------------------
alter table public.equipos add column if not exists sim text;
alter table public.equipos drop constraint if exists equipos_sim_check;
alter table public.equipos add constraint equipos_sim_check
  check (sim is null or sim in ('sim', 'esim'));

/* La lectura de equipos se concede columna por columna: sin esto la app no la puede leer. */
grant select (sim) on public.equipos to authenticated;

-- 2) Un reingreso (IMEI que ya se vendió y vuelve) también actualiza la SIM -----------------
/* Se agrega solo esa línea a la regla que está en la base. Si no tiene la forma esperada,
   no se toca: los reingresos simplemente conservan la SIM anterior. */
do $$
declare
  v_def text;
  v_nuevo text;
begin
  v_def := pg_get_functiondef('public.fn_equipos_reingreso()'::regprocedure);
  if v_def like '%sim = coalesce(new.sim, sim)%' then
    raise notice 'fn_equipos_reingreso ya actualizaba la SIM';
    return;
  end if;
  v_nuevo := regexp_replace(
    v_def,
    'bateria = coalesce\(new\.bateria, bateria\),',
    'bateria = coalesce(new.bateria, bateria), sim = coalesce(new.sim, sim),'
  );
  if v_nuevo = v_def then
    raise notice 'fn_equipos_reingreso es distinta a la esperada: no se cambió (no es grave)';
    return;
  end if;
  execute v_nuevo;
end $$;

-- 3) v_stock: las mismas columnas de siempre + sim al final -------------------------------
do $$
declare
  v_cols text;
begin
  select string_agg(column_name::text, ',' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'v_stock';

  if v_cols like '%,sim' then
    raise notice 'v_stock ya tenía la columna sim';
    return;
  end if;
  if v_cols is distinct from 'id,imei,modelo,gb,color,bateria,categoria,estado,ubicacion_id,tienda,fecha_ingreso,serie,imei2,icloud_activo,lista_negra,bloqueo_operador,reemplazado_apple,garantia_estado,pais_compra,fecha_compra_estimada,bloqueo_usa,verificado_at' then
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
             e.sim
        from public.equipos e
        left join public.tiendas t on t.id = e.ubicacion_id
       where public.mi_rol() is not null
  $v$;
end $$;

-- Resultado para el editor
select count(*) filter (where sim is null) as equipos_sin_sim_indicada,
       count(*) as equipos_totales
from public.equipos;
