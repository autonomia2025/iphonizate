import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Clock, TrendingDown } from "lucide-react";
import { useStore } from "@/components/StoreContext";
import { formatCLP, formatNumero } from "@/lib/stores";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · riff store OS" },
      {
        name: "description",
        content:
          "Panel de operaciones para una cadena de tiendas de iPhones usados en Chile: ventas, ingresos, ganancia y stock del día.",
      },
      { property: "og:title", content: "Dashboard · riff store OS" },
      {
        property: "og:description",
        content: "Ventas, ingresos, ganancia y stock disponible por tienda, en pesos chilenos.",
      },
    ],
  }),
  component: Dashboard,
});

const METRICAS = [
  { label: "Ventas hoy", valor: "9", tipo: "num" as const, delta: 12.5, sub: "3 en cuotas" },
  { label: "Ingresos hoy", valor: formatCLP(4238900), tipo: "clp" as const, delta: 8.2, sub: "vs. $3.916.000 ayer" },
  { label: "Ganancia hoy", valor: formatCLP(884300), tipo: "clp" as const, delta: -3.4, sub: "20,9% de margen" },
  { label: "Stock disponible", valor: "142", tipo: "num" as const, delta: 2.1, sub: "18 en reserva" },
];

const ALERTAS = [
  {
    icon: AlertTriangle,
    tono: "warning" as const,
    titulo: "iPhone 13 128GB bajo stock",
    detalle: "Quedan 2 unidades y se venden 4 por semana",
  },
  {
    icon: TrendingDown,
    tono: "destructive" as const,
    titulo: "iPhone XR 64GB sin rotación",
    detalle: "63 días en vitrina · sugerido bajar a $189.990",
  },
  {
    icon: Clock,
    tono: "muted" as const,
    titulo: "Reserva por vencer",
    detalle: "Nicolás Herrera · iPhone 14 Pro 128GB · vence hoy 20:00",
  },
  {
    icon: AlertTriangle,
    tono: "warning" as const,
    titulo: "Batería bajo 85%",
    detalle: "4 equipos iPhone 12 requieren revisión antes de vender",
  },
];

const VENTAS = [
  { boleta: "B-10482", hora: "18:42", cliente: "Javiera Contreras", modelo: "iPhone 15 PRO MAX 256GB", bateria: "97%", pago: "Débito", total: 1149990, ganancia: 168400 },
  { boleta: "B-10481", hora: "18:05", cliente: "Rodrigo Salas", modelo: "iPhone 14 128GB", bateria: "91%", pago: "Transferencia", total: 549990, ganancia: 82300 },
  { boleta: "B-10480", hora: "17:26", cliente: "Constanza Pérez", modelo: "iPhone 13 PRO 256GB", bateria: "88%", pago: "Crédito 3 cuotas", total: 679990, ganancia: 96500 },
  { boleta: "B-10479", hora: "16:48", cliente: "Matías Fuentes", modelo: "iPhone 12 64GB", bateria: "86%", pago: "Efectivo", total: 329990, ganancia: 54100 },
  { boleta: "B-10478", hora: "16:11", cliente: "Ignacia Rojas", modelo: "iPhone 15 128GB", bateria: "100%", pago: "Débito", total: 799990, ganancia: 121700 },
  { boleta: "B-10477", hora: "15:34", cliente: "Felipe Aravena", modelo: "iPhone SE 2022 64GB", bateria: "94%", pago: "Transferencia", total: 249990, ganancia: 41200 },
  { boleta: "B-10476", hora: "14:57", cliente: "Camila Vergara", modelo: "iPhone 11 128GB", bateria: "89%", pago: "Débito", total: 279990, ganancia: 47800 },
  { boleta: "B-10475", hora: "13:20", cliente: "Nicolás Herrera", modelo: "iPhone 14 PRO 256GB", bateria: "93%", pago: "Crédito 6 cuotas", total: 899990, ganancia: 132900 },
];

const META_MES = 62000000;
const AVANCE_MES = 41870500;

function Metrica({ label, valor, delta, sub }: (typeof METRICAS)[number]) {
  const positivo = delta >= 0;
  return (
    <article className="glass p-5 transition-colors hover:bg-white/[0.07]">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="num mt-3 text-[1.8rem] font-semibold leading-none">{valor}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "num inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
            positivo ? "bg-positive/15 text-positive" : "bg-destructive/15 text-destructive",
          )}
        >
          {positivo ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
          {formatNumero(Math.abs(delta))}%
        </span>
        <span className="text-[11px] text-muted-foreground">{sub}</span>
      </div>
    </article>
  );
}

