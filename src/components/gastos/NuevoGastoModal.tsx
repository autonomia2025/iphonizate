import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { CATEGORIAS_GASTO, aMonto, hoyISO } from "@/lib/caja";

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

export type GastoEditable = {
  id: string;
  categoria: string;
  descripcion: string | null;
  monto: number;
  tienda_id: string | null;
  fecha: string;
};

type Props = {
  abierto: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
  tiendas: { id: string; nombre: string }[];
  tiendaSugerida?: string | null;
  soloTienda?: string | null;
  gasto?: GastoEditable | null;
  usuarioId?: string | null;
};

export function NuevoGastoModal({
  abierto,
  onCerrar,
  onGuardado,
  tiendas,
  tiendaSugerida,
  soloTienda,
  gasto,
  usuarioId,
}: Props) {
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_GASTO[0]);
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [tienda, setTienda] = useState<string>("general");
  const [fecha, setFecha] = useState(hoyISO());
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    if (gasto) {
      setCategoria(gasto.categoria);
      setDescripcion(gasto.descripcion ?? "");
      setMonto(String(gasto.monto));
      setTienda(gasto.tienda_id ?? "general");
      setFecha(gasto.fecha.slice(0, 10));
    } else {
      setCategoria(CATEGORIAS_GASTO[0]);
      setDescripcion("");
      setMonto("");
      setTienda(soloTienda ?? tiendaSugerida ?? "general");
      setFecha(hoyISO());
    }
  }, [abierto, gasto, soloTienda, tiendaSugerida]);

  if (!abierto) return null;

  const valor = aMonto(monto);

  const guardar = async () => {
    if (!fecha) {
      toast.error("La fecha es obligatoria");
      return;
    }
    if (valor <= 0) {
      toast.error("Ingresa un monto mayor a cero");
      return;
    }
    setGuardando(true);
    try {
      const fila = {
        categoria,
        descripcion: descripcion.trim() || null,
        monto: valor,
        tienda_id: tienda === "general" ? null : tienda,
        fecha: new Date(`${fecha}T12:00:00`).toISOString(),
      };
      const { error } = gasto
        ? await supabase.from("gastos").update(fila).eq("id", gasto.id)
        : await supabase.from("gastos").insert({ ...fila, usuario_id: usuarioId ?? null });
      if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
      toast.success(gasto ? "Gasto actualizado" : "Gasto registrado");
      onGuardado();
      onCerrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el gasto");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass w-full max-w-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">
              {gasto ? "Editar gasto" : "Nuevo gasto"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Registra el gasto con su fecha real, no la de hoy
            </p>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.07] hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Categoría
            </span>
            <select
              className={campo}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              {CATEGORIAS_GASTO.map((c) => (
                <option key={c} value={c} className="bg-[#16131F]">
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Fecha
            </span>
            <input
              type="date"
              required
              className={`${campo} num`}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Descripción
            </span>
            <input
              className={campo}
              value={descripcion}
              placeholder="Detalle del gasto"
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Monto
            </span>
            <input
              inputMode="numeric"
              className={`${campo} num`}
              value={monto}
              placeholder="0"
              onChange={(e) => setMonto(e.target.value.replace(/[^\d]/g, ""))}
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {formatCLP(valor)}
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Tienda
            </span>
            <select
              className={campo}
              value={tienda}
              disabled={!!soloTienda}
              onChange={(e) => setTienda(e.target.value)}
            >
              {!soloTienda && (
                <option value="general" className="bg-[#16131F]">
                  General (sin tienda)
                </option>
              )}
              {tiendas.map((t) => (
                <option key={t.id} value={t.id} className="bg-[#16131F]">
                  {t.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : gasto ? "Guardar cambios" : "Registrar gasto"}
          </Button>
        </div>
      </div>
    </div>
  );
}
