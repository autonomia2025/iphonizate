import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export const CLAVE_PROVEEDORES = ["proveedores"];

/** Proveedores activos de la lista oficial, por nombre. */
export function useProveedores(activo = true) {
  return useQuery({
    queryKey: CLAVE_PROVEEDORES,
    enabled: activo,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proveedores")
        .select("nombre")
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return (data ?? []).map((p) => p.nombre);
    },
  });
}

/** Agrega un proveedor; si ya existía escrito distinto, devuelve el de la lista. */
export async function agregarProveedor(nombre: string) {
  const { data, error } = await supabase.rpc("agregar_proveedor", { _nombre: nombre });
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
  return data as unknown as string;
}
