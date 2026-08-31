create table public.costos_arreglo (
  id uuid primary key default gen_random_uuid(),
  modelo text not null,
  tipo public.tipo_servicio not null,
  costo bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuarios(id) on delete set null,
  unique (modelo, tipo)
);

grant select, insert, update on public.costos_arreglo to authenticated;
grant all on public.costos_arreglo to service_role;

alter table public.costos_arreglo enable row level security;

create policy "costos_arreglo lectura" on public.costos_arreglo for select to authenticated
  using (public.mi_rol() is not null);
create policy "costos_arreglo insert" on public.costos_arreglo for insert to authenticated
  with check (public.mi_rol() in ('direccion','jefe_tienda','administracion'));
create policy "costos_arreglo update" on public.costos_arreglo for update to authenticated
  using (public.mi_rol() in ('direccion','jefe_tienda','administracion'));

create trigger trg_aud_costos_arreglo after insert or update on public.costos_arreglo
  for each row execute function public.fn_auditar();

create index idx_costos_arreglo_modelo on public.costos_arreglo (modelo);
