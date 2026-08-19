import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import {
  CATEGORIAS_GASTO,
  fechaCorta,
  puedeGestionarGastos,
} from "@/lib/caja";
import { NuevoGastoModal, type GastoEditable } from "@/components/gastos/NuevoGastoModal";

const DESC = "Arriendos, remuneraciones, publicidad y gastos operativos por tienda.";

export const Route = createFileRoute("/gastos")({
  head: () => ({
    meta: [
      { title: "Gastos · riff store OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Gastos · riff store OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GastosPage,
});

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

function GastosPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const autorizado = puedeGestionarGastos(rol);
  const soloTienda = rol === "jefe_tienda" ? (usuario?.tienda_id ?? null) : null;

  const [categoria, setCategoria] = useState("todas");
  const [tiendaFiltro, setTiendaFiltro] = useState("todas");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<GastoEditable | null>(null);

  const tiendas = useQuery({
    queryKey: ["tiendas-slug"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase.from("tiendas").select("id, nombre, slug");
      if (error) throw error;
      return data ?? [];
    },
  });

  const gastos = useQuery({
    queryKey: ["gastos"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gastos")
        .select("id, fecha, categoria, descripcion, monto, tienda_id, usuario_id, usuarios(nombre)")
        .order("fecha", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const nombreTienda = (id?: string | null) =>
    id ? ((tiendas.data ?? []).find((t) => t.id === id)?.nombre ?? "—") : "General";

  const filas = useMemo(() => {
    const d = desde ? new Date(`${desde}T00:00:00`).getTime() : null;
    const h = hasta ? new Date(`${hasta}T23:59:59`).getTime() : null;
    return (gastos.data ?? []).filter((g) => {
      if (categoria !== "todas" && g.categoria !== categoria) return false;
      if (tiendaFiltro === "general" && g.tienda_id) return false;
      if (tiendaFiltro !== "todas" && tiendaFiltro !== "general" && g.tienda_id !== tiendaFiltro)
        return false;
      const t = new Date(g.fecha).getTime();
      if (d && t < d) return false;
      if (h && t > h) return false;
      return true;
    });
  }, [gastos.data, categoria, tiendaFiltro, desde, hasta]);

  const total = useMemo(() => filas.reduce((a, g) => a + Number(g.monto), 0), [filas]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, number>();
    filas.forEach((g) => mapa.set(g.categoria, (mapa.get(g.categoria) ?? 0) + Number(g.monto)));
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [filas]);

  if (!autorizado) {
    return (
      <div className="glass mx-auto max-w-lg p-8 text-center">
        <h1 className="font-display text-xl">Gastos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta pantalla es solo para dirección, jefes de tienda y administración.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[92rem]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Gastos</h1>
          <p className="mt-1 text-sm text-muted-foreground">{DESC}</p>
        </div>
        <Button
          onClick={() => {
            setEditando(null);
            setModal(true);
          }}
        >
          <Plus className="size-4" /> Nuevo gasto
        </Button>
      </div>

      {/* totales del período */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[18rem_1fr]">
        <div className="glass p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total del período</p>
          <p className="num mt-1 font-display text-3xl font-semibold">{formatCLP(total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {filas.length} {filas.length === 1 ? "gasto" : "gastos"}
          </p>
        </div>
        <div className="glass p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Desglose por categoría
          </p>
          {porCategoria.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Sin gastos en el período filtrado</p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {porCategoria.map(([cat, monto]) => (
                <div
                  key={cat}
                  className="flex items-baseline justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2"
                >
                  <span className="truncate text-[13px] text-muted-foreground">{cat}</span>
                  <span className="num text-sm font-medium">{formatCLP(monto)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* filtros */}
      <div className="glass mt-6 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-44">
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Categoría
          </span>
          <select
            className={campo}
            value={categoria}
            aria-label="Filtrar por categoría"
            onChange={(e) => setCategoria(e.target.value)}
          >
            <option value="todas" className="bg-[#16131F]">
              Todas
            </option>
            {CATEGORIAS_GASTO.map((c) => (
              <option key={c} value={c} className="bg-[#16131F]">
                {c}
              </option>
            ))}
          </select>
        </div>
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
              Todas
            </option>
            <option value="general" className="bg-[#16131F]">
              General (sin tienda)
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
      </div>

      {/* tabla */}
      <div className="solid-panel mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium">Descripción</th>
                <th className="px-4 py-3 text-right font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Tienda</th>
                <th className="px-4 py-3 font-medium">Registró</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filas.map((g) => (
                <tr
                  key={g.id}
                  className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                >
                  <td className="num px-4 py-2.5">{fechaCorta(g.fecha)}</td>
                  <td className="px-4 py-2.5">{g.categoria}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{g.descripcion ?? "—"}</td>
                  <td className="num px-4 py-2.5 text-right font-medium">
                    {formatCLP(Number(g.monto))}
                  </td>
                  <td className="px-4 py-2.5">{nombreTienda(g.tienda_id)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {(g.usuarios as { nombre?: string } | null)?.nombre ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      aria-label="Editar gasto"
                      onClick={() => {
                        setEditando({
                          id: g.id,
                          categoria: g.categoria,
                          descripcion: g.descripcion,
                          monto: Number(g.monto),
                          tienda_id: g.tienda_id,
                          fecha: g.fecha,
                        });
                        setModal(true);
                      }}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.07] hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {gastos.isLoading ? "Cargando gastos…" : "Sin gastos para estos filtros"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NuevoGastoModal
        abierto={modal}
        onCerrar={() => setModal(false)}
        onGuardado={() => void gastos.refetch()}
        tiendas={(tiendas.data ?? []).map((t) => ({ id: t.id, nombre: t.nombre }))}
        soloTienda={soloTienda}
        gasto={editando}
        usuarioId={usuario?.id ?? null}
      />
    </div>
  );
}
