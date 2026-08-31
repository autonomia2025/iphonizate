import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wand2, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { aMonto } from "@/lib/caja";
import {
  ASIGNACIONES,
  MARCAS,
  etiquetaAsignacion,
  mesTexto,
  repartirPorMarca,
} from "@/lib/finanzas";
import {
  EncabezadoFinanzas,
  SelectorPeriodo,
  SinAccesoFinanzas,
  campoFin,
  useFinanzas,
} from "@/components/finanzas/MarcoFinanzas";

const DESC =
  "Gastos fijos y variables del mes, con prorrateo de lo compartido entre las tres marcas.";

export const Route = createFileRoute("/finanzas/gastos")({
  head: () => ({
    meta: [
      { title: "Gastos fijos y variables · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Gastos fijos y variables · iPhonizate OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GastosFinanzasPage,
});

type GastoFin = {
  id: string;
  categoria: string;
  detalle: string | null;
  descripcion: string | null;
  asignacion: string | null;
  monto: number;
  tipo: "fijo" | "variable" | "operativo";
  periodo: string | null;
  fecha_pago: string | null;
  pagado: boolean;
  
};

function GastosFinanzasPage() {
  const { autorizado, params } = useFinanzas("gastos");
  const [periodo, setPeriodo] = useState("2026-08");
  const [generando, setGenerando] = useState(false);
  const [nuevo, setNuevo] = useState<{ tipo: "fijo" | "variable" } | null>(null);
  const [form, setForm] = useState({
    categoria: "",
    detalle: "",
    asignacion: "compartido",
    monto: "",
  });

  const gastos = useQuery({
    queryKey: ["finanzas-gastos", periodo],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gastos")
        .select(
          "id, categoria, detalle, descripcion, asignacion, monto, tipo, periodo, fecha_pago, pagado, tienda_id",
        )
        .eq("periodo", periodo)
        .in("tipo", ["fijo", "variable"])
        .order("categoria");
      if (error) throw error;
      return (data ?? []) as unknown as GastoFin[];
    },
  });

  const periodosCargados = useQuery({
    queryKey: ["finanzas-gastos-periodos"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gastos")
        .select("periodo")
        .not("periodo", "is", null)
        .in("tipo", ["fijo", "variable"]);
      if (error) throw error;
      return [...new Set((data ?? []).map((r) => r.periodo as string))];
    },
  });

  const fijos = useMemo(() => (gastos.data ?? []).filter((g) => g.tipo === "fijo"), [gastos.data]);
  const variables = useMemo(
    () => (gastos.data ?? []).filter((g) => g.tipo === "variable"),
    [gastos.data],
  );

  const totalFijos = fijos.reduce((a, g) => a + Number(g.monto), 0);
  const totalVariables = variables.reduce((a, g) => a + Number(g.monto), 0);

  const porMarca = useMemo(
    () =>
      repartirPorMarca(
        (gastos.data ?? []).map((g) => ({ asignacion: g.asignacion, monto: Number(g.monto) })),
        params,
      ),
    [gastos.data, params],
  );

  const generar = async (tipo: "fijo" | "variable") => {
    setGenerando(true);
    const { data, error } = await supabase.rpc("generar_gastos_periodo", {
      _periodo: periodo,
      _tipo: tipo,
    });
    setGenerando(false);
    if (error) { toast.error(error.message); return; }
    const n = Number(data ?? 0);
    toast[n ? "success" : "info"](
      n
        ? `${n} gastos ${tipo === "fijo" ? "fijos" : "variables"} generados en ${mesTexto(periodo)}`
        : "No quedaban plantillas por generar en este mes",
    );
    void gastos.refetch();
    void periodosCargados.refetch();
  };

  const actualizar = async (id: string, cambios: Partial<GastoFin>) => {
    const { error } = await supabase.from("gastos").update(cambios).eq("id", id);
    if (error) { toast.error(error.message); return; }
    void gastos.refetch();
  };

  const crear = async () => {
    if (!nuevo) return;
    if (!form.categoria.trim() || !form.detalle.trim()) {
      { toast.error("Categoría y detalle son obligatorios"); return; }
    }
    const tiendaId =
      form.asignacion === "compartido"
        ? null
        : ((
            await supabase.from("tiendas").select("id").eq("slug", form.asignacion).maybeSingle()
          ).data?.id ?? null);
    const { error } = await supabase.from("gastos").insert({
      categoria: form.categoria.trim(),
      detalle: form.detalle.trim(),
      descripcion: form.detalle.trim(),
      asignacion: form.asignacion,
      monto: aMonto(form.monto),
      tipo: nuevo.tipo,
      periodo,
      tienda_id: tiendaId,
      fecha: `${periodo}-01T12:00:00`,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Gasto agregado");
    setNuevo(null);
    setForm({ categoria: "", detalle: "", asignacion: "compartido", monto: "" });
    void gastos.refetch();
  };

  if (!autorizado) return <SinAccesoFinanzas />;

  const Bloque = ({
    titulo,
    tipo,
    filas,
    total,
  }: {
    titulo: string;
    tipo: "fijo" | "variable";
    filas: GastoFin[];
    total: number;
  }) => (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">{titulo}</h2>
        <div className="flex items-center gap-2">
          <span className="num text-sm text-muted-foreground">{formatCLP(total)}</span>
          <Button variant="secondary" size="sm" onClick={() => void generar(tipo)} disabled={generando}>
            <Wand2 className="size-4" /> Generar del mes
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setNuevo(nuevo?.tipo === tipo ? null : { tipo })}
          >
            <Plus className="size-4" /> Agregar
          </Button>
        </div>
      </div>

      {nuevo?.tipo === tipo && (
        <div className="glass mt-3 flex flex-wrap items-end gap-3 p-4">
          <input
            className={`${campoFin} w-44`}
            placeholder="Categoría"
            aria-label="Categoría"
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
          />
          <input
            className={`${campoFin} w-64`}
            placeholder="Detalle"
            aria-label="Detalle"
            value={form.detalle}
            onChange={(e) => setForm({ ...form, detalle: e.target.value })}
          />
          <select
            className={`${campoFin} w-44`}
            aria-label="Asignación"
            value={form.asignacion}
            onChange={(e) => setForm({ ...form, asignacion: e.target.value })}
          >
            {ASIGNACIONES.map((a) => (
              <option key={a.valor} value={a.valor} className="bg-[#16131F]">
                {a.label}
              </option>
            ))}
          </select>
          <input
            className={`${campoFin} num w-36`}
            placeholder="Monto"
            aria-label="Monto"
            value={form.monto}
            onChange={(e) => setForm({ ...form, monto: e.target.value })}
          />
          <Button onClick={() => void crear()}>Guardar</Button>
        </div>
      )}

      <div className="solid-panel mt-3 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-3 font-medium">Categoría</th>
                <th className="px-3 py-3 font-medium">Detalle</th>
                <th className="px-3 py-3 font-medium">Asignación</th>
                <th className="px-3 py-3 font-medium">Tipo</th>
                <th className="px-3 py-3 text-right font-medium">Monto</th>
                <th className="px-3 py-3 font-medium">Fecha de pago</th>
                <th className="px-3 py-3 text-center font-medium">Pagado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((g) => (
                <tr
                  key={g.id}
                  className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                >
                  <td className="px-3 py-2">
                    <input
                      key={`c-${g.id}-${g.categoria}`}
                      defaultValue={g.categoria}
                      aria-label={`Categoría de ${g.detalle ?? g.categoria}`}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== g.categoria) void actualizar(g.id, { categoria: v });
                      }}
                      className="h-8 w-40 rounded-lg border border-white/10 bg-white/[0.04] px-2 outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      key={`t-${g.id}-${g.detalle ?? ""}`}
                      defaultValue={g.detalle ?? g.descripcion ?? ""}
                      aria-label={`Detalle de ${g.detalle ?? g.categoria}`}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (g.detalle ?? ""))
                          void actualizar(g.id, { detalle: v, descripcion: v });
                      }}
                      className="h-8 w-60 rounded-lg border border-white/10 bg-white/[0.04] px-2 outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Asignación de ${g.detalle ?? g.categoria}`}
                      value={g.asignacion ?? "compartido"}
                      onChange={(e) => void cambiarAsignacion(g.id, e.target.value)}
                      className="h-8 w-44 rounded-lg border border-white/10 bg-white/[0.04] px-2 outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
                    >
                      {asignacionesDisponibles.map((a) => (
                        <option key={a.valor} value={a.valor} className="bg-[#16131F]">
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Tipo de ${g.detalle ?? g.categoria}`}
                      value={g.tipo}
                      onChange={(e) =>
                        void actualizar(g.id, { tipo: e.target.value as GastoFin["tipo"] })
                      }
                      className="h-8 w-32 rounded-lg border border-white/10 bg-white/[0.04] px-2 outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
                    >
                      <option value="fijo" className="bg-[#16131F]">
                        Fijo
                      </option>
                      <option value="variable" className="bg-[#16131F]">
                        Variable
                      </option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      key={`m-${g.id}-${g.monto}`}
                      defaultValue={String(g.monto)}
                      aria-label={`Monto de ${g.detalle ?? g.categoria}`}
                      onBlur={(e) => {
                        const v = aMonto(e.target.value);
                        if (v !== Number(g.monto)) void actualizar(g.id, { monto: v });
                      }}
                      className="num h-8 w-32 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-right outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      aria-label={`Fecha de pago de ${g.detalle ?? g.categoria}`}
                      defaultValue={g.fecha_pago ?? ""}
                      key={`d-${g.id}-${g.fecha_pago}`}
                      onBlur={(e) =>
                        void actualizar(g.id, { fecha_pago: e.target.value || null })
                      }
                      className="num h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2 outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Pagado ${g.detalle ?? g.categoria}`}
                      checked={g.pagado}
                      onChange={(e) => void actualizar(g.id, { pagado: e.target.checked })}
                      className="size-4 accent-[var(--accent-store)]"
                    />
                  </td>
                </tr>
              ))}

              {filas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    {gastos.isLoading
                      ? "Cargando gastos…"
                      : "Sin gastos en este bloque. Genera los del mes desde las plantillas."}
                  </td>
                </tr>
              )}
            </tbody>
            {filas.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/10 bg-white/[0.03] font-semibold">
                  <td className="px-3 py-3" colSpan={3}>
                    Total
                  </td>
                  <td className="num px-3 py-3 text-right">{formatCLP(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[92rem]">
      <EncabezadoFinanzas
        titulo="Gastos fijos y variables"
        descripcion={DESC}
        acciones={
          <SelectorPeriodo
            periodo={periodo}
            onCambiar={setPeriodo}
            opciones={periodosCargados.data ?? []}
          />
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="glass p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Gastos fijos
          </p>
          <p className="num mt-2 font-display text-2xl font-semibold">{formatCLP(totalFijos)}</p>
        </div>
        <div className="glass p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Gastos variables
          </p>
          <p className="num mt-2 font-display text-2xl font-semibold">
            {formatCLP(totalVariables)}
          </p>
        </div>
        {MARCAS.map((m) => (
          <div key={m.valor} className="glass p-5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {m.label}
            </p>
            <p className="num mt-2 font-display text-2xl font-semibold">
              {formatCLP(porMarca[m.valor] ?? 0)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">Con prorrateo de compartidos</p>
          </div>
        ))}
      </div>

      <Bloque titulo="Gastos fijos" tipo="fijo" filas={fijos} total={totalFijos} />
      <Bloque titulo="Gastos variables" tipo="variable" filas={variables} total={totalVariables} />

      <p className="mt-6 text-xs text-muted-foreground">
        Los gastos del día a día de las tiendas siguen registrándose en la sección Gastos: acá solo
        se ven los fijos y variables del holding.
      </p>
    </div>
  );
}
