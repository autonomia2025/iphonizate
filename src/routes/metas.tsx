import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { STORES, formatCLP, formatNumero } from "@/lib/stores";
import { puedeVerGanancias } from "@/lib/pos";
import {
  CIERRE_CERCA,
  diasParaCierre,
  pct,
  periodoActual,
  periodoTexto,
  rangoPeriodo,
} from "@/lib/gestion";
import { PERMISOS, usePermiso } from "@/lib/permisos";
import { MetaModal, type MetaEditable } from "@/components/metas/MetaModal";
import { cn } from "@/lib/utils";

const DESC = "Metas mensuales de equipos y ganancia por tienda, con avance real.";

export const Route = createFileRoute("/metas")({
  head: () => ({
    meta: [
      { title: "Metas · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Metas · iPhonizate OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MetasPage,
});

const campo =
  "h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

function MetasPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const verGanancias = puedeVerGanancias(rol);
  const { permitido: puedeEditar } = usePermiso(PERMISOS.metasEditar);

  const [periodo, setPeriodo] = useState(periodoActual());
  const [editando, setEditando] = useState<MetaEditable | null>(null);

  const { inicio, fin } = useMemo(() => rangoPeriodo(periodo), [periodo]);

  const tiendas = useQuery({
    queryKey: ["tiendas-slug"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tiendas")
        .select("id, nombre, slug, es_bodega")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const metas = useQuery({
    queryKey: ["metas", periodo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("metas")
        .select("id, tienda_id, periodo, equipos_objetivo, ganancia_objetivo")
        .eq("periodo", periodo);
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = useQuery({
    queryKey: ["metas-items", periodo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venta_items")
        .select("id, equipo_id, ventas!inner(tienda_id, fecha, anulada)")
        .not("equipo_id", "is", null)
        .gte("ventas.fecha", inicio.toISOString())
        .lt("ventas.fecha", fin.toISOString())
        .eq("ventas.anulada", false)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; ventas: { tienda_id: string } }[];
    },
  });

  const ganancias = useQuery({
    queryKey: ["metas-ganancias", periodo],
    enabled: verGanancias,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_ventas_full")
        .select("id, tienda_id, ganancia, fecha, anulada")
        .gte("fecha", inicio.toISOString())
        .lt("fecha", fin.toISOString())
        .eq("anulada", false)
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const visibles = useMemo(() => {
    const lista = (tiendas.data ?? []).filter((t) => !t.es_bodega);
    if (rol === "jefe_tienda" || rol === "vendedor") {
      return lista.filter((t) => t.id === usuario?.tienda_id);
    }
    return lista;
  }, [tiendas.data, rol, usuario?.tienda_id]);

  const equiposPorTienda = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const it of items.data ?? []) {
      const id = it.ventas?.tienda_id;
      if (id) acc[id] = (acc[id] ?? 0) + 1;
    }
    return acc;
  }, [items.data]);

  const gananciaPorTienda = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const v of ganancias.data ?? []) {
      const id = v.tienda_id as string;
      acc[id] = (acc[id] ?? 0) + Number(v.ganancia ?? 0);
    }
    return acc;
  }, [ganancias.data]);

  const restanDias = diasParaCierre(periodo);
  const cerca = restanDias <= CIERRE_CERCA;

  return (
    <div className="mx-auto max-w-[86rem] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Metas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {periodoTexto(periodo)} ·{" "}
            <span className={cn(cerca && "text-amber-300")}>
              {restanDias === 0 ? "último día del mes" : `quedan ${restanDias} días`}
            </span>
          </p>
        </div>
        <input
          type="month"
          className={`${campo} num`}
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value || periodoActual())}
        />
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibles.map((t) => {
          const meta = (metas.data ?? []).find((m) => m.tienda_id === t.id);
          const accent = STORES.find((s) => s.id === t.slug)?.accent ?? "var(--accent-store)";
          const equipos = equiposPorTienda[t.id] ?? 0;
          const objEquipos = meta?.equipos_objetivo ?? 0;
          const faltanEquipos = Math.max(0, objEquipos - equipos);
          const avanceEquipos = pct(equipos, objEquipos);
          const ganancia = gananciaPorTienda[t.id] ?? 0;
          const objGanancia = meta?.ganancia_objetivo ?? 0;
          const avanceGanancia = pct(ganancia, objGanancia);

          return (
            <article key={t.id} className="glass flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-sm font-semibold" style={{ color: accent }}>
                  {t.nombre}
                </h2>
                {!meta && (
                  <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-muted-foreground">
                    sin meta
                  </span>
                )}
              </div>

              <p className="num mt-4 text-[1.7rem] font-semibold leading-none">
                {objEquipos > 0
                  ? `llevan ${formatNumero(equipos)} de ${formatNumero(objEquipos)} equipos`
                  : `${formatNumero(equipos)} equipos vendidos`}
              </p>

              <div className="mt-4 h-3 w-full overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.04]">
                <div
                  className="h-full rounded-full transition-[width] duration-200"
                  style={{
                    width: `${avanceEquipos}%`,
                    background: `linear-gradient(90deg, color-mix(in oklab, ${accent} 55%, transparent), ${accent})`,
                  }}
                />
              </div>
              <p className="num mt-2 text-[12px]" style={{ color: accent }}>
                {avanceEquipos}% de la meta de equipos
              </p>

              {objEquipos > 0 && cerca && faltanEquipos > 0 && (
                <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.08] p-3 text-[12px] text-amber-200">
                  Faltan <span className="num font-semibold">{faltanEquipos}</span> equipos y quedan{" "}
                  <span className="num font-semibold">{restanDias}</span> días de mes.
                </p>
              )}

              {verGanancias && (
                <div className="mt-4 border-t border-white/[0.06] pt-4">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Ganancia
                  </p>
                  <div className="mt-1 flex items-end justify-between gap-2">
                    <p className="num text-base font-semibold text-positive">
                      {formatCLP(ganancia)}
                    </p>
                    <p className="num text-[12px] text-muted-foreground">
                      de {formatCLP(objGanancia)}
                    </p>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.04]">
                    <div
                      className="h-full rounded-full bg-positive/70 transition-[width] duration-200"
                      style={{ width: `${avanceGanancia}%` }}
                    />
                  </div>
                  <p className="num mt-1.5 text-[12px] text-muted-foreground">
                    {avanceGanancia}% de la meta de ganancia
                  </p>
                </div>
              )}

              {puedeEditar && (
                <Button
                  variant="ghost"
                  className="mt-4 self-start"
                  onClick={() =>
                    setEditando({
                      id: meta?.id,
                      tienda_id: t.id,
                      tienda_nombre: t.nombre,
                      equipos_objetivo: meta?.equipos_objetivo ?? 0,
                      ganancia_objetivo: meta?.ganancia_objetivo ?? 0,
                    })
                  }
                >
                  <Target className="size-4" /> {meta ? "Editar meta" : "Definir meta"}
                </Button>
              )}
            </article>
          );
        })}
        {visibles.length === 0 && (
          <p className="glass p-6 text-center text-sm text-muted-foreground">
            No hay tiendas visibles para tu perfil.
          </p>
        )}
      </section>

      <MetaModal
        abierto={!!editando}
        periodo={periodo}
        meta={editando}
        verGanancias={verGanancias}
        onCerrar={() => setEditando(null)}
        onGuardado={() => void metas.refetch()}
      />
    </div>
  );
}
