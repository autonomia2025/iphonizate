alter table public.auditoria disable trigger trg_auditoria_no_delete;

delete from public.auditoria
 where detalle::text like '%QA_PERMISOS%';

alter table public.auditoria enable trigger trg_auditoria_no_delete;

delete from public.ventas where revision = 'QA_PERMISOS';
delete from public.equipos where notas = 'QA_PERMISOS';