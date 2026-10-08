import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Ids de equipos con una venta vigente que hoy no figuran como vendidos ni entregados
 * (volvieron por garantía, devolución o porque se reingresó el IMEI).
 */
export function useConVentaActiva() {
  return useQuery({
    queryKey: ["equipos_con_venta_activa"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("equipos_con_venta_activa");
      if (error) return new Set<string>();
      return new Set((data ?? []).map((f) => f.equipo_id));
    },
  });
}
