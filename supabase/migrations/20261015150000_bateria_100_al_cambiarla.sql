/* Cuando un servicio de batería queda listo, la batería del equipo pasa a 100% y queda anotado
   en su bitácora. Vale para "Marcar listo", "Marcar todos listos" y cualquier otro camino.
   Aplicada a mano desde el editor SQL (Lovable Cloud). */
create or replace function public.fn_bateria_nueva_al_100()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_antes int;
begin
  select bateria into v_antes from public.equipos where id = new.equipo_id;
  update public.equipos set bateria = 100, updated_at = now() where id = new.equipo_id;
  insert into public.equipos_historial (equipo_id, evento, usuario_id)
  values (new.equipo_id,
          'batería cambiada: queda en 100%' || coalesce(' (antes ' || v_antes || '%)', ''),
          public.mi_usuario_id());
  return new;
end $$;

drop trigger if exists trg_bateria_nueva_al_100 on public.servicios_equipo;
create trigger trg_bateria_nueva_al_100 after update of estado on public.servicios_equipo
  for each row
  when (new.tipo = 'bateria' and new.estado = 'listo' and old.estado is distinct from 'listo')
  execute function public.fn_bateria_nueva_al_100();
