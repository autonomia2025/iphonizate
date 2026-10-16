import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { coloresParaModelo, type ColorModelo } from "@/lib/colores";

/** Modelos Apple para elegir y los colores del modelo elegido (los de la tienda primero). */
export function useCatalogoModelos(activo: boolean, modelo: string) {
  const modelosApple = useQuery({
    queryKey: ["modelos_apple"],
    enabled: activo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("modelos_apple")
        .select("modelo_comercial")
        .order("modelo_comercial");
      if (error) throw error;
      return [...new Set((data ?? []).map((fila) => fila.modelo_comercial))];
    },
  });

  const catalogo = useQuery({
    queryKey: ["catalogo-colores-modelo"],
    enabled: activo,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const [modelos, colores, propios] = await Promise.all([
        supabase.from("modelos_apple").select("modelo_comercial, product_type"),
        supabase.from("colores_apple").select("product_type, color_comercial"),
        supabase.from("colores_modelo").select("modelo, color, orden"),
      ]);
      if (modelos.error) throw modelos.error;
      if (colores.error) throw colores.error;
      return {
        modelos: modelos.data ?? [],
        colores: colores.data ?? [],
        /* Si la tabla de la tienda todavía no existe, se usa solo el catálogo Apple */
        propios: (propios.error ? [] : (propios.data ?? [])) as ColorModelo[],
      };
    },
  });

  const colores = useMemo(
    () => coloresParaModelo(modelo, catalogo.data?.propios ?? [], catalogo.data),
    [catalogo.data, modelo],
  );

  return { modelos: modelosApple.data ?? [], colores };
}
