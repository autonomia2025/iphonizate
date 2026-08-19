import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { GB_OPCIONES } from "@/lib/inventario";
import { aMonto } from "@/lib/caja";

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

type Props = {
  abierto: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
  usuarioId?: string | null;
};

export function NuevoPrecioModal({ abierto, onCerrar, onGuardado, usuarioId }: Props) {
  const [modelo, setModelo] = useState("");
  const [gb, setGb] = useState<number>(128);
  const [precio, setPrecio] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setModelo("");
    setGb(128);
    setPrecio("");
  }, [abierto]);

  if (!abierto) return null;

  const valor = aMonto(precio);

  const guardar = async () => {
    if (!modelo.trim()) {
      toast.error("Indica el modelo");
      return;
    }
    if (valor <= 0) {
      toast.error("Ingresa un precio mayor a cero");
      return;
    }
    setGuardando(true);
    try {
      const { error } = await supabase.from("precios").insert({
        modelo: modelo.trim(),
        gb,
        precio: valor,
        updated_by: usuarioId ?? null,
      });
      if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
      toast.success("Precio creado");
      onGuardado();
      onCerrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el precio");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass w-full max-w-md p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Nuevo precio</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Precio sugerido de venta para el modelo
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
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Modelo
            </span>
            <input
              autoFocus
              className={campo}
              value={modelo}
              placeholder="iPhone 15 PRO MAX"
              onChange={(e) => setModelo(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              GB
            </span>
            <select
              className={`${campo} num`}
              value={gb}
              onChange={(e) => setGb(Number(e.target.value))}
            >
              {GB_OPCIONES.map((g) => (
                <option key={g} value={g} className="bg-[#16131F]">
                  {g}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Precio
            </span>
            <input
              inputMode="numeric"
              className={`${campo} num`}
              value={precio}
              placeholder="0"
              onChange={(e) => setPrecio(e.target.value.replace(/[^\d]/g, ""))}
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">{formatCLP(valor)}</span>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Crear precio"}
          </Button>
        </div>
      </div>
    </div>
  );
}
