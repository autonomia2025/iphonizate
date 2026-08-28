ALTER TABLE public.lector_agentes REPLICA IDENTITY FULL;
ALTER TABLE public.lecturas_equipo REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lector_agentes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lector_agentes;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lecturas_equipo'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lecturas_equipo;
  END IF;
END $$;