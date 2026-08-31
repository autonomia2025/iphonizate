import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, Search, Wrench, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SERVICIOS, type ServicioTipo } from "@/lib/inventario";
import { formatCLP } from "@/lib/stores";
import { puedeEditarCostosArreglo } from "@/lib/gestion";
import { cn } from "@/lib/utils";

const DESC = "Costos de reparación por modelo para completar automáticamente los equipos enviados a técnico.";

type Costo = { modelo: string; tipo: ServicioTipo; costo: number; updated_at: string };

export const Route = createFileRoute("/costos-arreglo")({
  head: () => ({
    meta: [
      { title: "Costos de arreglo · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Costos de arreglo · iPhonizate OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CostosArregloPage,
});

function CostosArregloPage() {
  const { usuario } = useAuth();
  const puedeEditar = puedeEditarCostosArreglo(usuario?.rol);
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<{ modelo: string; tipo: ServicioTipo } | null>(null);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);

  const modelos = useQuery({
    queryKey: ["modelos_apple"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("modelos_apple")
        .select("modelo_comercial")
        .order("modelo_comercial");
      if (error) throw error;
      return [...new Set((data ?? []).map((fila) => fila.modelo_comercial))];
    },
  });

  const costos = useQuery({
    queryKey: ["costos_arreglo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("costos_arreglo")
        .select("modelo, tipo, costo, updated_at");
      if (error) throw error;
      return (data ?? []) as Costo[];
    },
  });

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (modelos.data ?? []).filter((modelo) => !q || modelo.toLowerCase().includes(q));
  }, [modelos.data, busqueda]);

  const costoPorClave = useMemo(
    () => new Map((costos.data ?? []).map((costo) => [`${costo.modelo}::${costo.tipo}`, costo])),
    [costos.data],
  );

  const comenzarEdicion = (modelo: string, tipo: ServicioTipo) => {
    if (!puedeEditar) return;
    setEditando({ modelo, tipo });
    setValor(String(costoPorClave.get(`${modelo}::${tipo}`)?.costo ?? ""));
  };

  const cancelar = () => {
    setEditando(null);
    setValor("");
  };

  const guardar = async (modelo: string, tipo: ServicioTipo) => {
    const costo = Number(valor.replace(/\D/g, ""));
    if (valor.trim() && (!Number.isFinite(costo) || costo < 0)) {
      toast.error("Ingresa un costo válido");
      return;
    }
    setGuardando(true);
    const { error } = await supabase.from("costos_arreglo").upsert(
      {
        modelo,
        tipo,
        costo,
        updated_at: new Date().toISOString(),
        updated_by: usuario?.id ?? null,
      },
      { onConflict: "modelo,tipo" },
    );
    setGuardando(false);
    if (error) {
      toast.error("No se pudo guardar el costo", { description: error.message.replace(/^.*?:\s*/, "") });
      return;
    }
    toast.success("Costo actualizado");
    cancelar();
    void costos.refetch();
  };

  return (
    <div className="mx-auto max-w-[90rem] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Costos de arreglo</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{DESC}</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar modelo" className="pl-9" placeholder="Buscar modelo" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-white/10 bg-[#16131F] shadow-xl shadow-black/10">
        <div className="flex items-center gap-2 border-b border-white/8 px-5 py-3 text-sm text-muted-foreground">
          <Wrench className="size-4 text-[var(--accent-store)]" />
          <span>{filas.length} modelos · {SERVICIOS.length} tipos de arreglo</span>
          {!puedeEditar && <span className="ml-auto text-xs">Solo lectura</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="sticky left-0 z-10 bg-[#16131F] px-5 py-3 font-medium">Modelo</th>
                {SERVICIOS.map((servicio) => <th key={servicio.tipo} className="min-w-28 px-3 py-3 font-medium">{servicio.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filas.map((modelo) => (
                <tr key={modelo} className="border-b border-white/6 last:border-0 hover:bg-white/[0.025]">
                  <th className="sticky left-0 z-10 bg-[#16131F] px-5 py-3 text-left font-medium whitespace-nowrap">{modelo}</th>
                  {SERVICIOS.map((servicio) => {
                    const clave = `${modelo}::${servicio.tipo}`;
                    const costo = costoPorClave.get(clave);
                    const editandoEsta = editando?.modelo === modelo && editando.tipo === servicio.tipo;
                    return (
                      <td key={servicio.tipo} className="px-3 py-2">
                        {editandoEsta ? (
                          <div className="flex items-center gap-1">
                            <input autoFocus inputMode="numeric" aria-label={`Costo ${servicio.label} ${modelo}`} className="num h-8 w-24 rounded-lg border border-[var(--accent-store)]/60 bg-white/[0.06] px-2 text-right outline-none" value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") void guardar(modelo, servicio.tipo); if (e.key === "Escape") cancelar(); }} />
                            <button type="button" aria-label="Guardar costo" disabled={guardando} onClick={() => void guardar(modelo, servicio.tipo)} className="rounded-md p-1 text-emerald-300 hover:bg-emerald-500/15"><Check className="size-4" /></button>
                            <button type="button" aria-label="Cancelar edición" onClick={cancelar} className="rounded-md p-1 text-muted-foreground hover:bg-white/[0.07]"><X className="size-4" /></button>
                          </div>
                        ) : (
                          <button type="button" disabled={!puedeEditar} onClick={() => comenzarEdicion(modelo, servicio.tipo)} className={cn("num rounded-lg px-2 py-1 text-left transition-colors duration-200", costo ? "text-foreground" : "border border-dashed border-white/15 text-muted-foreground/60", puedeEditar && "hover:border-[var(--accent-store)]/50 hover:bg-white/[0.06]")}>{costo ? formatCLP(costo.costo) : "Sin cargar"}</button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {filas.length === 0 && <tr><td colSpan={SERVICIOS.length + 1} className="px-5 py-10 text-center text-muted-foreground">{modelos.isLoading ? "Cargando modelos…" : "No hay modelos que coincidan."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {puedeEditar && <p className="text-xs text-muted-foreground">Haz clic en una celda y presiona Enter para guardar. Los costos se sugerirán al marcar un arreglo en un equipo.</p>}
    </div>
  );
}
