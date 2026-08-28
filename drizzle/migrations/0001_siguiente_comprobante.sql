CREATE OR REPLACE FUNCTION public.siguiente_comprobante()
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'C-' || to_char(nextval('public.comprobante_seq'), 'FM000000')
$$;

REVOKE ALL ON FUNCTION public.siguiente_comprobante() FROM public;
GRANT EXECUTE ON FUNCTION public.siguiente_comprobante() TO service_role;