function Dashboard() {
  const { store } = useStore();
  const totalDia = VENTAS.reduce((a, v) => a + v.total, 0);
  const gananciaDia = VENTAS.reduce((a, v) => a + v.ganancia, 0);
  const pct = Math.round((AVANCE_MES / META_MES) * 100);

  return (
    <div className="mx-auto max-w-[86rem] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Resumen del día</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operación de <span style={{ color: store.accent }}>{store.nombre}</span> · turno abierto
            a las 10:30
          </p>
        </div>
        <div className="glass flex items-center gap-1 p-1">
          {["Hoy", "7 días", "Mes"].map((r, i) => (
            <button
              key={r}
              className={cn(
                "rounded-xl px-3.5 py-1.5 text-xs transition-colors",
                i === 0
                  ? "bg-white/[0.08]"
                  : "text-muted-foreground hover:text-foreground",
              )}
              style={i === 0 ? { color: store.accent } : undefined}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {METRICAS.map((m) => (
          <Metrica key={m.label} {...m} />
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        {/* Alertas */}
        <section className="glass p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold">Alertas de stock y rotación</h2>
            <span className="num rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-muted-foreground">
              {ALERTAS.length} activas
            </span>
          </div>
          <ul className="mt-4 space-y-2.5">
            {ALERTAS.map((a) => (
              <li
                key={a.titulo}
                className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]"
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                    a.tono === "warning" && "bg-warning/15 text-warning",
                    a.tono === "destructive" && "bg-destructive/15 text-destructive",
                    a.tono === "muted" && "bg-white/[0.06] text-muted-foreground",
                  )}
                >
                  <a.icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{a.titulo}</span>
                  <span className="block text-[12px] text-muted-foreground">{a.detalle}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Meta del mes */}
        <section className="glass flex flex-col p-5">
          <h2 className="font-display text-sm font-semibold">Meta del mes · agosto</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Faltan {formatCLP(META_MES - AVANCE_MES)} en 14 días hábiles
          </p>

          <div className="mt-6 flex items-end justify-between gap-3">
            <p className="num text-[1.9rem] font-semibold leading-none">
              {formatCLP(AVANCE_MES)}
            </p>
            <p className="num text-sm text-muted-foreground">de {formatCLP(META_MES)}</p>
          </div>

          <div className="mt-4 h-3 w-full overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.04]">
            <div
              className="h-full rounded-full transition-[width] duration-200"
              style={{
                width: `${pct}%`,
                background: `linear-gradient(90deg, color-mix(in oklab, ${store.accent} 55%, transparent), ${store.accent})`,
                boxShadow: `0 0 20px -4px ${store.hex}`,
              }}
            />
          </div>
          <p className="num mt-2 text-[12px]" style={{ color: store.accent }}>
            {pct}% cumplido
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Ticket promedio
              </p>
              <p className="num mt-1 text-base font-semibold">{formatCLP(totalDia / VENTAS.length)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Ganancia del día
              </p>
              <p className="num mt-1 text-base font-semibold text-positive">
                {formatCLP(gananciaDia)}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Tabla sólida */}
      <section className="solid-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold">Últimas ventas</h2>
          <span className="num text-[12px] text-muted-foreground">
            {VENTAS.length} boletas · {formatCLP(totalDia)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[54rem] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Boleta</th>
                <th className="px-3 py-2.5 font-medium">Hora</th>
                <th className="px-3 py-2.5 font-medium">Cliente</th>
                <th className="px-3 py-2.5 font-medium">Equipo</th>
                <th className="px-3 py-2.5 text-right font-medium">Batería</th>
                <th className="px-3 py-2.5 font-medium">Pago</th>
                <th className="px-3 py-2.5 text-right font-medium">Total</th>
                <th className="px-5 py-2.5 text-right font-medium">Ganancia</th>
              </tr>
            </thead>
            <tbody>
              {VENTAS.map((v) => (
                <tr
                  key={v.boleta}
                  className="border-t border-white/[0.05] transition-colors hover:bg-surface-alt"
                >
                  <td className="num px-5 py-2.5">{v.boleta}</td>
                  <td className="num px-3 py-2.5 text-muted-foreground">{v.hora}</td>
                  <td className="px-3 py-2.5">{v.cliente}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{v.modelo}</td>
                  <td className="num px-3 py-2.5 text-right">{v.bateria}</td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-muted-foreground">
                      {v.pago}
                    </span>
                  </td>
                  <td className="num px-3 py-2.5 text-right font-medium">{formatCLP(v.total)}</td>
                  <td className="num px-5 py-2.5 text-right text-positive">
                    {formatCLP(v.ganancia)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface-alt/50">
                <td
                  className="px-5 py-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                  colSpan={6}
                >
                  Total del día
                </td>
                <td className="num px-3 py-3 text-right font-semibold">{formatCLP(totalDia)}</td>
                <td className="num px-5 py-3 text-right font-semibold text-positive">
                  {formatCLP(gananciaDia)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
