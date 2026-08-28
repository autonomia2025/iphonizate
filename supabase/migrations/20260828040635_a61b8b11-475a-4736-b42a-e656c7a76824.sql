CREATE POLICY "reportes_equipos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'reportes-equipos' AND public.mi_usuario_id() IS NOT NULL);

CREATE POLICY "reportes_equipos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reportes-equipos' AND public.mi_usuario_id() IS NOT NULL);

CREATE POLICY "reportes_equipos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'reportes-equipos' AND public.mi_rol() = 'direccion');