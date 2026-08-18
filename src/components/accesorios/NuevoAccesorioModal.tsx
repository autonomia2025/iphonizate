import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const CATEGORIAS_ACCESORIO = [
  { valor: "cargador", label: "Cargador" },
  { valor: "carcasa", label: "Carcasa" },
  { valor: "mica", label: "Mica" },
  { valor: "audifonos", label: "Audífonos" },
  { valor: "otro", label: "Otro" },
] as const;

export type CategoriaAccesorio = (typeof CATEGORIAS_ACCESORIO)[number]["valor"];

export const CATEGORIA_ACCESORIO_ETIQUETA = CATEGORIAS_ACCESORIO.reduce(
  (acc, c) => ({ ...acc, [c.valor]: c.label }),
  {} as Record<CategoriaAccesorio, string>,
);

const campo =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";
const etiqueta = "mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground";

export function NuevoAccesorioModal({
  abierto,
  onCerrar,
  onGuardado,
  puedeCostos,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
  puedeCostos: boolean;
}) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState<CategoriaAccesorio>("cargador");
  const [tipo, setTipo] = useState("");
  const [modelo, setModelo] = useState("");
  const [costo, setCosto] = useState("");
  const [precio, setPrecio] = useState("");
  const [minimo, setMinimo] = useState("3");
  const [guardando, setGuardando] = useState(false);

  if (!abierto) return null;

  const reiniciar = () => {
    setNombre("");
    setCategoria("cargador");
    setTipo("");
    setModelo("");
    setCosto("");
    setPrecio("");
    setMinimo("3");
  };

  const guardar = async () => {
    if (!nombre.trim()) {
      toast.error("Escribe el nombre del accesorio");
      return;
    }
    if (!precio || Number(precio) <= 0) {
      toast.error("Indica el precio de venta");
      return;
    }
    setGuardando(true);
    const { error } = await supabase.from("accesorios").insert({
      nombre: nombre.trim(),
      categoria,
      tipo: tipo.trim() || null,
      modelo: modelo.trim() || null,
      costo: puedeCostos ? Number(costo || 0) : 0,
      precio: Number(precio),
      minimo: Number(minimo || 0),
    });
    setGuardando(false);
    if (error) {
      toast.error("No se pudo crear el accesorio", {
        description: /permission|policy/i.test(error.message)
          ? "Tu rol no tiene permiso para crear accesorios."
          : error.message,
      });
      return;
    }
    toast.success("Accesorio creado", { description: nombre.trim() });
    reiniciar();
    onGuardado();
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass w-full max-w-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Nuevo accesorio</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              El stock por tienda se ajusta después desde “Ajustar stock”.
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

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={etiqueta}>Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
          </div>
          <div>
            <label className={etiqueta}>Categoría</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as CategoriaAccesorio)}
              className={campo}
            >
              {CATEGORIAS_ACCESORIO.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={etiqueta}>Tipo</label>
            <input
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              placeholder="20W, MagSafe, transparente…"
              className={campo}
            />
          </div>
          <div>
            <label className={etiqueta}>Modelo compatible</label>
            <input
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              placeholder="iPhone 13 / universal"
              className={campo}
            />
          </div>
          {puedeCostos && (
            <div>
              <label className={etiqueta}>Costo</label>
              <input
                value={costo}
                inputMode="numeric"
                onChange={(e) => setCosto(e.target.value.replace(/\D/g, ""))}
                className={`${campo} num`}
              />
            </div>
          )}
          <div>
            <label className={etiqueta}>Precio</label>
            <input
              value={precio}
              inputMode="numeric"
              onChange={(e) => setPrecio(e.target.value.replace(/\D/g, ""))}
              className={`${campo} num`}
            />
          </div>
          <div>
            <label className={etiqueta}>Stock mínimo</label>
            <input
              value={minimo}
              inputMode="numeric"
              onChange={(e) => setMinimo(e.target.value.replace(/\D/g, ""))}
              className={`${campo} num`}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button className="accent-glow" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Crear accesorio"}
          </Button>
        </div>
      </div>
    </div>
  );
}
