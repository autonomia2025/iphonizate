/* Corrección de ventas por Renato, Liz y Valentina + modelos nuevos.
   Aplicada a mano desde el editor SQL (Lovable Cloud). */

-- Si no aparecen los 3 usuarios, no se aplica nada.
do $$
begin
  if (select count(*) from public.usuarios
      where lower(usuario) in ('renato', 'liz', 'vgalaz') and activo) <> 3 then
    raise exception 'No encontré a Renato, Liz y Valentina (renato, liz, vgalaz). No se aplicó nada.';
  end if;
end $$;

/* Quién puede eliminar ventas y corregir pagos. Es aparte de puede_borrar_equipos:
   borrar iPhones sigue siendo solo de Renato y Liz. */
create or replace function public.puede_corregir_ventas()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.activo
      and lower(u.usuario) in ('renato', 'liz', 'vgalaz')
  ) $$;
revoke all on function public.puede_corregir_ventas() from public, anon;
grant execute on function public.puede_corregir_ventas() to authenticated;

/* Cambia el método de un pago de venta (el monto no se toca). No se puede si la
   caja de ese día ya se cerró. La venta vuelve a pendiente en Revisión de pagos. */
create or replace function public.corregir_pago(
  _pago uuid,
  _metodo public.metodo_pago,
  _nombre_pagador text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_p public.pagos;
  v_v public.ventas;
begin
  if not public.puede_corregir_ventas() then
    raise exception 'Solo Renato, Liz y Valentina pueden corregir pagos';
  end if;

  select * into v_p from public.pagos where id = _pago for update;
  if v_p.id is null or v_p.venta_id is null then
    raise exception 'Ese pago no existe o no pertenece a una venta';
  end if;

  select * into v_v from public.ventas where id = v_p.venta_id for update;
  if v_v.anulada then raise exception 'Esa venta está anulada'; end if;

  if _metodo <> 'efectivo' and coalesce(trim(_nombre_pagador), '') = '' then
    raise exception 'Falta el nombre de quien pagó o el equipo recibido';
  end if;

  if exists (
    select 1 from public.cierres_caja c
    where c.tienda_id = v_v.tienda_id
      and (c.fecha at time zone 'America/Santiago')::date in (
        (v_p.fecha at time zone 'America/Santiago')::date,
        (v_v.fecha at time zone 'America/Santiago')::date
      )
  ) then
    raise exception 'La caja de ese día ya está cerrada: no se puede corregir el pago';
  end if;

  update public.pagos
    set metodo = _metodo,
        nombre_pagador = case when _metodo = 'efectivo' then null else trim(_nombre_pagador) end
    where id = _pago;

  update public.ventas set revision = null where id = v_v.id;

  insert into public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  values (
    'pago_corregido',
    jsonb_build_object(
      'venta', v_v.id, 'pago', _pago, 'monto', v_p.monto,
      'metodo_antes', v_p.metodo, 'metodo_despues', _metodo,
      'nombre_antes', v_p.nombre_pagador, 'nombre_despues', trim(_nombre_pagador)
    ),
    public.mi_usuario_id(), public.mi_rol()::text, v_v.tienda_id
  );
end $$;
revoke all on function public.corregir_pago(uuid, public.metodo_pago, text) from public, anon;
grant execute on function public.corregir_pago(uuid, public.metodo_pago, text) to authenticated;

/* Modelos nuevos con código provisorio: aparecen en las listas al tiro. Cuando el
   lector USB lea uno de verdad, se reemplaza el product_type por el código real. */
insert into public.modelos_apple (product_type, modelo_comercial)
select v.codigo, v.nombre
from (values
  ('provisorio-iphone-17e', 'iPhone 17e'),
  ('provisorio-iphone-18-pro', 'iPhone 18 Pro'),
  ('provisorio-iphone-18-pro-max', 'iPhone 18 Pro Max')
) as v(codigo, nombre)
where not exists (select 1 from public.modelos_apple m where m.modelo_comercial = v.nombre);
