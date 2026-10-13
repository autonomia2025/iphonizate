import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { aNumero } from "@/lib/pos";
import { formatCLP } from "@/lib/stores";

export type ItemSinCosto = { id: string; modelo: string; imei: string | null; precio: number };

/** Carga el costo de un equipo vendido que quedó en 0: la ganancia de la venta se ajusta sola. */
export function CorregirCostoModal({
  item,
  onCerrar,
  onGuardado,
}: {
  item: ItemSinCosto | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [costo, setCosto] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => setCosto(""), [item?.id]);

  const valor = aNumero(costo);

  const guardar = async () => {
    if (!item || valor <= 0) return;
    setGuardando(true);
    const { error } = await supabase.rpc("corregir_costo_venta_item", {
      _item: item.id,
      _costo: valor,
    });
    setGuardando(false);
    if (error) {
      toast.error("No se pudo guardar el costo", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    toast.success("Costo guardado", {
      description: `Ganancia de este equipo: ${formatCLP(item.precio - valor)}`,
    });
    onGuardado();
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && !guardando && onCerrar()}>
      <DialogContent className="modal-rapido glass border-white/10 bg-white/5 backdrop-blur-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Cargar costo del equipo</DialogTitle>
        </DialogHeader>
        {item && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm">
              <p className="font-medium">{item.modelo}</p>
              {item.imei && <p className="num text-xs text-muted-foreground">{item.imei}</p>}
              <p className="num mt-1 text-xs text-muted-foreground">
                Vendido en {formatCLP(item.precio)}
              </p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                Precio de compra
              </span>
              <input
                autoFocus
                inputMode="numeric"
                value={costo ? formatCLP(valor) : ""}
                onChange={(e) => setCosto(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && void guardar()}
                placeholder="$0"
                className="num h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-[var(--accent-store)]/60"
              />
            </label>
            {valor > 0 && (
              <p className="text-xs text-muted-foreground">
                Ganancia de este equipo:{" "}
                <span
                  className={`num ${item.precio - valor >= 0 ? "text-[var(--positive)]" : "text-red-300"}`}
                >
                  {formatCLP(item.precio - valor)}
                </span>
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onCerrar} disabled={guardando}>
                Cancelar
              </Button>
              <Button onClick={() => void guardar()} disabled={valor <= 0 || guardando}>
                {guardando ? "Guardando…" : "Guardar costo"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
