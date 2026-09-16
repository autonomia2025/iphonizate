ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS confirmado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmado_por uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS confirmado_at timestamptz;

CREATE OR REPLACE FUNCTION public.confirmar_pago(_pago uuid, _confirmado boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rol app_rol;
  _uid uuid;
  _venta uuid;
  _tienda uuid;
BEGIN
  _rol := public.mi_rol();
  IF _rol IS NULL OR _rol NOT IN ('direccion', 'administracion') THEN
    RAISE EXCEPTION 'Solo dirección y administración pueden confirmar pagos';
  END IF;
  _uid := public.mi_usuario_id();

  UPDATE public.pagos p
     SET confirmado = _confirmado,
         confirmado_por = CASE WHEN _confirmado THEN _uid ELSE NULL END,
         confirmado_at = CASE WHEN _confirmado THEN now() ELSE NULL END
   WHERE p.id = _pago
   RETURNING p.venta_id INTO _venta;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pago no existe';
  END IF;

  SELECT v.tienda_id INTO _tienda FROM public.ventas v WHERE v.id = _venta;

  INSERT INTO public.auditoria (accion, detalle, usuario_id, rol, tienda_id)
  VALUES (
    CASE WHEN _confirmado THEN 'pago_confirmado' ELSE 'pago_desconfirmado' END,
    jsonb_build_object('pago_id', _pago, 'venta_id', _venta),
    _uid, _rol::text, _tienda
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_pago(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.confirmar_pago(uuid, boolean) TO authenticated;