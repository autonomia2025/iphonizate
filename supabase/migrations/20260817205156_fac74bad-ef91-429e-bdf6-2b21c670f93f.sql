revoke execute on function public.mi_usuario_id() from public, anon;
revoke execute on function public.mi_rol() from public, anon;
revoke execute on function public.mi_tienda() from public, anon;
revoke execute on function public.ve_todas_tiendas() from public, anon;
revoke execute on function public.puede_ver_tienda(uuid) from public, anon;
revoke execute on function public.ve_costos(uuid) from public, anon;
revoke execute on function public.ve_ganancias(uuid) from public, anon;
revoke execute on function public.fn_auditar() from public, anon;
revoke execute on function public.fn_sin_sensibles(jsonb) from public, anon;
revoke execute on function public.fn_bloquear_escalada() from public, anon;
revoke execute on function public.fn_equipos_reingreso() from public, anon;
revoke execute on function public.fn_equipos_costo_protegido() from public, anon;
revoke execute on function public.fn_ventas_campos_protegidos() from public, anon;
revoke execute on function public.cambiar_pin(text) from public, anon;

grant execute on function public.mi_usuario_id() to authenticated;
grant execute on function public.mi_rol() to authenticated;
grant execute on function public.mi_tienda() to authenticated;
grant execute on function public.ve_todas_tiendas() to authenticated;
grant execute on function public.puede_ver_tienda(uuid) to authenticated;
grant execute on function public.ve_costos(uuid) to authenticated;
grant execute on function public.ve_ganancias(uuid) to authenticated;
grant execute on function public.cambiar_pin(text) to authenticated;

create or replace function public.fn_auditoria_inmutable()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'auditoria es de solo inserción'; end $$;