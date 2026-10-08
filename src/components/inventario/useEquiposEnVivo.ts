import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/* Con varias tiendas pistoleando a la vez llegan muchos cambios seguidos:
   se juntan y la lista se recarga una sola vez por tanda. */
const ESPERA_RECARGA_MS = 1500;

/**
 * Suscripción en tiempo real a la tabla equipos.
 * Devuelve si el canal está conectado y los ids con destello reciente.
 * `onCambio` recibe los ids de los equipos que cambiaron en la tanda.
 */
export function useEquiposEnVivo(onCambio: (ids: string[]) => void) {
  const [enVivo, setEnVivo] = useState(false);
  const [destellos, setDestellos] = useState<Record<string, number>>({});
  const cb = useRef(onCambio);
  cb.current = onCambio;

  useEffect(() => {
    let pendiente: ReturnType<typeof setTimeout> | null = null;
    const cambiados = new Set<string>();
    const canal = supabase
      .channel("equipos-en-vivo")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "equipos" },
        (payload) => {
          const nuevo = payload.new as { id?: string } | null;
          const viejo = payload.old as { id?: string } | null;
          const id = nuevo?.id ?? viejo?.id;
          if (id) {
            setDestellos((prev) => ({ ...prev, [id]: Date.now() }));
            cambiados.add(id);
          }
          if (pendiente) return;
          pendiente = setTimeout(() => {
            pendiente = null;
            const ids = [...cambiados];
            cambiados.clear();
            cb.current(ids);
          }, ESPERA_RECARGA_MS);
        },
      )
      .subscribe((estado) => setEnVivo(estado === "SUBSCRIBED"));

    return () => {
      if (pendiente) clearTimeout(pendiente);
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

