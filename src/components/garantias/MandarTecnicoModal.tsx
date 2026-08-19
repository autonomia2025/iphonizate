import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { SERVICIOS, type ServicioTipo } from "@/lib/inventario";
import { equipoTexto } from "@/lib/garantias";

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

export type GarantiaMinima = {
  id: string;
  imei: string;
  modelo: string | null;
  gb: number | null;
};

export function MandarTecnicoModal({
  garantia,
  puedeCostos,
  onCerrar,
  onHecho,
}: {
  garantia: GarantiaMinima;
  puedeCostos: boolean;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [sel, setSel] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const alternar = (tipo: ServicioTipo) =>
    setSel((prev) => {
      const copia = { ...prev };
      if (tipo in copia) delete copia[tipo];
      else copia[tipo] = "";
      return copia;
    });

  const elegidos = Object.keys(sel) as ServicioTipo[];
  const totalCosto = elegidos.reduce((s, t) => s + Number(sel[t] || 0), 0);

  const guardar = async () => {
    if (elegidos.length === 0) {
      toast.error("Elige al menos un arreglo");
      return;
    }
    setGuardando(true);
    const { error } = await supabase.rpc("garantia_mandar_tecnico", {
      _garantia: garantia.id,
      _servicios: elegidos.map((tipo) => ({ tipo, costo: Number(sel[tipo] || 0) })),
    });
    setGuardando(false);
    if (error) {
      toast.error("No se pudo mandar a técnico", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    toast.success("Equipo listo para asignar en Técnico", {
      description: `${elegidos.length} arreglo(s) por hacer`,
    });
    onHecho();
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass w-full max-w-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Mandar a técnico</h2>
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

        <div className="mt-5 space-y-2">
          {SERVICIOS.map((s) => {
            const activo = s.tipo in sel;
            return (
              <div
                key={s.tipo}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2"
              >
                <label className="flex flex-1 items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={() => alternar(s.tipo)}
                    className="size-4 accent-[var(--accent-store)]"
                  />
                  {s.label}
                </label>
                {activo && puedeCostos && (
                  <input
                    value={sel[s.tipo] ?? ""}
                    inputMode="numeric"
                    placeholder="Costo"
                    onChange={(e) =>
                      setSel((prev) => ({ ...prev, [s.tipo]: e.target.value.replace(/\D/g, "") }))
                    }
                    className={`${campo} num w-32`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {puedeCostos && (
          <p className="num mt-4 text-sm text-muted-foreground">
            Costo del arreglo: <span className="text-foreground">{formatCLP(totalCosto)}</span> · se
            suma al costo del equipo
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button className="accent-glow" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Mandar a técnico"}
          </Button>
        </div>
      </div>
    </div>
  );
}
