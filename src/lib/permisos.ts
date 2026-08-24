import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";

/** Permisos por persona (no por rol). Se administran en la tabla `permisos_usuario`,
 *  así que mañana se pueden cambiar sin tocar código. */
export const PERMISOS = {
  metasEditar: "metas.editar",
  permisosAdministrar: "permisos.administrar",
} as const;

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS];

export function usePermisos() {
  const { usuario } = useAuth();
  const consulta = useQuery({
    queryKey: ["permisos-usuario", usuario?.id],
    enabled: !!usuario?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permisos_usuario")
        .select("permiso")
        .eq("usuario_id", usuario!.id);
      if (error) throw error;
      return (data ?? []).map((p) => p.permiso);
    },
  });

  const lista = consulta.data ?? [];
  return {
    cargando: consulta.isLoading,
    lista,
    tiene: (permiso: Permiso) => lista.includes(permiso),
  };
}

export function usePermiso(permiso: Permiso) {
  const { tiene, cargando } = usePermisos();
  return { permitido: tiene(permiso), cargando };
}
