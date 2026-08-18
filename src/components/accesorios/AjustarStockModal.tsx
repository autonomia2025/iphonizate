import { useEffect, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const campo =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";
const etiqueta = "mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground";

export function AjustarStockModal({
  abierto,
  onCerrar,
  onGuardado,
  accesorios,
  tiendas,
  tiendaFija,
  accesorioInicial,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
  accesorios: { id: string; nombre: string }[];
  tiendas: { id: string; nombre: string }[];
  tiendaFija?: string | null;
  accesorioInicial?: string | null;
}) {
  const [accesorio, setAccesorio] = useState("");
  const [tienda, setTienda] = useState("");
  const [signo, setSigno] = useState<1 | -1>(1);
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setAccesorio(accesorioInicial ?? "");
    setTienda(tiendaFija ?? "");
    setSigno(1);
    setCantidad("");
    setMotivo("");
  }, [abierto, accesorioInicial, tiendaFija]);

  if (!abierto) return null;

  const guardar = async () => {
    if (!accesorio) {
      toast.error("Elige el accesorio");
      return;
    }
    if (!tienda) {
      toast.error("Elige la tienda");
      return;
    }
    const n = Number(cantidad || 0);
    if (n <= 0) {
      toast.error("Indica una cantidad mayor a cero");
      return;
    }
    if (!motivo.trim()) {
      toast.error("Escribe el motivo del ajuste");
      return;
    }

    setGuardando(true);
    const { data, error } = await supabase.rpc("ajustar_stock_accesorio", {
      _accesorio: accesorio,
      _tienda: tienda,
      _delta: n * signo,
      _motivo: motivo.trim(),
    });
    setGuardando(false);

    if (error) {
      toast.error("No se pudo ajustar el stock", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    toast.success(`Stock ajustado: queda en ${data ?? 0} unidades`);
    onGuardado();
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass w-full max-w-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Ajustar stock</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada ajuste queda registrado con su motivo en la auditoría.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onCerrar}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/8 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className={etiqueta}>Accesorio</label>
            <select
              value={accesorio}
              onChange={(e) => setAccesorio(e.target.value)}
              className={campo}
            >
              <option value="">Selecciona…</option>
              {accesorios.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={etiqueta}>Tienda</label>
            <select
              value={tienda}
              disabled={!!tiendaFija}
              onChange={(e) => setTienda(e.target.value)}
              className={`${campo} ${tiendaFija ? "opacity-60" : ""}`}
            >
              <option value="">Selecciona…</option>
              {tiendas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <div>
              <label className={etiqueta}>Operación</label>
              <div className="flex h-11 items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
                <button
                  type="button"
                  onClick={() => setSigno(1)}
                  className={`flex h-9 items-center gap-1 rounded-lg px-3 text-sm transition-colors duration-200 ${
                    signo === 1
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Plus className="size-4" /> Sumar
                </button>
                <button
                  type="button"
                  onClick={() => setSigno(-1)}
                  className={`flex h-9 items-center gap-1 rounded-lg px-3 text-sm transition-colors duration-200 ${
                    signo === -1
                      ? "bg-red-500/20 text-red-300"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Minus className="size-4" /> Restar
                </button>
              </div>
            </div>
            <div>
              <label className={etiqueta}>Cantidad</label>
              <input
                value={cantidad}
                inputMode="numeric"
                onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ""))}
                className={`${campo} num`}
              />
            </div>
          </div>

          <div>
            <label className={etiqueta}>Motivo</label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Compra a proveedor, merma, traspaso, corrección de conteo…"
              className={campo}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button className="accent-glow" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Registrar ajuste"}
          </Button>
        </div>
      </div>
    </div>
  );
}
