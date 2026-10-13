import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type EnvioPendiente = {
  id: string;
  fecha: string;
  total: number;
  tienda_id: string;
  envio_detalle: string | null;
  clientes: { nombre: string; telefono: string | null } | null;
  venta_items: {
    id: string;
    equipos: { modelo: string; gb: number | null; color: string | null } | null;
    accesorios: { nombre: string } | null;
  }[];
};

/** Ventas con envío que nadie marcó como enviadas. Con `tiendaId` null trae las de toda la cadena. */
export function useEnviosPendientes(tiendaId: string | null, activo = true) {
  return useQuery({
    queryKey: ["envios-pendientes", tiendaId ?? "cadena"],
    enabled: activo,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      let q = supabase
        .from("ventas")
        .select(
          "id, fecha, total, tienda_id, envio_detalle, clientes(nombre, telefono), venta_items(id, equipos(modelo, gb, color), accesorios(nombre))",
        )
        .eq("modalidad", "envio")
        .eq("envio_estado", "pendiente")
        .eq("anulada", false)
        .order("fecha", { ascending: true })
        .limit(200);
      if (tiendaId) q = q.eq("tienda_id", tiendaId);
      const { data, error } = await q;
      /* Si la base todavía no tiene la columna, no se muestran alertas en vez de romper la pantalla */
      if (error) return [] as EnvioPendiente[];
      return (data ?? []) as unknown as EnvioPendiente[];
    },
  });
}

export async function marcarEnvio(ventaId: string, enviado = true) {
  const { error } = await supabase.rpc("marcar_envio", { _venta: ventaId, _enviado: enviado });
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
}

/** "hoy", "hace 1 día", "hace 3 días" */
export const haceDias = (fecha: string) => {
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000);
  return dias <= 0 ? "hoy" : dias === 1 ? "hace 1 día" : `hace ${dias} días`;
};

export const productosDeEnvio = (v: EnvioPendiente) =>
  v.venta_items
    .map((i) =>
      i.equipos
        ? `${i.equipos.modelo}${i.equipos.gb ? ` ${i.equipos.gb} GB` : ""}${i.equipos.color ? ` ${i.equipos.color}` : ""}`
        : (i.accesorios?.nombre ?? ""),
    )
    .filter(Boolean)
    .join(", ") || "Sin productos";
