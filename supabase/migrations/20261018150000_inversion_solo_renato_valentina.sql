/* La inversión en stock (inventario + lista negra) solo la ven Renato y Valentina.
   Queda como permiso por persona, "inversion.ver", para poder dárselo a alguien más mañana
   sin tocar código. Aplicar a mano desde el editor SQL (Lovable Cloud), ANTES de subir el código. */

do $$
begin
  if (select count(*) from public.usuarios
      where lower(usuario) in ('renato', 'vgalaz') and activo) <> 2 then
    raise exception 'No encontré a Renato y Valentina (renato, vgalaz) activos. No se aplicó nada.';
  end if;
end $$;

insert into public.permisos_usuario (usuario_id, permiso)
select id, 'inversion.ver' from public.usuarios
where lower(usuario) in ('renato', 'vgalaz')
on conflict (usuario_id, permiso) do nothing;

/* Igual que antes, pero sin el permiso no devuelve nada */
create or replace function public.inversion_stock()
returns table (inventario bigint, equipos bigint, lista_negra bigint, lista_negra_equipos bigint)
language sql
stable
security definer
set search_path to public
as $$
  select
    (select coalesce(sum(e.costo), 0)::bigint from public.equipos e
      where e.estado in ('POR_REVISAR', 'EN_TECNICO', 'DISPONIBLE', 'RESERVADO')
        and public.ve_costos(e.ubicacion_id)),
    (select count(*) from public.equipos e
      where e.estado in ('POR_REVISAR', 'EN_TECNICO', 'DISPONIBLE', 'RESERVADO')
        and public.ve_costos(e.ubicacion_id)),
    (select coalesce(sum(l.costo), 0)::bigint from public.lista_negra l
      where l.estado = 'en_stock' and public.ve_costos(l.ubicacion_id)),
    (select count(*) from public.lista_negra l
      where l.estado = 'en_stock' and public.ve_costos(l.ubicacion_id))
  where public.mi_rol() is not null
    and public.tiene_permiso('inversion.ver')
$$;

-- Resultado para el editor: quiénes ven la inversión
select u.nombre, u.usuario
from public.permisos_usuario p
join public.usuarios u on u.id = p.usuario_id
where p.permiso = 'inversion.ver'
order by u.nombre;
