import { useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { METODO_ETIQUETA, aNumero, type ItemCarrito, type PagoFila } from "@/lib/pos";

export type VentaResumen = {
  id: string;
  total: number;
  recargo: number;
  conBoleta: boolean;
  cliente: string | null;
  tienda: string;
  items: ItemCarrito[];
  pagos: PagoFila[];
};

export function VentaExito({
  venta,
  puedeAnular,
  onNuevaVenta,
}: {
  venta: VentaResumen;
  puedeAnular: boolean;
  onNuevaVenta: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [anulada, setAnulada] = useState(false);

  const anular = async () => {
    setAnulando(true);
    try {
      const { error } = await supabase.rpc("anular_venta", { _venta: venta.id });
      if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
      setAnulada(true);
      setConfirmando(false);
      toast.success("Venta anulada: los equipos volvieron a disponible");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo anular la venta");
    } finally {
      setAnulando(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="glass p-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-7 text-emerald-300" />
          <div>
            <h1 className={`font-display text-2xl ${anulada ? "line-through opacity-60" : ""}`}>
              Venta registrada
            </h1>
            <p className="text-sm text-muted-foreground">
              {venta.tienda} · {venta.cliente ?? "Sin cliente asignado"}
              {anulada && <span className="ml-2 text-red-300">Anulada</span>}
            </p>
          </div>
        </div>

        <div className={`mt-5 space-y-2 ${anulada ? "opacity-60" : ""}`}>
          {venta.items.map((i) =>
            i.tipo === "equipo" ? (
              <div
                key={`eq-${i.id}`}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm"
              >
                <span>
                  {i.modelo} · {i.gb ?? "—"} GB · {i.color ?? "—"}
                  <span className="num ml-2 text-xs text-muted-foreground">{i.imei}</span>
                </span>
                <span className="num">{formatCLP(aNumero(i.precio))}</span>
              </div>
            ) : (
              <div
                key={`ac-${i.id}`}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm"
              >
                <span>
                  {i.nombre}
                  <span className="num ml-2 text-xs text-muted-foreground">×{i.cantidad}</span>
                  {aNumero(i.precio) === 0 && (
                    <span className="ml-2 rounded-full border border-sky-400/25 bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-300">
                      Incluido
                    </span>
                  )}
                </span>
                <span className="num">{formatCLP(aNumero(i.precio) * i.cantidad)}</span>
              </div>
            ),
          )}
        </div>

        <div className="mt-5 space-y-2 border-t border-white/8 pt-4 text-sm">
          {venta.conBoleta && (
            <div className="flex justify-between text-muted-foreground">
              <span>Recargo boleta (9%)</span>
              <span className="num text-foreground">{formatCLP(venta.recargo)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="font-display">Total</span>
            <span className={`num font-display text-2xl font-semibold ${anulada ? "line-through" : ""}`}>
              {formatCLP(venta.total)}
            </span>
          </div>
        </div>

        <div className="mt-5 border-t border-white/8 pt-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Pagos</p>
          <div className="space-y-1.5">
            {venta.pagos.map((p) => (
              <div key={p.key} className="flex justify-between text-sm">
                <span>
                  {METODO_ETIQUETA[p.metodo]}
                  {p.nombre.trim() && (
                    <span className="ml-2 text-xs text-muted-foreground">{p.nombre.trim()}</span>
                  )}
                </span>
                <span className="num">{formatCLP(aNumero(p.monto))}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Button
            onClick={onNuevaVenta}
            className="accent-glow h-11 gap-2 bg-[var(--accent-store)] text-white hover:bg-[var(--accent-store)]/90"
          >
            <RotateCcw className="size-4" /> Nueva venta
          </Button>

          {puedeAnular && !anulada && (
            <div className="flex items-center gap-2">
              {confirmando ? (
                <>
                  <span className="text-xs text-muted-foreground">
                    ¿Anular esta venta? No se borra, queda registrada.
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
                    No
                  </Button>
                  <Button
                    size="sm"
                    onClick={anular}
                    disabled={anulando}
                    className="bg-red-500/80 text-white hover:bg-red-500"
                  >
                    {anulando ? "Anulando..." : "Sí, anular"}
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  className="border border-red-400/25 text-red-300 hover:text-red-200"
                  onClick={() => setConfirmando(true)}
                >
                  Anular
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
