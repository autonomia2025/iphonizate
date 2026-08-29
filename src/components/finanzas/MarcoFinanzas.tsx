import { useQuery } from "@tanstack/react-query";
import { Lock, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import {
  mesTexto,
  periodoAnterior,
  puedeVerFinanzas,
  useRegistrarAccesoFinanzas,
  type Parametros,
} from "@/lib/finanzas";

export const campoFin =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

/** Gate de interfaz + registro del acceso en auditoría. El bloqueo real es RLS. */
export function useFinanzas(seccion: string) {
  const { usuario } = useAuth();
  const autorizado = puedeVerFinanzas(usuario?.rol ?? null);
  useRegistrarAccesoFinanzas(seccion, autorizado);

  const parametros = useQuery({
    queryKey: ["finanzas-parametros"],
    enabled: autorizado,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parametros_finanzas")
        .select("clave, etiqueta, valor, unidad, nota")
        .order("clave");
      if (error) throw error;
      return data ?? [];
    },
  });

  const params: Parametros = Object.fromEntries(
    (parametros.data ?? []).map((p) => [p.clave, Number(p.valor)]),
  );

  return { usuario, autorizado, params, parametros };
}

export function SinAccesoFinanzas() {
  return (
    <div className="glass mx-auto mt-10 max-w-lg p-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/[0.06] text-muted-foreground">
        <Lock className="size-5" />
      </span>
      <h1 className="mt-4 font-display text-xl">Finanzas</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Esta sección contiene datos personales y de remuneraciones. Solo dirección y administración
        pueden verla.
      </p>
    </div>
  );
}

export function EncabezadoFinanzas({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion: string;
  acciones?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Finanzas</p>
        <h1 className="mt-1 font-display text-2xl font-semibold">{titulo}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{descripcion}</p>
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}

/** Selector de mes con flechas: los meses cargados van de 2026-01 en adelante. */
export function SelectorPeriodo({
  periodo,
  onCambiar,
  opciones,
}: {
  periodo: string;
  onCambiar: (p: string) => void;
  opciones?: string[];
}) {
  const siguiente = (p: string) => {
    const [a, m] = p.split("-").map(Number);
    const d = new Date(a!, m!, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  return (
    <div className="glass flex items-center gap-1 p-1.5">
      <button
        aria-label="Mes anterior"
        onClick={() => onCambiar(periodoAnterior(periodo))}
        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-white/[0.07] hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
      </button>
      <select
        aria-label="Mes"
        value={periodo}
        onChange={(e) => onCambiar(e.target.value)}
        className="h-8 min-w-40 rounded-lg bg-transparent px-2 text-center text-sm font-medium outline-none"
      >
        {(opciones && opciones.includes(periodo) ? opciones : [...(opciones ?? []), periodo])
          .filter((v, i, arr) => arr.indexOf(v) === i)
          .sort()
          .map((p) => (
            <option key={p} value={p} className="bg-[#16131F]">
              {mesTexto(p)}
            </option>
          ))}
      </select>
      <button
        aria-label="Mes siguiente"
        onClick={() => onCambiar(siguiente(periodo))}
        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-white/[0.07] hover:text-foreground"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
