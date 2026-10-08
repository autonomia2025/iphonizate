import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCLP } from "@/lib/stores";

export type VentaAEliminar = { id: string; total: number; fecha: string; resumen: string };

const MOTIVOS = [
  "Equipo equivocado (se pistoleó otro IMEI)",
  "Tienda equivocada",
  "Precio o total equivocado",
  "Venta duplicada",
  "Devolución: el cliente devolvió el equipo",
  "Otro",
] as const;

const fechaHora = (f: string) =>
  new Date(f).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Eliminar una venta pide el motivo: queda en auditoría junto con los equipos que tenía. */
export function EliminarVentaModal({
  venta,
  onCerrar,
  onEliminada,
}: {
  venta: VentaAEliminar | null;
  onCerrar: () => void;
  onEliminada: () => void;
}) {
  const [motivo, setMotivo] = useState<(typeof MOTIVOS)[number] | "">("");
  const [detalle, setDetalle] = useState("");
  const [eliminando, setEliminando] = useState(false);

  const faltaDetalle = motivo === "Otro" && detalle.trim().length < 5;
  const listo = !!motivo && !faltaDetalle;

  const cerrar = () => {
    if (eliminando) return;
    setMotivo("");
    setDetalle("");
    onCerrar();
  };

  const eliminar = async () => {
    if (!venta || !listo) return;
    const texto =
      motivo === "Otro" ? detalle.trim() : detalle.trim() ? `${motivo}: ${detalle.trim()}` : motivo;
    setEliminando(true);
    const { error } = await supabase.rpc("eliminar_venta", { _venta: venta.id, _motivo: texto });
    setEliminando(false);
    if (error) {
      toast.error("No se pudo eliminar la venta", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    toast.success("Venta eliminada", { description: `Motivo: ${texto}` });
    setMotivo("");
    setDetalle("");
    onEliminada();
  };

  return (
    <Dialog open={!!venta} onOpenChange={(v) => !v && cerrar()}>
      <DialogContent className="modal-rapido glass border-white/10 bg-white/5 backdrop-blur-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Eliminar venta</DialogTitle>
        </DialogHeader>
        {venta && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm">
              <p className="num font-medium">
                {formatCLP(venta.total)} · {fechaHora(venta.fecha)}
              </p>
              <p className="mt-0.5 text-muted-foreground">{venta.resumen}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Es definitivo: se borran sus pagos y sus equipos vuelven a estar disponibles. Si solo
              el método de pago está mal, usa <span className="text-foreground">Corregir</span> en
              vez de eliminar.
            </p>

            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                ¿Por qué se elimina? <span className="text-amber-300">obligatorio</span>
              </p>
              <div className="grid gap-1.5" role="radiogroup" aria-label="Motivo">
                {MOTIVOS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={motivo === m}
                    onClick={() => setMotivo(m)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-200 ${
                      motivo === m
                        ? "border-[var(--accent-store)]/60 bg-[var(--accent-store-soft)] text-foreground"
                        : "border-white/10 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <textarea
                value={detalle}
                onChange={(e) => setDetalle(e.target.value.slice(0, 200))}
                rows={2}
                placeholder={
                  motivo === "Otro" ? "Explica el motivo (obligatorio)" : "Detalle (opcional)"
                }
                aria-label="Detalle del motivo"
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-[var(--accent-store)]/60"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={cerrar} disabled={eliminando}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => void eliminar()}
                disabled={!listo || eliminando}
              >
                {eliminando ? "Eliminando…" : "Eliminar venta"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
