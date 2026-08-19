import { useEffect, useRef, useState } from "react";
import { ScanLine, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { equipoTexto } from "@/lib/garantias";
import { cn } from "@/lib/utils";
import type { GarantiaMinima } from "./MandarTecnicoModal";

const campo =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

type Reemplazo = { imei: string; modelo: string | null; gb: number | null; color: string | null };

export function ResolverGarantiaModal({
  garantia,
  onCerrar,
  onHecho,
}: {
  garantia: GarantiaMinima;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [camino, setCamino] = useState<"reparado" | "cambio">("reparado");
  const [scan, setScan] = useState("");
  const [reemplazo, setReemplazo] = useState<Reemplazo | null>(null);
  const [diferencia, setDiferencia] = useState("");
  const [guardando, setGuardando] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (camino === "cambio") scanRef.current?.focus();
  }, [camino]);

  const buscar = async (valor: string) => {
    const imei = valor.trim();
    setScan("");
    if (!imei) return;
    if (imei === garantia.imei) {
      toast.error("El reemplazo debe ser otro equipo");
      return;
    }
    const { data, error } = await supabase
      .from("v_stock")
      .select("imei, modelo, gb, color, estado")
      .eq("imei", imei)
      .maybeSingle();
    if (error) {
      toast.error("No se pudo buscar el equipo", { description: error.message });
      return;
    }
    if (!data?.imei) {
      toast.error("Ese IMEI no está en el sistema");
      return;
    }
    if (data.estado !== "DISPONIBLE") {
      toast.error("El equipo de reemplazo debe estar disponible");
      return;
    }
    setReemplazo({
      imei: data.imei,
      modelo: data.modelo ?? null,
      gb: data.gb ?? null,
      color: data.color ?? null,
    });
  };

  const confirmar = async () => {
    setGuardando(true);
    if (camino === "reparado") {
      const { error } = await supabase.rpc("resolver_garantia_reparado", {
        _garantia: garantia.id,
      });
      setGuardando(false);
      if (error) {
        toast.error("No se pudo resolver", {
          description: error.message.replace(/^.*?:\s*/, ""),
        });
        return;
      }
      toast.success("Garantía resuelta: equipo reparado y devuelto");
    } else {
      if (!reemplazo) {
        setGuardando(false);
        toast.error("Escanea el equipo de reemplazo");
        return;
      }
      const { error } = await supabase.rpc("resolver_garantia_cambio", {
        _garantia: garantia.id,
        _imei_reemplazo: reemplazo.imei,
        _diferencia: Number(diferencia || 0),
      });
      setGuardando(false);
      if (error) {
        toast.error("No se pudo hacer el cambio", {
          description: error.message.replace(/^.*?:\s*/, ""),
        });
        return;
      }
      toast.success("Garantía resuelta con cambio", {
        description: "El equipo devuelto volvió al inventario por revisar",
      });
    }
    onHecho();
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass w-full max-w-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Resolver garantía</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {equipoTexto(garantia.modelo, garantia.gb)} ·{" "}
              <span className="num">{garantia.imei}</span>
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

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {[
            { valor: "reparado" as const, titulo: "Reparado", sub: "Se devuelve el mismo equipo" },
            { valor: "cambio" as const, titulo: "Cambio", sub: "Se entrega otro equipo" },
          ].map((o) => (
            <button
              key={o.valor}
              type="button"
              onClick={() => setCamino(o.valor)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors duration-200",
                camino === o.valor
                  ? "border-[var(--accent-store)]/50 bg-white/[0.07]"
                  : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]",
              )}
            >
              <span className="block text-sm font-medium">{o.titulo}</span>
              <span className="block text-[12px] text-muted-foreground">{o.sub}</span>
            </button>
          ))}
        </div>

        {camino === "reparado" ? (
          <p className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-[13px] text-muted-foreground">
            El equipo vuelve a estado entregado y la garantía queda resuelta. El costo del arreglo ya
            quedó sumado al equipo y la venta original no se modifica.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Equipo de reemplazo (disponible)
              </label>
              <div className="relative">
                <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={scanRef}
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void buscar(scan);
                  }}
                  placeholder="Escanea o escribe el IMEI y presiona Enter"
                  className={`${campo} num pl-9`}
                />
              </div>
              {reemplazo && (
                <p className="mt-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-[13px]">
                  {equipoTexto(reemplazo.modelo, reemplazo.gb)}
                  {reemplazo.color ? ` · ${reemplazo.color}` : ""} ·{" "}
                  <span className="num text-muted-foreground">{reemplazo.imei}</span>
                </p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Diferencia pagada por el cliente
              </label>
              <input
                value={diferencia}
                inputMode="numeric"
                onChange={(e) => setDiferencia(e.target.value.replace(/\D/g, ""))}
                placeholder="0"
                className={`${campo} num`}
              />
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                {formatCLP(Number(diferencia || 0))} · no es una venta: solo baja el costo del equipo
                devuelto.
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            className="accent-glow"
            onClick={() => void confirmar()}
            disabled={guardando || (camino === "cambio" && !reemplazo)}
          >
            {guardando ? "Guardando…" : camino === "reparado" ? "Marcar reparado" : "Confirmar cambio"}
          </Button>
        </div>
      </div>
    </div>
  );
}
