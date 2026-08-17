create or replace function public.fn_bloquear_escalada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- sin sesión de usuario (service role / mantenimiento) no aplica el bloqueo
  if auth.uid() is null then
    return new;
  end if;
  if (new.rol is distinct from old.rol
      or new.tienda_id is distinct from old.tienda_id
      or new.auth_user_id is distinct from old.auth_user_id)
     and public.mi_rol() is distinct from 'direccion' then
    raise exception 'Solo dirección puede modificar rol, tienda o credenciales';
  end if;
  if new.pin_hash is distinct from old.pin_hash
     and public.mi_rol() is distinct from 'direccion'
     and new.id is distinct from public.mi_usuario_id() then
    raise exception 'Solo puedes cambiar tu propio PIN';
  end if;
  return new;
end $$;