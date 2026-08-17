import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { StoreProvider, useStore } from "@/components/StoreContext";
import { AppShell } from "@/components/AppShell";
import { formatCLP, formatNumero } from "@/lib/stores";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nexus Retail · Panel de ventas multitienda" },
      {
        name: "description",
        content:
          "Panel de control multitienda para ventas, inventario y servicio técnico en Chile, con cifras en pesos y seguimiento por tienda.",
      },
      { property: "og:title", content: "Nexus Retail · Panel de ventas multitienda" },
      {
        property: "og:description",
        content:
          "Controla ventas, margen e inventario de Black Pink Phone, Riffstore, iPhonizate y Bodega en un solo panel.",
      },
    ],
  }),
  component: Pagina,
});

const METRICAS = [
  { label: "Ventas del día", valor: 4238900, delta: 12.4, sub: "37 boletas emitidas" },
  { label: "Ticket promedio", valor: 114567, delta: 3.1, sub: "vs. $111.100 ayer" },
  { label: "Margen bruto", valor: 1284300, delta: -2.7, sub: "30,3% sobre ventas" },
  { label: "Por cobrar", valor: 892450, delta: 8.9, sub: "6 ventas en cuotas" },
];

const VENTAS = [
  { boleta: "B-10482", hora: "18:42", cliente: "Javiera Contreras", producto: "iPhone 13 128GB", pago: "Débito", unidades: 1, total: 489990, margen: 78400 },
  { boleta: "B-10481", hora: "18:15", cliente: "Rodrigo Salas", producto: "Cable USB-C 2m", pago: "Efectivo", unidades: 3, total: 26970, margen: 12300 },
  { boleta: "B-10480", hora: "17:58", cliente: "Constanza Pérez", producto: "Cambio de pantalla A54", pago: "Transferencia", unidades: 1, total: 89900, margen: 41200 },
  { boleta: "B-10479", hora: "17:31", cliente: "Matías Fuentes", producto: "Galaxy S23 256GB", pago: "Crédito 3 cuotas", unidades: 1, total: 749900, margen: 96500 },
  { boleta: "B-10478", hora: "16:47", cliente: "Ignacia Rojas", producto: "Audífonos Buds 3", pago: "Débito", unidades: 2, total: 119800, margen: 34600 },
  { boleta: "B-10477", hora: "16:22", cliente: "Público general", producto: "Lámina hidrogel", pago: "Efectivo", unidades: 5, total: 24750, margen: 15900 },
  { boleta: "B-10476", hora: "15:54", cliente: "Felipe Aravena", producto: "Batería iPhone 11", pago: "Transferencia", unidades: 1, total: 44990, margen: 21100 },
  { boleta: "B-10475", hora: "15:09", cliente: "Camila Vergara", producto: "Xiaomi Redmi Note 13", pago: "Débito", unidades: 1, total: 219990, margen: 38700 },
];

function Metrica({ label, valor, delta, sub }: (typeof METRICAS)[number]) {
  const positivo = delta >= 0;
  return (
    <article className="glass p-5 transition-colors hover:bg-white/[0.07]">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="num mt-3 text-[1.75rem] font-semibold leading-none">{formatCLP(valor)}</p>
      <div className="mt-3 flex items-center gap-2">
        <span
          className={cn(
            "num inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
            positivo ? "bg-positive/12 text-positive" : "bg-destructive/12 text-destructive",
          )}
        >
          {positivo ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
          {formatNumero(Math.abs(delta))}%
        </span>
        <span className="text-xs text-muted-foreground">{sub}</span>
      </div>
    </article>
  );
}

function Contenido() {
  const { store } = useStore();
  const totalDia = VENTAS.reduce((a, v) => a + v.total, 0);

  return (
    <div className="mx-auto max-w-[86rem] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Resumen de hoy</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lunes 17 de agosto · <span style={{ color: store.accent }}>{store.nombre}</span>
          </p>
        </div>
        <div className="glass flex items-center gap-1 p-1">
          {["Hoy", "7 días", "Mes", "Año"].map((r, i) => (
            <button
              key={r}
              className={cn(
                "rounded-xl px-3.5 py-1.5 text-xs transition-colors",
                i === 0 ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              style={i === 0 ? { color: store.accent } : undefined}
            >
              {r}
            </button>
          ))}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {METRICAS.map((m) => (
          <Metrica key={m.label} {...m} />
        ))}
      </section>

      <section className="solid-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
          <h2 className="font-display text-sm font-medium">Últimas ventas</h2>
          <span className="num text-xs text-muted-foreground">
            {VENTAS.length} boletas · {formatCLP(totalDia)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Boleta</th>
                <th className="px-3 py-2.5 font-medium">Hora</th>
                <th className="px-3 py-2.5 font-medium">Cliente</th>
                <th className="px-3 py-2.5 font-medium">Producto</th>
                <th className="px-3 py-2.5 font-medium">Pago</th>
                <th className="px-3 py-2.5 text-right font-medium">Un.</th>
                <th className="px-3 py-2.5 text-right font-medium">Total</th>
                <th className="px-5 py-2.5 text-right font-medium">Margen</th>
              </tr>
            </thead>
            <tbody>
              {VENTAS.map((v) => (
                <tr
                  key={v.boleta}
                  className="border-t border-white/[0.05] transition-colors hover:bg-surface-alt/60"
                >
                  <td className="num px-5 py-2.5">{v.boleta}</td>
                  <td className="num px-3 py-2.5 text-muted-foreground">{v.hora}</td>
                  <td className="px-3 py-2.5">{v.cliente}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{v.producto}</td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-xs text-muted-foreground">
                      {v.pago}
                    </span>
                  </td>
                  <td className="num px-3 py-2.5 text-right">{v.unidades}</td>
                  <td className="num px-3 py-2.5 text-right font-medium">{formatCLP(v.total)}</td>
                  <td className="num px-5 py-2.5 text-right text-positive">{formatCLP(v.margen)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface-alt/40">
                <td className="px-5 py-3 text-xs uppercase tracking-[0.12em] text-muted-foreground" colSpan={6}>
                  Total del día
                </td>
                <td className="num px-3 py-3 text-right font-semibold">{formatCLP(totalDia)}</td>
                <td className="num px-5 py-3 text-right font-semibold text-positive">
                  {formatCLP(VENTAS.reduce((a, v) => a + v.margen, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

function Pagina() {
  return (
    <StoreProvider>
      <AppShell>
        <Contenido />
      </AppShell>
    </StoreProvider>
  );
}
