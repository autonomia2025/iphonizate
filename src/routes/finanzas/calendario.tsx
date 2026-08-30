import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatCLP } from "@/lib/stores";
import {
  calcularNomina,
  diasHasta,
  fechaDelMes,
  fechaLarga,
  esCotizacion,
  esF29,
  mesTexto,
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
  "Las cuatro fechas de pago del mes: cotizaciones e impuestos, quincena, IVA y sueldos con bonos.";

export const Route = createFileRoute("/finanzas/calendario")({
  head: () => ({
    meta: [
      { title: "Calendario de pagos · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Calendario de pagos · iPhonizate OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarioPage,
});

function CalendarioPage() {
  const { autorizado, params } = useFinanzas("calendario");
  const [periodo, setPeriodo] = useState("2026-08");

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

  const impuestos = useQuery({
    queryKey: ["finanzas-impuestos", periodo],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("impuestos_mensuales")
        .select("id, periodo, concepto, fecha_maxima, monto, pagado, notas")
        .eq("periodo", periodo);
      if (error) throw error;
      return data ?? [];
    },
  });

  const tipoPorPersona = useMemo(() => {
    const m = new Map<string, PersonaFinanzas["tipo"]>();
    (personal.data ?? []).forEach((p) => m.set(p.id, p.tipo));
    return m;
  }, [personal.data]);

  const hitos = useMemo(() => {
    const filas = nomina.data ?? [];
    const calc = filas.map((f) =>
      calcularNomina(f, tipoPorPersona.get(f.personal_id) ?? "sin_contrato", params),
    );
    const quincena = calc.reduce((a, c) => a + c.quincena, 0);
    const finMes = calc.reduce((a, c) => a + c.finMes, 0);
    const imp = impuestos.data ?? [];
    const cot = imp.filter((i) => esCotizacion(i.concepto));
    const f29 = imp.filter((i) => esF29(i.concepto));
    const otros = imp.filter((i) => !esCotizacion(i.concepto) && !esF29(i.concepto));

    return [
      {
        key: "cotizaciones",
        titulo: "Cotizaciones previsionales e impuestos de 2ª categoría",
        fecha: fechaDelMes(periodo, params["dia_cotizaciones"] ?? 13),
        monto: [...cot, ...otros].reduce((a, i) => a + Number(i.monto), 0),
        pagado: [...cot, ...otros].length > 0 && [...cot, ...otros].every((i) => i.pagado),
        detalle: "AFP, salud, cesantía y mutual de la gente con contrato.",
        to: "/finanzas/impuestos",
      },
      {
        key: "quincena",
        titulo: "Quincena de sueldos",
        fecha: fechaDelMes(periodo, params["dia_quincena"] ?? 15),
        monto: quincena,
        pagado: filas.length > 0 && filas.every((f) => f.pagado_quincena),
        detalle: "La mitad del total líquido de cada persona.",
        to: "/finanzas/remuneraciones",
      },
      {
        key: "iva",
        titulo: "IVA, PPM y retenciones (F29)",
        fecha: fechaDelMes(periodo, params["dia_iva"] ?? 19),
        monto: f29.reduce((a, i) => a + Number(i.monto), 0),
        pagado: f29.length > 0 && f29.every((i) => i.pagado),
        detalle: "Declaración mensual de todas las empresas del holding.",
        to: "/finanzas/impuestos",
      },
      {
        key: "finmes",
        titulo: "Fin de mes: segunda mitad y bonos",
        fecha: fechaDelMes(periodo, params["dia_fin_mes"] ?? 30),
        monto: finMes,
        pagado: filas.length > 0 && filas.every((f) => f.pagado_fin_mes),
        detalle: "Resto del líquido más el bono ya ajustado por asistencia.",
        to: "/finanzas/remuneraciones",
      },
    ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  }, [nomina.data, impuestos.data, tipoPorPersona, params, periodo]);

  const totalMes = hitos.reduce((a, h) => a + h.monto, 0);
  const pendiente = hitos.filter((h) => !h.pagado).reduce((a, h) => a + h.monto, 0);

  if (!autorizado) return <SinAccesoFinanzas />;

  return (
    <div className="mx-auto max-w-[70rem]">
      <EncabezadoFinanzas
        titulo="Calendario de pagos"
        descripcion={DESC}
        acciones={<SelectorPeriodo periodo={periodo} onCambiar={setPeriodo} />}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="glass p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Compromisos de {mesTexto(periodo)}
          </p>
          <p className="num mt-2 font-display text-2xl font-semibold">{formatCLP(totalMes)}</p>
        </div>
        <div className="glass p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Aún por pagar
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

      <div className="mt-6 space-y-3">
        {hitos.map((h) => {
          const dias = diasHasta(h.fecha);
          const urgente = !h.pagado && dias >= 0 && dias <= 3;
          const vencido = !h.pagado && dias < 0;
          return (
            <div
              key={h.key}
              className={cn(
                "glass flex flex-wrap items-center gap-4 p-5",
                urgente && "border-warning/40",
                vencido && "border-destructive/40",
              )}
            >
              <span
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-xl",
                  h.pagado
                    ? "bg-emerald-500/15 text-emerald-300"
                    : vencido
                      ? "bg-destructive/15 text-destructive"
                      : urgente
                        ? "bg-warning/15 text-warning"
                        : "bg-white/[0.06] text-muted-foreground",
                )}
              >
                {h.pagado ? (
                  <CheckCircle2 className="size-5" />
                ) : vencido || urgente ? (
                  <AlertTriangle className="size-5" />
                ) : (
                  <CalendarClock className="size-5" />
                )}
              </span>
              <div className="min-w-56 flex-1">
                <p className="font-medium">{h.titulo}</p>
                <p className="text-[13px] text-muted-foreground">{h.detalle}</p>
              </div>
              <div className="min-w-40">
                <p className="num text-sm">{fechaLarga(h.fecha)}</p>
                <p className="text-[12px] text-muted-foreground">
                  {h.pagado
                    ? "Pagado"
                    : dias === 0
                      ? "Vence hoy"
                      : dias > 0
                        ? `En ${dias} ${dias === 1 ? "día" : "días"}`
                        : `Atrasado ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "día" : "días"}`}
                </p>
              </div>
              <p className="num min-w-36 text-right font-display text-lg font-semibold">
                {formatCLP(h.monto)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
