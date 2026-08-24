import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { METODO_ETIQUETA, type MetodoPago } from "@/lib/pos";
import type { AppRol } from "@/lib/nav";

const DESC = "Revisión de los pagos de cada venta: transferencias, montos y estado de control.";

export const Route = createFileRoute("/revision")({
  head: () => ({
    meta: [
      { title: "Revisión de pagos · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Revisión de pagos · iPhonizate OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RevisionPage,
});

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

const ROLES_REVISION: AppRol[] = ["direccion", "administracion"];

const ESTADOS = [
  { valor: "todos", label: "Todas" },
  { valor: "pendiente", label: "Pendientes" },
  { valor: "revisado", label: "Revisadas" },
  { valor: "problema", label: "Con problema" },
] as const;

const fechaHora = (f: string) =>
  new Date(f).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function RevisionPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const autorizado = !!rol && ROLES_REVISION.includes(rol);

  const [tiendaFiltro, setTiendaFiltro] = useState("todas");
  const [estadoFiltro, setEstadoFiltro] = useState<(typeof ESTADOS)[number]["valor"]>("pendiente");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  const tiendas = useQuery({
    queryKey: ["tiendas-slug"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase.from("tiendas").select("id, nombre, slug");
      if (error) throw error;
      return data ?? [];
    },
  });

  const ventas = useQuery({
    queryKey: ["ventas-revision"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ventas")
        .select(
          "id, fecha, total, revision, anulada, tienda_id, cliente_id, vendedor_id, clientes(nombre), usuarios(nombre), pagos(id, metodo, monto, nombre_pagador, fecha)",
        )
        .order("fecha", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const nombreTienda = (id?: string | null) =>
    (tiendas.data ?? []).find((t) => t.id === id)?.nombre ?? "—";

  const filas = useMemo(() => {
    const d = desde ? new Date(`${desde}T00:00:00`).getTime() : null;
    const h = hasta ? new Date(`${hasta}T23:59:59`).getTime() : null;
    return (ventas.data ?? []).filter((v) => {
      const rev = v.revision ?? "pendiente";
      if (estadoFiltro !== "todos" && rev !== estadoFiltro) return false;
      if (tiendaFiltro !== "todas" && v.tienda_id !== tiendaFiltro) return false;
      const t = new Date(v.fecha).getTime();
      if (d && t < d) return false;
      if (h && t > h) return false;
      return true;
    });
  }, [ventas.data, estadoFiltro, tiendaFiltro, desde, hasta]);

  const pendientes = useMemo(
    () => (ventas.data ?? []).filter((v) => (v.revision ?? "pendiente") === "pendiente").length,
    [ventas.data],
  );

  const venta = useMemo(
    () => (ventas.data ?? []).find((v) => v.id === abierta) ?? null,
    [ventas.data, abierta],
  );

  const marcar = async (estado: "revisado" | "problema") => {
    if (!venta) return;
    setGuardando(true);
    try {
      const args: { _venta: string; _estado: string; _nota?: string } = {
        _venta: venta.id,
        _estado: estado,
      };
      const notaLimpia = nota.trim();
      if (notaLimpia) args._nota = notaLimpia;
      const { error } = await supabase.rpc("marcar_revision_venta", args);
      if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
      toast.success(estado === "revisado" ? "Venta marcada como revisada" : "Problema registrado");
      setNota("");
      setAbierta(null);
      void ventas.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la revisión");
    } finally {
      setGuardando(false);
    }
  };

  if (!autorizado) {
    return (
      <div className="glass mx-auto max-w-lg p-8 text-center">
        <h1 className="font-display text-xl">Revisión de pagos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta pantalla es solo para dirección y administración.
        </p>
      </div>
    );
  }

  const badge = (rev: string) =>
    rev === "revisado"
      ? "border-emerald-400/25 bg-emerald-500/15 text-emerald-300"
      : rev === "problema"
        ? "border-red-400/25 bg-red-500/15 text-red-300"
        : "border-amber-400/25 bg-amber-500/15 text-amber-200";

  const metodosDe = (pagos: { metodo: string }[] | null) =>
    [...new Set((pagos ?? []).map((p) => METODO_ETIQUETA[p.metodo as MetodoPago] ?? p.metodo))].join(
      " · ",
    ) || "—";

  return (
    <div className="mx-auto max-w-[92rem]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Revisión de pagos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Control de las formas de pago de cada venta
          </p>
        </div>
        <div className="glass px-5 py-3 text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Pendientes de revisar
          </p>
          <p className="num font-display text-2xl font-semibold text-amber-200">{pendientes}</p>
        </div>
      </div>

      {/* filtros */}
      <div className="glass mt-6 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-44">
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Tienda
          </span>
          <select
            className={campo}
            value={tiendaFiltro}
            aria-label="Filtrar por tienda"
            onChange={(e) => setTiendaFiltro(e.target.value)}
          >
            <option value="todas" className="bg-[#16131F]">
              Todas las tiendas
            </option>
            {(tiendas.data ?? []).map((t) => (
              <option key={t.id} value={t.id} className="bg-[#16131F]">
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Desde
          </span>
          <input
            type="date"
            className={`${campo} num`}
            value={desde}
            aria-label="Desde"
            onChange={(e) => setDesde(e.target.value)}
          />
        </div>
        <div>
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Hasta
          </span>
          <input
            type="date"
            className={`${campo} num`}
            value={hasta}
            aria-label="Hasta"
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2 pb-0.5">
          {ESTADOS.map((e) => (
            <button
              key={e.valor}
              type="button"
              onClick={() => setEstadoFiltro(e.valor)}
              className={`rounded-full border px-4 py-1.5 text-xs transition-all duration-200 ${
                estadoFiltro === e.valor
                  ? "accent-glow border-[var(--accent-store)]/50 bg-[var(--accent-store-soft)] text-foreground"
                  : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {/* tabla */}
      <div className="solid-panel mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Tienda</th>
                <th className="px-4 py-3 font-medium">Vendedor</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Métodos de pago</th>
                <th className="px-4 py-3 font-medium">Revisión</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((v) => {
                const rev = v.revision ?? "pendiente";
                return (
                  <tr
                    key={v.id}
                    onClick={() => {
                      setAbierta(v.id);
                      setNota("");
                    }}
                    className={`cursor-pointer border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035] ${
                      v.anulada ? "text-muted-foreground line-through" : ""
                    }`}
                  >
                    <td className="num px-4 py-2.5 text-muted-foreground">{fechaHora(v.fecha)}</td>
                    <td className="px-4 py-2.5">{nombreTienda(v.tienda_id)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {v.usuarios?.nombre ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">{v.clientes?.nombre ?? "Sin cliente"}</td>
                    <td className="num px-4 py-2.5 text-right">{formatCLP(v.total)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{metodosDe(v.pagos)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${badge(rev)}`}>
                        {rev === "revisado"
                          ? "Revisado"
                          : rev === "problema"
                            ? "Problema"
                            : "Pendiente"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!filas.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No hay ventas con esos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* panel lateral */}
      {venta && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAbierta(null)} />
          <aside className="glass relative z-10 h-full w-full max-w-md overflow-y-auto rounded-l-2xl p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Venta · {nombreTienda(venta.tienda_id)}
                </p>
                <p className="num font-display text-3xl font-semibold">{formatCLP(venta.total)}</p>
                <p className="num mt-1 text-xs text-muted-foreground">{fechaHora(venta.fecha)}</p>
              </div>
              <button
                type="button"
                onClick={() => setAbierta(null)}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vendedor</span>
                <span>{venta.usuarios?.nombre ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente</span>
                <span>{venta.clientes?.nombre ?? "Sin cliente"}</span>
              </div>
              {venta.anulada && <p className="text-xs text-red-300">Esta venta está anulada.</p>}
            </div>

            <h3 className="mt-6 font-display text-base">Desglose de pagos</h3>
            <div className="mt-3 space-y-2">
              {(venta.pagos ?? []).map((p) => (
                <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm">
                      {METODO_ETIQUETA[p.metodo as MetodoPago] ?? p.metodo}
                    </span>
                    <span className="num text-base">{formatCLP(p.monto)}</span>
                  </div>
                  {p.nombre_pagador && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.metodo === "partePago" ? "Recibido: " : "Transfirió: "}
                      <span className="text-foreground">{p.nombre_pagador}</span>
                    </p>
                  )}
                </div>
              ))}
              {!(venta.pagos ?? []).length && (
                <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-muted-foreground">
                  Esta venta no tiene pagos registrados.
                </p>
              )}
            </div>

            <div className="mt-6 border-t border-white/8 pt-4">
              <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                Nota (obligatoria si hay problema)
              </span>
              <textarea
                className="min-h-20 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
                value={nota}
                placeholder="Ej. la transferencia no aparece en la cuenta"
                aria-label="Nota de la revisión"
                onChange={(e) => setNota(e.target.value)}
              />
              <div className="mt-3 flex gap-2">
                <Button
                  disabled={guardando}
                  onClick={() => marcar("revisado")}
                  className="accent-glow h-11 flex-1 bg-[var(--accent-store)] text-white hover:bg-[var(--accent-store)]/90"
                >
                  Marcar revisado
                </Button>
                <Button
                  disabled={guardando || !nota.trim()}
                  onClick={() => marcar("problema")}
                  className="h-11 flex-1 bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-40"
                >
                  Marcar problema
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
