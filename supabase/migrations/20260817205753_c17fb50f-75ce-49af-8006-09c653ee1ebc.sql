-- Quitar lectura de columnas sensibles a nivel de columna.
-- Los roles autorizados leen costo/ganancia a traves de v_equipos_full y v_ventas_full (SECURITY DEFINER).
REVOKE SELECT ON public.equipos FROM authenticated;
GRANT SELECT (
  id, imei, serie, modelo, gb, color, bateria, email_vinculado, categoria,
  proveedor, lote, estado, ubicacion_id, fecha_ingreso, notas, updated_at
) ON public.equipos TO authenticated;

REVOKE SELECT ON public.ventas FROM authenticated;
GRANT SELECT (
  id, tienda_id, cliente_id, vendedor_id, total, con_boleta, recargo_boleta,
  revision, anulada, fecha_anulacion, reserva_id, fecha
) ON public.ventas TO authenticated;
