import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Search, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { descargarCsv } from "@/lib/importar";
import { formatCLP } from "@/lib/stores";
import { fechaLarga } from "@/lib/inventario";

const DESC = "Cartera de clientes por tienda con contacto, compras y total gastado.";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Clientes · iPhonizate OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientesPage,
});

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

function ClientesPage() {
  const { usuario } = useAuth();
  const [busqueda, setBusqueda] = useState("");
  const [tiendaFiltro, setTiendaFiltro] = useState<string>("");

  const tiendas = useQuery({
    queryKey: ["tiendas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tiendas").select("id, nombre").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientes = useQuery({
    queryKey: ["clientes-cartera"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nombre, telefono, correo, instagram, tienda_id, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const ventas = useQuery({
    queryKey: ["ventas-por-cliente"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ventas")
        .select("cliente_id, total, fecha")
        .eq("anulada", false)
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const resumen = useMemo(() => {
    const mapa = new Map<string, { compras: number; total: number; ultima: string | null }>();
    for (const v of ventas.data ?? []) {
      if (!v.cliente_id) continue;
      const actual = mapa.get(v.cliente_id) ?? { compras: 0, total: 0, ultima: null };
      actual.compras += 1;
      actual.total += Number(v.total ?? 0);
      if (!actual.ultima || new Date(v.fecha) > new Date(actual.ultima)) actual.ultima = v.fecha;
      mapa.set(v.cliente_id, actual);
    }
    return mapa;
  }, [ventas.data]);

  const nombreTienda = (id: string | null) =>
    (tiendas.data ?? []).find((t) => t.id === id)?.nombre ?? "—";

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (clientes.data ?? [])
      .filter((c) => (tiendaFiltro ? c.tienda_id === tiendaFiltro : true))
      .filter((c) =>
        q
          ? [c.nombre, c.telefono, c.correo, c.instagram]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q))
          : true,
      )
      .map((c) => {
        const r = resumen.get(c.id) ?? { compras: 0, total: 0, ultima: null };
        return { ...c, ...r };
      });
  }, [clientes.data, resumen, busqueda, tiendaFiltro]);

  const exportar = () => {
    const escapar = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const enc = ["nombre", "telefono", "correo", "instagram", "tienda", "compras", "total_gastado", "ultima_compra"];
    const cuerpo = filas.map((c) =>
      [c.nombre, c.telefono ?? "", c.correo ?? "", c.instagram ?? "", nombreTienda(c.tienda_id), c.compras, c.total, c.ultima ?? ""]
        .map(escapar)
        .join(","),
    );
    descargarCsv(`clientes-${new Date().toISOString().slice(0, 10)}.csv`, [enc.join(","), ...cuerpo].join("\n"));
  };

  const cargando = clientes.isLoading || ventas.isLoading;

  return (
    <div className="mx-auto max-w-[86rem] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">{DESC}</p>
        </div>
        <Button variant="secondary" className="gap-2" onClick={exportar} disabled={filas.length === 0}>
          <Download className="size-4" /> Exportar CSV
        </Button>
      </div>

      <div className="glass flex flex-wrap items-center gap-3 p-4">
        <label className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            className={`${campo} pl-9`}
            placeholder="Buscar por nombre, teléfono, correo o Instagram"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
        <select className={`${campo} max-w-[14rem]`} value={tiendaFiltro} onChange={(e) => setTiendaFiltro(e.target.value)}>
          <option value="">Todas las tiendas</option>
          {(tiendas.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
      </div>

      <section className="solid-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold">Cartera</h2>
          <span className="num text-[12px] text-muted-foreground">{filas.length} clientes</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Cliente</th>
                <th className="px-3 py-2.5 font-medium">Teléfono</th>
                <th className="px-3 py-2.5 font-medium">Correo</th>
                <th className="px-3 py-2.5 font-medium">Tienda</th>
                <th className="px-3 py-2.5 text-right font-medium">Compras</th>
                <th className="px-3 py-2.5 text-right font-medium">Total gastado</th>
                <th className="px-5 py-2.5 font-medium">Última compra</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => (
                <tr key={c.id} className="border-t border-white/[0.05] transition-colors duration-200 hover:bg-surface-alt">
                  <td className="px-5 py-2.5 font-medium">
                    {c.nombre}
                    {c.instagram && <span className="ml-2 text-xs text-muted-foreground">{c.instagram}</span>}
                  </td>
                  <td className="num px-3 py-2.5 text-muted-foreground">{c.telefono ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{c.correo ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{nombreTienda(c.tienda_id)}</td>
                  <td className="num px-3 py-2.5 text-right">{c.compras}</td>
                  <td className="num px-3 py-2.5 text-right">{formatCLP(c.total)}</td>
                  <td className="num px-5 py-2.5 text-muted-foreground">{c.ultima ? fechaLarga(c.ultima) : "—"}</td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                    {cargando ? (
                      "Cargando clientes…"
                    ) : (
                      <span className="flex flex-col items-center gap-2">
                        <Users className="size-5" />
                        {usuario?.tienda_id
                          ? "Tu tienda todavía no tiene clientes registrados."
                          : "Todavía no hay clientes en la cartera."}
                      </span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
