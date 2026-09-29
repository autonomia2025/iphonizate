import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { METODOS, type MetodoPago } from "@/lib/pos";

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

export type PagoCorregible = {
  id: string;
  metodo: MetodoPago;
  monto: number;
  nombre_pagador: string | null;
};

type Fila = { metodo: MetodoPago; nombre: string };

/** Igual que al vender: todo lo que no es efectivo lleva a quién o qué se recibió. */
const pideNombre = (m: MetodoPago) => m !== "efectivo";

/**
 * Corrige el método de los pagos de una venta. El monto no se toca. La base de
 * datos lo rechaza si la caja de ese día ya se cerró, y la venta vuelve a
 * quedar pendiente en Revisión de pagos.
 */
export function CorregirPagoModal({
  pagos,
  onCerrar,
  onGuardado,
}: {
  pagos: PagoCorregible[] | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [filas, setFilas] = useState<Record<string, Fila>>({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setFilas(
      Object.fromEntries(
        (pagos ?? []).map((p) => [p.id, { metodo: p.metodo, nombre: p.nombre_pagador ?? "" }]),
      ),
    );
  }, [pagos]);

  const cambiados = (pagos ?? []).filter((p) => {
    const f = filas[p.id];
    return f && (f.metodo !== p.metodo || f.nombre.trim() !== (p.nombre_pagador ?? ""));
  });
  const faltaNombre = cambiados.some((p) => pideNombre(filas[p.id]!.metodo) && !filas[p.id]!.nombre.trim());

  const guardar = async () => {
    setGuardando(true);
    for (const p of cambiados) {
      const f = filas[p.id]!;
      const { error } = await supabase.rpc("corregir_pago", {
        _pago: p.id,
        _metodo: f.metodo,
        _nombre_pagador: pideNombre(f.metodo) ? f.nombre.trim() : null,
      });
      if (error) {
        setGuardando(false);
        toast.error("No se pudo corregir el pago", {
          description: error.message.replace(/^.*?:\s*/, ""),
        });
        return;
      }
    }
    setGuardando(false);
    toast.success("Forma de pago corregida", {
      description: "La venta volvió a quedar pendiente en Revisión de pagos.",
    });
    onGuardado();
    onCerrar();
  };

  return (
    <Dialog open={!!pagos} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="glass border-white/10 bg-white/5 backdrop-blur-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Corregir forma de pago</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Solo cambia el método; el monto se mantiene. No se puede corregir si la caja de ese día
          ya está cerrada.
        </p>

        <div className="space-y-3">
          {(pagos ?? []).map((p) => {
            const f = filas[p.id];
            if (!f) return null;
            return (
              <div key={p.id} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                <div className="flex items-center gap-3">
                  <select
                    className={campo}
                    value={f.metodo}
                    aria-label="Método de pago"
                    onChange={(e) =>
                      setFilas((s) => ({
                        ...s,
                        [p.id]: { ...f, metodo: e.target.value as MetodoPago },
                      }))
                    }
                  >
                    {METODOS.map((m) => (
                      <option key={m.valor} value={m.valor} className="bg-[#16131F]">
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <span className="num shrink-0 text-sm">{formatCLP(p.monto)}</span>
                </div>
                {pideNombre(f.metodo) && (
                  <input
                    className={`${campo} mt-2`}
                    value={f.nombre}
                    placeholder={
                      f.metodo === "partePago" ? "Equipo recibido" : "Nombre de quien pagó"
                    }
                    aria-label="Nombre del pagador"
                    onChange={(e) =>
                      setFilas((s) => ({ ...s, [p.id]: { ...f, nombre: e.target.value } }))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>

        {faltaNombre && (
          <p className="text-xs text-amber-300">
            Los pagos que no son en efectivo necesitan el nombre de quien pagó o el equipo recibido.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={guardando || !cambiados.length || faltaNombre}
            onClick={() => void guardar()}
          >
            {guardando ? "Guardando…" : "Guardar corrección"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
