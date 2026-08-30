import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { aMonto } from "@/lib/caja";
import { CONCEPTOS_IMPUESTO, esCotizacion, mesTexto } from "@/lib/finanzas";
import {
  EncabezadoFinanzas,
  SelectorPeriodo,
  SinAccesoFinanzas,
  campoFin,
  useFinanzas,
} from "@/components/finanzas/MarcoFinanzas";
import { cn } from "@/lib/utils";

const DESC = "IVA, PPM, retenciones y cotizaciones del mes con su fecha máxima y estado de pago.";

export const Route = createFileRoute("/finanzas/impuestos")({
  head: () => ({
    meta: [
      { title: "Impuestos · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Impuestos · iPhonizate OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImpuestosPage,
});

type Impuesto = {
  id: string;
  periodo: string;
  concepto: string;
  fecha_maxima: string | null;
  monto: number;
  pagado: boolean;
  notas: string | null;
};

function ImpuestosPage() {
  const { autorizado, params } = useFinanzas("impuestos");
  const [periodo, setPeriodo] = useState("2026-08");
  const [agregar, setAgregar] = useState(false);
  const [concepto, setConcepto] = useState<string>(CONCEPTOS_IMPUESTO[3]);

  const impuestos = useQuery({
    queryKey: ["finanzas-impuestos", periodo],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("impuestos_mensuales")
        .select("id, periodo, concepto, fecha_maxima, monto, pagado, notas")
        .eq("periodo", periodo)
        .order("fecha_maxima", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Impuesto[];
    },
  });

  const periodosCargados = useQuery({
    queryKey: ["finanzas-impuestos-periodos"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase.from("impuestos_mensuales").select("periodo");
      if (error) throw error;
      return [...new Set((data ?? []).map((r) => r.periodo))];
    },
  });

  const filas = impuestos.data ?? [];
  const total = useMemo(() => filas.reduce((a, i) => a + Number(i.monto), 0), [filas]);
  const pendiente = useMemo(
    () => filas.filter((i) => !i.pagado).reduce((a, i) => a + Number(i.monto), 0),
    [filas],
  );

  const actualizar = async (id: string, cambios: Partial<Impuesto>) => {
    const { error } = await supabase.from("impuestos_mensuales").update(cambios).eq("id", id);
    if (error) return toast.error(error.message);
    void impuestos.refetch();
  };

  const crear = async () => {
    const dia = esCotizacion(concepto)
      ? (params["dia_cotizaciones"] ?? 13)
      : (params["dia_iva"] ?? 19);
    const { error } = await supabase.from("impuestos_mensuales").insert({
      periodo,
      concepto,
      fecha_maxima: `${periodo}-${String(Math.round(dia)).padStart(2, "0")}`,
      monto: 0,
    });
    if (error) return toast.error(error.message);
    setAgregar(false);
    void impuestos.refetch();
  };

  if (!autorizado) return <SinAccesoFinanzas />;

  return (
    <div className="mx-auto max-w-[80rem]">
      <EncabezadoFinanzas
        titulo="Impuestos y cotizaciones"
        descripcion={DESC}
        acciones={
          <>
            <SelectorPeriodo
              periodo={periodo}
              onCambiar={setPeriodo}
              opciones={periodosCargados.data ?? []}
            />
            <Button onClick={() => setAgregar((v) => !v)}>
              <Plus className="size-4" /> Agregar concepto
            </Button>
          </>
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="glass p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Total de {mesTexto(periodo)}
          </p>
          <p className="num mt-2 font-display text-2xl font-semibold">{formatCLP(total)}</p>
        </div>
        <div className="glass p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Pendiente de pago
          </p>
          <p
            className={cn(
              "num mt-2 font-display text-2xl font-semibold",
              pendiente > 0 && "text-warning",
            )}
          >
            {formatCLP(pendiente)}
          </p>
        </div>
      </div>

      {agregar && (
        <div className="glass mt-4 flex flex-wrap items-end gap-3 p-4">
          <select
            className={`${campoFin} w-96`}
            aria-label="Concepto"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
          >
            {CONCEPTOS_IMPUESTO.map((c) => (
              <option key={c} value={c} className="bg-[#16131F]">
                {c}
              </option>
            ))}
          </select>
          <Button onClick={() => void crear()}>Agregar</Button>
        </div>
      )}

      <div className="solid-panel mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-3 font-medium">Concepto</th>
                <th className="px-3 py-3 font-medium">Fecha máxima</th>
                <th className="px-3 py-3 text-right font-medium">Monto</th>
                <th className="px-3 py-3 text-center font-medium">Pagado</th>
                <th className="px-3 py-3 font-medium">Notas</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((i) => (
                <tr
                  key={i.id}
                  className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                >
                  <td className="px-3 py-2.5">{i.concepto}</td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      aria-label={`Fecha máxima de ${i.concepto}`}
                      defaultValue={i.fecha_maxima ?? ""}
                      key={`d-${i.id}-${i.fecha_maxima}`}
                      onBlur={(e) => void actualizar(i.id, { fecha_maxima: e.target.value || null })}
                      className="num h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2 outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      aria-label={`Monto de ${i.concepto}`}
                      defaultValue={String(i.monto)}
                      key={`m-${i.id}-${i.monto}`}
                      onBlur={(e) => {
                        const v = aMonto(e.target.value);
                        if (v !== Number(i.monto)) void actualizar(i.id, { monto: v });
                      }}
                      className="num h-8 w-36 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-right outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Pagado ${i.concepto}`}
                      checked={i.pagado}
                      onChange={(e) => void actualizar(i.id, { pagado: e.target.checked })}
                      className="size-4 accent-[var(--accent-store)]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Notas de ${i.concepto}`}
                      defaultValue={i.notas ?? ""}
                      key={`n-${i.id}`}
                      onBlur={(e) => void actualizar(i.id, { notas: e.target.value || null })}
                      className="h-8 w-full min-w-56 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[13px] outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
                    />
                  </td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {impuestos.isLoading ? "Cargando impuestos…" : "Sin conceptos cargados este mes"}
                  </td>
                </tr>
              )}
            </tbody>
            {filas.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/10 bg-white/[0.03] font-semibold">
                  <td className="px-3 py-3" colSpan={2}>
                    Total del mes
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
}
