import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { formatCLP } from "@/lib/stores";
import {
  calcularNomina,
  mesTexto,
  repartirPorMarca,
  type FilaNomina,
  type PersonaFinanzas,
} from "@/lib/finanzas";
import { EncabezadoFinanzas, SinAccesoFinanzas, useFinanzas } from "@/components/finanzas/MarcoFinanzas";
import { cn } from "@/lib/utils";

const DESC =
  "Los meses cargados lado a lado: ingresos, nómina, gastos fijos y variables, impuestos y resultado.";

export const Route = createFileRoute("/finanzas/resumen")({
  head: () => ({
    meta: [
      { title: "Resumen financiero · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Resumen financiero · iPhonizate OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResumenPage,
});

function ResumenPage() {
  const { autorizado, params, marcas } = useFinanzas("resumen");

  const personal = useQuery({
    queryKey: ["finanzas-personal"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal")
        .select("id, nombre, tipo, estado, asignacion")
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as unknown as PersonaFinanzas[];
    },
  });

  const nomina = useQuery({
    queryKey: ["finanzas-nomina-todo"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nomina_mensual")
        .select(
          "id, periodo, personal_id, liquido_liquidacion, bonificacion_extra, bono_base, faltas, atrasos, otros_descuentos, pagado_quincena, pagado_fin_mes, notas",
        )
        .order("periodo")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as unknown as FilaNomina[];
    },
  });

  const gastos = useQuery({
    queryKey: ["finanzas-gastos-todo"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gastos")
        .select("id, periodo, tipo, monto, asignacion")
        .not("periodo", "is", null)
        .in("tipo", ["fijo", "variable"])
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const impuestos = useQuery({
    queryKey: ["finanzas-impuestos-todo"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("impuestos_mensuales")
        .select("periodo, monto")
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const ventas = useQuery({
    queryKey: ["finanzas-ingresos"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ventas")
        .select("total, fecha, anulada, tienda_id")
        .eq("anulada", false)
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const tiendas = useQuery({
    queryKey: ["tiendas-slug"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase.from("tiendas").select("id, nombre, slug");
      if (error) throw error;
      return data ?? [];
    },
  });

  const persona = useMemo(() => {
    const m = new Map<string, PersonaFinanzas>();
    (personal.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [personal.data]);

  const periodos = useMemo(() => {
    const set = new Set<string>();
    (nomina.data ?? []).forEach((n) => set.add(n.periodo));
    (gastos.data ?? []).forEach((g) => g.periodo && set.add(g.periodo));
    (impuestos.data ?? []).forEach((i) => set.add(i.periodo));
    return [...set].sort();
  }, [nomina.data, gastos.data, impuestos.data]);

  const slugPorTienda = useMemo(() => {
    const m = new Map<string, string>();
    (tiendas.data ?? []).forEach((t) => m.set(t.id, t.slug));
    return m;
  }, [tiendas.data]);

  const columnas = useMemo(
    () =>
      periodos.map((per) => {
        const filas = (nomina.data ?? []).filter((n) => n.periodo === per);
        const nominaTotal = filas.reduce((a, f) => {
          const c = calcularNomina(f, persona.get(f.personal_id)?.tipo ?? "sin_contrato", params);
          return a + c.costoEmpresa + c.bonoAPagar;
        }, 0);
        const gs = (gastos.data ?? []).filter((g) => g.periodo === per);
        const fijos = gs.filter((g) => g.tipo === "fijo").reduce((a, g) => a + Number(g.monto), 0);
        const variables = gs
          .filter((g) => g.tipo === "variable")
          .reduce((a, g) => a + Number(g.monto), 0);
        const imp = (impuestos.data ?? [])
          .filter((i) => i.periodo === per)
          .reduce((a, i) => a + Number(i.monto), 0);
        const ingresos = (ventas.data ?? [])
          .filter((v) => String(v.fecha).slice(0, 7) === per)
          .reduce((a, v) => a + Number(v.total), 0);
        const egresos = nominaTotal + fijos + variables + imp;
        return { periodo: per, ingresos, nominaTotal, fijos, variables, imp, egresos, resultado: ingresos - egresos };
      }),
    [periodos, nomina.data, gastos.data, impuestos.data, ventas.data, persona, params],
  );

  const totalFila = (campo: keyof (typeof columnas)[number]) =>
    columnas.reduce((a, c) => a + Number(c[campo] ?? 0), 0);

  /* Costo total por marca: nómina asignada + gastos, con prorrateo de lo compartido */
  const costoPorMarca = useMemo(() => {
    const filasNomina = (nomina.data ?? []).map((f) => {
      const p = persona.get(f.personal_id);
      const c = calcularNomina(f, p?.tipo ?? "sin_contrato", params);
      return { asignacion: p?.asignacion ?? "compartido", monto: c.costoEmpresa + c.bonoAPagar };
    });
    const filasGastos = (gastos.data ?? []).map((g) => ({
      asignacion: g.asignacion ?? "compartido",
      monto: Number(g.monto),
    }));
    const filasImp = (impuestos.data ?? []).map((i) => ({
      asignacion: "compartido",
      monto: Number(i.monto),
    }));
    return repartirPorMarca([...filasNomina, ...filasGastos, ...filasImp], params, marcas);
  }, [nomina.data, gastos.data, impuestos.data, persona, params, marcas]);

  const ingresosPorMarca = useMemo(() => {
    const acc: Record<string, number> = Object.fromEntries(marcas.map((m) => [m.valor, 0]));
    (ventas.data ?? []).forEach((v) => {
      const slug = slugPorTienda.get(v.tienda_id);
      if (slug && slug in acc) acc[slug] = (acc[slug] ?? 0) + Number(v.total);
    });
    return acc;
  }, [ventas.data, slugPorTienda, marcas]);

  if (!autorizado) return <SinAccesoFinanzas />;

  const lineas: { label: string; campo: keyof (typeof columnas)[number]; signo?: -1 }[] = [
    { label: "Ingresos totales", campo: "ingresos" },
    { label: "(−) Costo de nómina", campo: "nominaTotal", signo: -1 },
    { label: "(−) Gastos fijos", campo: "fijos", signo: -1 },
    { label: "(−) Gastos variables", campo: "variables", signo: -1 },
    { label: "(−) Impuestos y cotizaciones", campo: "imp", signo: -1 },
  ];

  return (
    <div className="mx-auto max-w-[100rem]">
      <EncabezadoFinanzas titulo="Resumen financiero" descripcion={DESC} />

      <div className="solid-panel mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-3 font-medium">Concepto</th>
                {columnas.map((c) => (
                  <th key={c.periodo} className="px-3 py-3 text-right font-medium">
                    {mesTexto(c.periodo)}
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr
                  key={l.label}
                  className="border-b border-white/5 transition-colors duration-200 hover:bg-white/[0.035]"
                >
                  <td className="px-3 py-2.5">{l.label}</td>
                  {columnas.map((c) => (
                    <td key={c.periodo} className="num px-3 py-2.5 text-right">
                      {formatCLP(Number(c[l.campo]) * (l.signo ?? 1))}
                    </td>
                  ))}
                  <td className="num px-3 py-2.5 text-right font-medium">
                    {formatCLP(totalFila(l.campo) * (l.signo ?? 1))}
                  </td>
                </tr>
              ))}
              <tr className="border-b border-white/5 bg-white/[0.02] font-semibold">
                <td className="px-3 py-3">Resultado del mes</td>
                {columnas.map((c) => (
                  <td
                    key={c.periodo}
                    className={cn(
                      "num px-3 py-3 text-right",
                      c.resultado < 0 ? "text-destructive" : "text-emerald-300",
                    )}
                  >
                    {formatCLP(c.resultado)}
                  </td>
                ))}
                <td
                  className={cn(
                    "num px-3 py-3 text-right",
                    totalFila("resultado") < 0 ? "text-destructive" : "text-emerald-300",
                  )}
                >
                  {formatCLP(totalFila("resultado"))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="mt-8 font-display text-lg font-semibold">Costo total por marca</h2>
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        {marcas.map((m) => {
          const costo = costoPorMarca[m.valor] ?? 0;
          const ingreso = ingresosPorMarca[m.valor] ?? 0;
          return (
            <div key={m.valor} className="glass p-5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {m.label}
              </p>
              <p className="num mt-2 font-display text-2xl font-semibold">{formatCLP(costo)}</p>
              <p className="mt-2 text-[12px] text-muted-foreground">
                Ingresos del período: <span className="num">{formatCLP(ingreso)}</span>
              </p>
              <p
                className={cn(
                  "num mt-1 text-[13px] font-medium",
                  ingreso - costo < 0 ? "text-destructive" : "text-emerald-300",
                )}
              >
                Resultado {formatCLP(ingreso - costo)}
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Los ingresos vienen de las ventas registradas en el sistema. Los gastos compartidos se
        reparten en partes iguales entre las marcas activas según el prorrateo configurado.
      </p>
    </div>
  );
}
