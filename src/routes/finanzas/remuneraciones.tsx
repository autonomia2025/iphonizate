import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CopyPlus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import {
  calcularNomina,
  etiquetaAsignacion,
  etiquetaTipo,
  mesTexto,
  periodoActualFinanzas,
  periodoAnterior,
  type FilaNomina,
  type PersonaFinanzas,
} from "@/lib/finanzas";
import {
  EncabezadoFinanzas,
  SelectorPeriodo,
  SinAccesoFinanzas,
  useFinanzas,
} from "@/components/finanzas/MarcoFinanzas";
import { cn } from "@/lib/utils";

const DESC =
  "Sueldos, bonificaciones y bonos por asistencia mes a mes. Solo se escriben faltas y atrasos: el resto se calcula.";

export const Route = createFileRoute("/finanzas/remuneraciones")({
  head: () => ({
    meta: [
      { title: "Remuneraciones · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Remuneraciones · iPhonizate OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RemuneracionesPage,
});

const PERIODOS_BASE = [
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
];

function RemuneracionesPage() {
  const { autorizado, params } = useFinanzas("remuneraciones");
  const [periodo, setPeriodo] = useState("2026-08");
  const [guardando, setGuardando] = useState(false);

  const personal = useQuery({
    queryKey: ["finanzas-personal"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal")
        .select(
          "id, nombre, cargo, area, asignacion, tipo, estado, revisar, liquido_liquidacion, bonificacion_extra, bono_variable_referencia",
        )
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as unknown as PersonaFinanzas[];
    },
  });

  const nomina = useQuery({
    queryKey: ["finanzas-nomina", periodo],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nomina_mensual")
        .select(
          "id, periodo, personal_id, liquido_liquidacion, bonificacion_extra, bono_base, faltas, atrasos, otros_descuentos, pagado_quincena, pagado_fin_mes, notas",
        )
        .eq("periodo", periodo);
      if (error) throw error;
      return (data ?? []) as unknown as FilaNomina[];
    },
  });

  const periodosCargados = useQuery({
    queryKey: ["finanzas-periodos"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nomina_mensual")
        .select("periodo")
        .order("periodo");
      if (error) throw error;
      return [...new Set((data ?? []).map((r) => r.periodo))];
    },
  });

  const porPersona = useMemo(() => {
    const mapa = new Map<string, FilaNomina>();
    (nomina.data ?? []).forEach((f) => mapa.set(f.personal_id, f));
    return mapa;
  }, [nomina.data]);

  const filas = useMemo(() => {
    return (personal.data ?? [])
      .filter((p) => p.estado === "activo" || porPersona.has(p.id))
      .map((p) => {
        const fila = porPersona.get(p.id);
        const base: FilaNomina = fila ?? {
          id: "",
          periodo,
          personal_id: p.id,
          liquido_liquidacion: 0,
          bonificacion_extra: 0,
          bono_base: 0,
          faltas: 0,
          atrasos: 0,
          otros_descuentos: 0,
          pagado_quincena: false,
          pagado_fin_mes: false,
          notas: null,
        };
        return { persona: p, fila: base, calc: calcularNomina(base, p.tipo, params) };
      });
  }, [personal.data, porPersona, params, periodo]);

  const totales = useMemo(
    () =>
      filas.reduce(
        (a, f) => ({
          liquido: a.liquido + f.fila.liquido_liquidacion,
          bonificacion: a.bonificacion + f.fila.bonificacion_extra,
          totalLiquido: a.totalLiquido + f.calc.totalLiquido,
          bonoBase: a.bonoBase + f.fila.bono_base,
          bono: a.bono + f.calc.bonoAPagar,
          quincena: a.quincena + f.calc.quincena,
          finMes: a.finMes + f.calc.finMes,
          total: a.total + f.calc.total,
          carga: a.carga + f.calc.cargaPatronal,
          faltas: a.faltas + f.fila.faltas,
          atrasos: a.atrasos + f.fila.atrasos,
        }),
        {
          liquido: 0,
          bonificacion: 0,
          totalLiquido: 0,
          bonoBase: 0,
          bono: 0,
          quincena: 0,
          finMes: 0,
          total: 0,
          carga: 0,
          faltas: 0,
          atrasos: 0,
        },
      ),
    [filas],
  );

  const guardarCampo = async (
    fila: FilaNomina,
    cambios: Partial<Pick<FilaNomina, "faltas" | "atrasos" | "pagado_quincena" | "pagado_fin_mes">>,
  ) => {
    const { error } = fila.id
      ? await supabase.from("nomina_mensual").update(cambios).eq("id", fila.id)
      : await supabase.from("nomina_mensual").insert({
          periodo,
          personal_id: fila.personal_id,
          ...cambios,
        });
    if (error) {
      toast.error(error.message);
      return;
    }
    void nomina.refetch();
  };

  const marcarTodos = async (campo: "pagado_quincena" | "pagado_fin_mes", valor: boolean) => {
    const ids = (nomina.data ?? []).map((f) => f.id);
    if (!ids.length) return;
    const { error } = await supabase
      .from("nomina_mensual")
      .update({ [campo]: valor })
      .in("id", ids);
    if (error) { toast.error(error.message); return; }
    void nomina.refetch();
  };

  const abrirMes = async () => {
    setGuardando(true);
    const anterior = periodoAnterior(periodo);
    const { data: previo, error: errPrevio } = await supabase
      .from("nomina_mensual")
      .select("personal_id, liquido_liquidacion, bonificacion_extra, bono_base")
      .eq("periodo", anterior);
    if (errPrevio) {
      setGuardando(false);
      { toast.error(errPrevio.message); return; }
    }
    const fuente = (previo ?? []).length
      ? (previo ?? []).map((r) => ({
          periodo,
          personal_id: r.personal_id,
          liquido_liquidacion: r.liquido_liquidacion,
          bonificacion_extra: r.bonificacion_extra,
          bono_base: r.bono_base,
        }))
      : (personal.data ?? [])
          .filter((p) => p.estado === "activo")
          .map((p) => ({
            periodo,
            personal_id: p.id,
            liquido_liquidacion: p.liquido_liquidacion,
            bonificacion_extra: p.bonificacion_extra,
            bono_base: p.bono_variable_referencia,
          }));
    const nuevas = fuente.filter((f) => !porPersona.has(f.personal_id));
    if (!nuevas.length) {
      setGuardando(false);
      return toast.info("El mes ya está abierto para todo el personal");
    }
    const { error } = await supabase.from("nomina_mensual").insert(nuevas);
    setGuardando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${mesTexto(periodo)} abierto con faltas y atrasos en cero`);
    void nomina.refetch();
    void periodosCargados.refetch();
  };

  if (!autorizado) return <SinAccesoFinanzas />;

  return (
    <div className="mx-auto max-w-[110rem]">
      <EncabezadoFinanzas
        titulo="Remuneraciones"
        descripcion={DESC}
        acciones={
          <>
            <SelectorPeriodo
              periodo={periodo}
              onCambiar={setPeriodo}
              opciones={[...new Set([...PERIODOS_BASE, ...(periodosCargados.data ?? [])])]}
            />
            <Button onClick={() => void abrirMes()} disabled={guardando}>
              <CopyPlus className="size-4" /> Abrir mes
            </Button>
          </>
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total líquido del mes", valor: totales.totalLiquido },
          { label: "Bonos a pagar", valor: totales.bono },
          { label: `Quincena (día ${params["dia_quincena"] ?? 15})`, valor: totales.quincena },
          { label: `Fin de mes (día ${params["dia_fin_mes"] ?? 30})`, valor: totales.finMes },
        ].map((m) => (
          <div key={m.label} className="glass p-5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {m.label}
            </p>
            <p className="num mt-2 font-display text-2xl font-semibold">{formatCLP(m.valor)}</p>
          </div>
        ))}
      </div>

      <div className="glass mt-4 flex flex-wrap items-center gap-2 p-4 text-sm">
        <span className="text-muted-foreground">Marcar el mes completo:</span>
        <Button variant="secondary" size="sm" onClick={() => void marcarTodos("pagado_quincena", true)}>
          Quincena pagada
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void marcarTodos("pagado_fin_mes", true)}>
          Fin de mes pagado
        </Button>
        <span className="num ml-auto text-muted-foreground">
          {totales.faltas} faltas · {totales.atrasos} atrasos · costo empresa{" "}
          {formatCLP(totales.totalLiquido + totales.carga)}
        </span>
      </div>

      <div className="solid-panel mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-3 font-medium">Persona</th>
                <th className="px-3 py-3 font-medium">Asignación</th>
                <th className="px-3 py-3 font-medium">Tipo</th>
                <th className="px-3 py-3 text-right font-medium">Líquido</th>
                <th className="px-3 py-3 text-right font-medium">Bonificación</th>
                <th className="px-3 py-3 text-right font-medium">Total líquido</th>
                <th className="px-3 py-3 text-right font-medium">Bono base</th>
                <th className="px-3 py-3 text-center font-medium">Faltas</th>
                <th className="px-3 py-3 text-center font-medium">Atrasos</th>
                <th className="px-3 py-3 text-right font-medium">Bono a pagar</th>
                <th className="px-3 py-3 text-right font-medium">Quincena</th>
                <th className="px-3 py-3 text-right font-medium">Fin de mes</th>
                <th className="px-3 py-3 text-right font-medium">Total</th>
                <th className="px-3 py-3 text-center font-medium">Q1</th>
                <th className="px-3 py-3 text-center font-medium">Q2</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ persona, fila, calc }) => (
                <tr
                  key={persona.id}
                  className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                >
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      {persona.nombre}
                      {persona.revisar && (
                        <AlertTriangle
                          className="size-3.5 text-warning"
                          aria-label="Datos por revisar"
                        />
                      )}
                    </span>
                    <span className="block text-[12px] text-muted-foreground">
                      {persona.cargo ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {etiquetaAsignacion(persona.asignacion)}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{etiquetaTipo(persona.tipo)}</td>
                  <td className="num px-3 py-2.5 text-right">
                    {formatCLP(fila.liquido_liquidacion)}
                  </td>
                  <td className="num px-3 py-2.5 text-right">
                    {formatCLP(fila.bonificacion_extra)}
                  </td>
                  <td className="num px-3 py-2.5 text-right font-medium">
                    {formatCLP(calc.totalLiquido)}
                  </td>
                  <td className="num px-3 py-2.5 text-right">{formatCLP(fila.bono_base)}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      aria-label={`Faltas de ${persona.nombre}`}
                      defaultValue={fila.faltas}
                      key={`f-${fila.id}-${fila.faltas}`}
                      onBlur={(e) => {
                        const v = Math.max(0, Number(e.target.value || 0));
                        if (v !== fila.faltas) void guardarCampo(fila, { faltas: v });
                      }}
                      className="num h-8 w-16 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-center outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      aria-label={`Atrasos de ${persona.nombre}`}
                      defaultValue={fila.atrasos}
                      key={`a-${fila.id}-${fila.atrasos}`}
                      onBlur={(e) => {
                        const v = Math.max(0, Number(e.target.value || 0));
                        if (v !== fila.atrasos) void guardarCampo(fila, { atrasos: v });
                      }}
                      className="num h-8 w-16 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-center outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
                    />
                  </td>
                  <td
                    className={cn(
                      "num px-3 py-2.5 text-right",
                      calc.descuento > 0 && "text-warning",
                    )}
                  >
                    {formatCLP(calc.bonoAPagar)}
                    {calc.descuento > 0 && (
                      <span className="block text-[11px] text-muted-foreground">
                        −{Math.round(calc.descuento * 100)}%
                      </span>
                    )}
                  </td>
                  <td className="num px-3 py-2.5 text-right">{formatCLP(calc.quincena)}</td>
                  <td className="num px-3 py-2.5 text-right">{formatCLP(calc.finMes)}</td>
                  <td className="num px-3 py-2.5 text-right font-semibold">
                    {formatCLP(calc.total)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Quincena pagada a ${persona.nombre}`}
                      checked={fila.pagado_quincena}
                      onChange={(e) =>
                        void guardarCampo(fila, { pagado_quincena: e.target.checked })
                      }
                      className="size-4 accent-[var(--accent-store)]"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Fin de mes pagado a ${persona.nombre}`}
                      checked={fila.pagado_fin_mes}
                      onChange={(e) => void guardarCampo(fila, { pagado_fin_mes: e.target.checked })}
                      className="size-4 accent-[var(--accent-store)]"
                    />
                  </td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={15} className="px-4 py-10 text-center text-muted-foreground">
                    {personal.isLoading || nomina.isLoading
                      ? "Cargando nómina…"
                      : "Sin personal cargado para este mes"}
                  </td>
                </tr>
              )}
            </tbody>
            {filas.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/10 bg-white/[0.03] text-sm font-semibold">
                  <td className="px-3 py-3" colSpan={3}>
                    Totales de {mesTexto(periodo)}
                  </td>
                  <td className="num px-3 py-3 text-right">{formatCLP(totales.liquido)}</td>
                  <td className="num px-3 py-3 text-right">{formatCLP(totales.bonificacion)}</td>
                  <td className="num px-3 py-3 text-right">{formatCLP(totales.totalLiquido)}</td>
                  <td className="num px-3 py-3 text-right">{formatCLP(totales.bonoBase)}</td>
                  <td className="num px-3 py-3 text-center">{totales.faltas}</td>
                  <td className="num px-3 py-3 text-center">{totales.atrasos}</td>
                  <td className="num px-3 py-3 text-right">{formatCLP(totales.bono)}</td>
                  <td className="num px-3 py-3 text-right">{formatCLP(totales.quincena)}</td>
                  <td className="num px-3 py-3 text-right">{formatCLP(totales.finMes)}</td>
                  <td className="num px-3 py-3 text-right">{formatCLP(totales.total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Regla de bonos: cada {params["atrasos_por_falta"] ?? 2} atrasos equivalen a 1 falta
        (tolerancia de {params["tolerancia_atraso_min"] ?? 15} minutos). 1 falta descuenta{" "}
        {Math.round((params["descuento_1_falta"] ?? 0.3333) * 100)}%, 2 faltas{" "}
        {Math.round((params["descuento_2_faltas"] ?? 0.6667) * 100)}% y 3 o más el 100% del bono.
      </p>
    </div>
  );
}
