-- 1. Clientes: quien no tiene tienda fija (direccion/administracion) opera sobre cualquier tienda
DROP POLICY IF EXISTS "clientes lectura misma tienda" ON public.clientes;
DROP POLICY IF EXISTS "clientes insert misma tienda" ON public.clientes;
DROP POLICY IF EXISTS "clientes update misma tienda" ON public.clientes;

CREATE OR REPLACE FUNCTION public.puede_cartera(_tienda uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mi_rol() IS NOT NULL
     AND _tienda IS NOT NULL
     AND (
       _tienda = public.mi_tienda()
       OR (public.mi_tienda() IS NULL AND public.mi_rol() IN ('direccion','administracion'))
     )
$$;

CREATE POLICY "clientes lectura cartera" ON public.clientes
  FOR SELECT TO authenticated
  USING (public.puede_cartera(tienda_id));

CREATE POLICY "clientes insert cartera" ON public.clientes
  FOR INSERT TO authenticated
  WITH CHECK (public.puede_cartera(tienda_id));

CREATE POLICY "clientes update cartera" ON public.clientes
  FOR UPDATE TO authenticated
  USING (public.puede_cartera(tienda_id))
  WITH CHECK (public.puede_cartera(tienda_id));

-- 2. Comprobante por venta
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS comprobante_numero text,
  ADD COLUMN IF NOT EXISTS comprobante_ruta text,
  ADD COLUMN IF NOT EXISTS comprobante_email text,
  ADD COLUMN IF NOT EXISTS comprobante_email_estado text,
  ADD COLUMN IF NOT EXISTS comprobante_email_at timestamptz;

CREATE SEQUENCE IF NOT EXISTS public.comprobante_seq START 1000;
GRANT USAGE ON SEQUENCE public.comprobante_seq TO service_role;