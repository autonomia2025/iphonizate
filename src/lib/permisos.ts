import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import type { AppRol } from "@/lib/nav";
import { puedeVerGanancias } from "@/lib/pos";

/** Permisos por persona (no por rol). Se administran en la tabla `permisos_usuario`,
 *  así que mañana se pueden cambiar sin tocar código. */
export const PERMISOS = {
  metasEditar: "metas.editar",
  permisosAdministrar: "permisos.administrar",
  /** Puede ingresar y ver el costo/precio de compra de los equipos */
  equiposCosto: "equipos.costo",
  /** Vendedor que puede trasladar equipos entre tiendas, no solo devolver a bodega */
  movimientosTienda: "movimientos.tienda",
  /** No ve montos de ganancia aunque su rol sí los vea (dirección con todo menos ganancias) */
  gananciasOcultas: "ganancias.ocultar",
  /** Ve la inversión en stock (inventario + lista negra): hoy Renato y Valentina */
  inversionVer: "inversion.ver",
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

/** Ve montos de ganancia: lo decide el rol, salvo que la persona tenga "ganancias.ocultar".
 *  Mientras cargan los permisos no se muestran, para no dejarlas ver ni un segundo. */
export function useVerGanancias(rol?: AppRol | null) {
  const { tiene, cargando } = usePermisos();
  return puedeVerGanancias(rol) && !cargando && !tiene(PERMISOS.gananciasOcultas);
}
