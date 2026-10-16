import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type Inversion = {
  inventario: number;
  equipos: number;
  listaNegra: number;
  listaNegraEquipos: number;
  total: number;
};

/** Plata invertida en stock: inventario normal (por revisar, en técnico, disponible, reservado)
 *  más la lista negra en stock. Solo suma las tiendas donde quien mira ve costos. */
export function useInversion(activo: boolean) {
  return useQuery({
    queryKey: ["inversion_stock"],
    enabled: activo,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Inversion | null> => {
      const { data, error } = await supabase.rpc("inversion_stock");
      /* Si la base todavía no tiene la función, no se muestra en vez de romper la pantalla */
      if (error) return null;
      const fila = (Array.isArray(data) ? data[0] : data) as
        | { inventario: number; equipos: number; lista_negra: number; lista_negra_equipos: number }
        | undefined;
      if (!fila) return null;
      const inventario = Number(fila.inventario ?? 0);
      const listaNegra = Number(fila.lista_negra ?? 0);
      return {
        inventario,
        equipos: Number(fila.equipos ?? 0),
        listaNegra,
        listaNegraEquipos: Number(fila.lista_negra_equipos ?? 0),
        total: inventario + listaNegra,
      };
    },
  });
}
