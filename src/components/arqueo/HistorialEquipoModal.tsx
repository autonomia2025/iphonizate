import { useQuery } from "@tanstack/react-query";
import { Eye, Hand } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { textoEquipo } from "@/lib/arqueo";
import { cn } from "@/lib/utils";

export type EquipoMinimo = {
  id: string;
  imei: string;
  modelo?: string | null;
  gb?: number | null;
  color?: string | null;
};

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const PUNTO: Record<string, string> = {
  ingreso: "bg-sky-400",
  movimiento: "bg-[var(--accent-store)]",
  estado: "bg-white/40",
  venta: "bg-emerald-400",
  reserva: "bg-sky-300",
  garantia: "bg-red-400",
  taller: "bg-amber-400",
  arqueo: "bg-violet-400",
  bitacora: "bg-white/25",
};

/** Línea de tiempo completa del equipo, de lo más reciente a lo más antiguo. */
export function HistorialEquipoModal({
  equipo,
  onCerrar,
}: {
  equipo: EquipoMinimo;
  onCerrar: () => void;
}) {
  const historia = useQuery({
    queryKey: ["equipo-historia", equipo.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("equipo_historia", { _equipo: equipo.id });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filas = historia.data ?? [];
  const visto = filas.find((f) => f.fisico);
  const tocado = filas.find((f) => f.usuario);

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="modal-rapido glass max-h-[90vh] overflow-y-auto border-white/10 bg-white/5 backdrop-blur-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Historial del equipo</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-sm text-muted-foreground">
          {textoEquipo(equipo)} · <span className="num">{equipo.imei}</span>
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--accent-store)]/30 bg-[var(--accent-store-soft)] p-3">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <Eye className="size-3.5" /> Última vez visto
            </p>
            {visto ? (
              <>
                <p className="mt-1 text-sm font-medium">{visto.titulo}</p>
                <p className="num text-xs text-muted-foreground">
                  {fechaHora(visto.fecha)}
                  {visto.usuario ? ` · ${visto.usuario}` : ""}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Sin registros</p>
            )}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <Hand className="size-3.5" /> Último en tocarlo
            </p>
            {tocado ? (
              <>
                <p className="mt-1 text-sm font-medium">{tocado.usuario}</p>
                <p className="num text-xs text-muted-foreground">
                  {tocado.titulo} · {fechaHora(tocado.fecha)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Sin registros</p>
            )}
          </div>
        </div>

        {historia.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando historial…</p>
        ) : historia.isError ? (
          <p className="py-6 text-center text-sm text-red-300">No se pudo cargar el historial.</p>
        ) : (
          <ol className="relative mt-1 space-y-3 border-l border-white/10 pl-5">
            {filas.map((f, i) => (
              <li key={`${f.fecha}-${i}`} className="relative">
                <span
                  aria-hidden
                  className={cn(
                    "absolute -left-[1.62rem] top-1.5 size-2.5 rounded-full ring-4 ring-[#16131F]",
                    PUNTO[f.tipo] ?? "bg-white/30",
                  )}
                />
                <p className="text-sm">{f.titulo}</p>
                {f.detalle && <p className="text-xs text-muted-foreground">{f.detalle}</p>}
                <p className="num text-[11px] text-muted-foreground">
                  {fechaHora(f.fecha)}
                  {f.usuario ? ` · ${f.usuario}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
