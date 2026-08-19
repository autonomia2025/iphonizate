import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { aMonto } from "@/lib/caja";
import { periodoTexto } from "@/lib/gestion";

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

export type MetaEditable = {
  id?: string;
  tienda_id: string;
  tienda_nombre: string;
  equipos_objetivo: number;
  ganancia_objetivo: number;
};

type Props = {
  abierto: boolean;
  periodo: string;
  meta: MetaEditable | null;
  verGanancias: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
};

export function MetaModal({ abierto, periodo, meta, verGanancias, onCerrar, onGuardado }: Props) {
  const [equipos, setEquipos] = useState("");
  const [ganancia, setGanancia] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto || !meta) return;
    setEquipos(meta.equipos_objetivo ? String(meta.equipos_objetivo) : "");
    setGanancia(meta.ganancia_objetivo ? String(meta.ganancia_objetivo) : "");
  }, [abierto, meta]);

  if (!abierto || !meta) return null;

  const objEquipos = Number(equipos.replace(/[^\d]/g, "")) || 0;
  const objGanancia = aMonto(ganancia);

  const guardar = async () => {
    if (objEquipos <= 0) {
      toast.error("Define un objetivo de equipos mayor a cero");
      return;
    }
    setGuardando(true);
    try {
      const fila = {
        tienda_id: meta.tienda_id,
        periodo,
        equipos_objetivo: objEquipos,
        ganancia_objetivo: objGanancia,
      };
      const { error } = meta.id
        ? await supabase.from("metas").update(fila).eq("id", meta.id)
        : await supabase.from("metas").insert(fila);
      if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
      toast.success("Meta guardada");
      onGuardado();
      onCerrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la meta");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass w-full max-w-md p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">
              Meta de {meta.tienda_nombre}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{periodoTexto(periodo)}</p>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.07] hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Equipos a vender
            </span>
            <input
              autoFocus
              inputMode="numeric"
              className={`${campo} num`}
              value={equipos}
              placeholder="90"
              onChange={(e) => setEquipos(e.target.value.replace(/[^\d]/g, ""))}
            />
          </label>

          {verGanancias && (
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                Ganancia objetivo
              </span>
              <input
                inputMode="numeric"
                className={`${campo} num`}
                value={ganancia}
                placeholder="0"
                onChange={(e) => setGanancia(e.target.value.replace(/[^\d]/g, ""))}
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {formatCLP(objGanancia)}
              </span>
            </label>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar meta"}
          </Button>
        </div>
      </div>
    </div>
  );
}
