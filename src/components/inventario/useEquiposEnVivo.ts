import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Suscripción en tiempo real a la tabla equipos.
 * Devuelve si el canal está conectado y los ids con destello reciente.
 */
export function useEquiposEnVivo(onCambio: () => void) {
  const [enVivo, setEnVivo] = useState(false);
  const [destellos, setDestellos] = useState<Record<string, number>>({});
  const cb = useRef(onCambio);
  cb.current = onCambio;

  useEffect(() => {
    const canal = supabase
      .channel("equipos-en-vivo")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "equipos" },
        (payload) => {
          const nuevo = payload.new as { id?: string } | null;
          const viejo = payload.old as { id?: string } | null;
          const id = nuevo?.id ?? viejo?.id;
          if (id) setDestellos((prev) => ({ ...prev, [id]: Date.now() }));
          cb.current();
        },
      )
      .subscribe((estado) => setEnVivo(estado === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(canal);
    };
  }, []);

  useEffect(() => {
    if (Object.keys(destellos).length === 0) return;
    const t = setTimeout(() => setDestellos({}), 1100);
    return () => clearTimeout(t);
  }, [destellos]);

  return { enVivo, destellos };
}

