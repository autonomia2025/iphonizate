import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { fechaLarga } from "@/lib/inventario";
import { equipoTexto } from "@/lib/garantias";
import { cn } from "@/lib/utils";

export type EquipoVendido = {
  equipo_id: string | null;
  imei: string;
  modelo: string | null;
  gb: number | null;
  color: string | null;
  estado: string | null;
  venta_id: string | null;
  fecha_venta: string | null;
  tienda_venta: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  dias_desde_venta: number | null;
};

const campo =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

export function BuscarVendidos({
  onSeleccionar,
  imeiActivo,
}: {
  onSeleccionar: (fila: EquipoVendido) => void;
  imeiActivo?: string;
}) {
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto.trim()), 250);
    return () => clearTimeout(t);
  }, [texto]);

  const equipos = useQuery({
    queryKey: ["garantias-vendidos", busqueda],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("garantias_equipos_vendidos", {
        ...(busqueda ? { _q: busqueda } : {}),
        _limite: 40,
      });
      if (error) throw error;
      return ((data ?? []) as EquipoVendido[]).filter((f) => !!f.imei);
    },
  });

  const filas = equipos.data ?? [];

  return (
    <div className="mt-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="O busca el equipo vendido por IMEI, modelo, cliente o teléfono"
          className={campo}
        />
      </div>

      <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/[0.06] bg-[#16131F]">
        {equipos.isLoading ? (
          <p className="p-4 text-[12px] text-muted-foreground">Buscando…</p>
        ) : filas.length === 0 ? (
          <p className="p-4 text-[12px] text-muted-foreground">
            {busqueda ? "Sin equipos vendidos que coincidan." : "Aún no hay equipos vendidos."}
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {filas.map((f) => (
              <li key={f.imei}>
                <button
                  type="button"
                  onClick={() => onSeleccionar(f)}
                  className={cn(
                    "flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-left transition-colors duration-200 hover:bg-white/[0.04]",
                    imeiActivo === f.imei && "bg-white/[0.06]",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {equipoTexto(f.modelo, f.gb)}
                      {f.color ? ` · ${f.color}` : ""}
                    </span>
                    <span className="num block text-[11px] text-muted-foreground">{f.imei}</span>
                  </span>
                  <span className="text-right text-[11px] text-muted-foreground">
                    <span className="block text-slate-300">
                      {f.cliente_nombre ?? "Sin cliente"}
                      {f.cliente_telefono ? ` · ${f.cliente_telefono}` : ""}
                    </span>
                    <span className="num block">
                      {fechaLarga(f.fecha_venta)} · {f.tienda_venta ?? "—"} · hace{" "}
                      {f.dias_desde_venta ?? 0} días
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
