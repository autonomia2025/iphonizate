import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { traerTodo } from "@/lib/traerTodo";

const COLUMNAS = "id, costo, email_vinculado, proveedor, lote, notas";
const CLAVE = ["v_equipos_full"];
const TANDA_IDS = 100;

export type ExtraEquipo = {
  id: string | null;
  costo: number | null;
  email_vinculado: string | null;
  proveedor: string | null;
  lote: string | null;
  notas: string | null;
};

/**
 * Costo y datos internos de los equipos. Se descargan completos una sola vez; después,
 * cuando un equipo cambia, se pide solo ese equipo en vez de toda la tabla (antes cada
 * cambio de cualquier tienda volvía a bajar los 1.300 equipos).
 */
export function useExtrasEquipos(activo: boolean) {
  const queryClient = useQueryClient();

  const todos = useQuery({
    queryKey: CLAVE,
    enabled: activo,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      traerTodo<ExtraEquipo>((ini, fin) =>
        supabase.from("v_equipos_full").select(COLUMNAS).order("id").range(ini, fin),
      ),
  });

  /** Vuelve a leer solo estos equipos y los reemplaza en la lista guardada. */
  const actualizar = useCallback(
    async (ids: string[]) => {
      if (!activo || ids.length === 0) return;
      const nuevos: ExtraEquipo[] = [];
      for (let i = 0; i < ids.length; i += TANDA_IDS) {
        const { data, error } = await supabase
          .from("v_equipos_full")
          .select(COLUMNAS)
          .in("id", ids.slice(i, i + TANDA_IDS));
        if (error) {
          void todos.refetch();
          return;
        }
        nuevos.push(...(data ?? []));
      }
      queryClient.setQueryData<ExtraEquipo[]>(CLAVE, (prev) => {
        const mapa = new Map((prev ?? []).map((f) => [f.id, f]));
        ids.forEach((id) => mapa.delete(id));
        nuevos.forEach((f) => f.id && mapa.set(f.id, f));
        return [...mapa.values()];
      });
    },
    [activo, queryClient, todos],
  );

  const mapa = useMemo(() => {
    const m = new Map<string, ExtraEquipo>();
    (todos.data ?? []).forEach((f) => f.id && m.set(f.id, f));
    return m;
  }, [todos.data]);

  return { mapa, actualizar, recargar: () => void todos.refetch() };
}
