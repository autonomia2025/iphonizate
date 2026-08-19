import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ArrowUpDown } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { formatCLP, formatNumero } from "@/lib/stores";
import { puedeVerGanancias } from "@/lib/pos";
import { puedeVerCostos, diasEnStock } from "@/lib/inventario";
import { nivelSla } from "@/lib/garantias";
import {
  ATAJOS,
  desdeISO,
  diaDeFecha,
  diasDelRango,
  etiquetaDia,
  exportarCSV,
  hastaISO,
  ordenar,
  porcentaje,
  promedio,
  puedeVerReportes,
  puedeVerTodasTiendas,
  rangoDeAtajo,
  type Atajo,
  type Direccion,
} from "@/lib/reportes";

const DESC = "Ventas, margen y rotación por período y tienda.";

export const Route = createFileRoute("/reportes")({
  head: () => ({
    meta: [
      { title: "Reportes · riff store OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Reportes · riff store OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportesPage,
});

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

function Bloque({
  titulo,
  descripcion,
  onExportar,
  children,
}: {
  titulo: string;
  descripcion?: string;
  onExportar?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="glass p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-xs text-muted-foreground">{descripcion}</p>}
        </div>
        {onExportar && (
          <Button variant="outline" size="sm" onClick={onExportar}>
            <Download className="size-3.5" /> CSV
          </Button>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Metrica({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className="num mt-1 text-2xl font-semibold">{valor}</p>
    </div>
  );
}

const thBase =
  "px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground";

function ReportesPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const autorizado = puedeVerReportes(rol);
  const verGanancias = puedeVerGanancias(rol);
  const verCostos = puedeVerCostos(rol);
  const todasTiendas = puedeVerTodasTiendas(rol);

  const [atajo, setAtajo] = useState<Atajo | "">("mes");
  const [rango, setRango] = useState(() => rangoDeAtajo("mes"));
  const [tiendaSel, setTiendaSel] = useState<string>(
    todasTiendas ? "todas" : (usuario?.tienda_id ?? "todas"),
  );

  const tiendaFiltro = todasTiendas ? tiendaSel : (usuario?.tienda_id ?? "todas");
  const desde = desdeISO(rango.desde);
  const hasta = hastaISO(rango.hasta);
  const clave = [desde, hasta, tiendaFiltro];

  const tiendas = useQuery({
    queryKey: ["tiendas-reportes"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase.from("tiendas").select("id, nombre").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const usuarios = useQuery({
    queryKey: ["usuarios-reportes"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase.from("usuarios").select("id, nombre, tienda_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const ventas = useQuery({
    queryKey: ["rep-ventas", ...clave],
    enabled: autorizado,
    queryFn: async () => {
      let q = supabase
        .from("ventas")
        .select("id, total, fecha, tienda_id, vendedor_id")
        .eq("anulada", false)
        .gte("fecha", desde)
        .lte("fecha", hasta);
      if (tiendaFiltro !== "todas") q = q.eq("tienda_id", tiendaFiltro);
      const { data, error } = await q.limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const ganancias = useQuery({
    queryKey: ["rep-ganancias", ...clave],
    enabled: autorizado && verGanancias,
    queryFn: async () => {
      let q = supabase
        .from("v_ventas_full")
        .select("id, ganancia, fecha, tienda_id, vendedor_id")
        .eq("anulada", false)
        .gte("fecha", desde)
        .lte("fecha", hasta);
      if (tiendaFiltro !== "todas") q = q.eq("tienda_id", tiendaFiltro);
      const { data, error } = await q.limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = useQuery({
    queryKey: ["rep-items", ...clave],
    enabled: autorizado,
    queryFn: async () => {
      let q = supabase
        .from("venta_items")
        .select(
          "id, precio, costo_snapshot, equipo_id, equipos(modelo, gb), ventas!inner(id, fecha, tienda_id, anulada)",
        )
        .eq("ventas.anulada", false)
        .gte("ventas.fecha", desde)
        .lte("ventas.fecha", hasta)
        .not("equipo_id", "is", null);
      if (tiendaFiltro !== "todas") q = q.eq("ventas.tienda_id", tiendaFiltro);
      const { data, error } = await q.limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const stock = useQuery({
    queryKey: ["rep-stock", tiendaFiltro],
    enabled: autorizado,
    queryFn: async () => {
      let q = supabase
        .from("v_stock")
        .select("id, imei, modelo, gb, color, estado, tienda, ubicacion_id, fecha_ingreso")
        .eq("estado", "DISPONIBLE");
      if (tiendaFiltro !== "todas") q = q.eq("ubicacion_id", tiendaFiltro);
      const { data, error } = await q.limit(3000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const gastos = useQuery({
    queryKey: ["rep-gastos", ...clave],
    enabled: autorizado,
    queryFn: async () => {
      let q = supabase
        .from("gastos")
        .select("id, categoria, monto, fecha, tienda_id")
        .gte("fecha", desde)
        .lte("fecha", hasta);
      if (tiendaFiltro !== "todas") q = q.eq("tienda_id", tiendaFiltro);
      const { data, error } = await q.limit(3000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const garantias = useQuery({
    queryKey: ["rep-garantias", ...clave],
    enabled: autorizado,
    queryFn: async () => {
      let q = supabase
        .from("v_garantias")
        .select("id, falla, estado, fecha, fecha_cierre, horas, tienda_id")
        .gte("fecha", desde)
        .lte("fecha", hasta);
      if (tiendaFiltro !== "todas") q = q.eq("tienda_id", tiendaFiltro);
      const { data, error } = await q.limit(3000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const servicios = useQuery({
    queryKey: ["rep-servicios", desde, hasta],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servicios_equipo")
        .select("id, tipo, costo, estado, asignado_at, listo_at, created_at")
        .gte("created_at", desde)
        .lte("created_at", hasta)
        .limit(3000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const nombreTienda = (id?: string | null) =>
    id ? ((tiendas.data ?? []).find((t) => t.id === id)?.nombre ?? "—") : "General";
  const nombreUsuario = (id?: string | null) =>
    id ? ((usuarios.data ?? []).find((u) => u.id === id)?.nombre ?? "—") : "Sin vendedor";

  const gananciaPorVenta = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const v of ganancias.data ?? []) mapa.set(v.id as string, Number(v.ganancia ?? 0));
    return mapa;
  }, [ganancias.data]);

  /* 1. Ventas por período */
  const resumen = useMemo(() => {
    const filas = ventas.data ?? [];
    const ingresos = filas.reduce((a, v) => a + Number(v.total), 0);
    const ganancia = filas.reduce((a, v) => a + (gananciaPorVenta.get(v.id) ?? 0), 0);
    const equipos = (items.data ?? []).length;
    return { ventas: filas.length, ingresos, ganancia, equipos };
  }, [ventas.data, items.data, gananciaPorVenta]);

  const serie = useMemo(() => {
    const porDia = new Map<string, { ingresos: number; ganancia: number; ventas: number }>();
    for (const dia of diasDelRango(rango)) porDia.set(dia, { ingresos: 0, ganancia: 0, ventas: 0 });
    for (const v of ventas.data ?? []) {
      const dia = diaDeFecha(v.fecha as string);
      const actual = porDia.get(dia) ?? { ingresos: 0, ganancia: 0, ventas: 0 };
      actual.ingresos += Number(v.total);
      actual.ganancia += gananciaPorVenta.get(v.id) ?? 0;
      actual.ventas += 1;
      porDia.set(dia, actual);
    }
    return Array.from(porDia.entries()).map(([dia, d]) => ({ dia, etiqueta: etiquetaDia(dia), ...d }));
  }, [ventas.data, gananciaPorVenta, rango]);

  /* 2. Ranking de modelos */
  const [ordenModelo, setOrdenModelo] = useState<{ clave: keyof ModeloFila; dir: Direccion }>({
    clave: "unidades",
    dir: "desc",
  });

  type ModeloFila = {
    modelo: string;
    unidades: number;
    ingreso: number;
    margen: number;
  };

  const modelos = useMemo<ModeloFila[]>(() => {
    const mapa = new Map<string, { unidades: number; ingreso: number; costo: number }>();
    for (const it of items.data ?? []) {
      const eq = it.equipos as { modelo?: string; gb?: number | null } | null;
      const nombre = eq?.modelo ? `${eq.modelo}${eq.gb ? ` ${eq.gb}GB` : ""}` : "Sin modelo";
      const actual = mapa.get(nombre) ?? { unidades: 0, ingreso: 0, costo: 0 };
      actual.unidades += 1;
      actual.ingreso += Number(it.precio);
      actual.costo += Number(it.costo_snapshot ?? 0);
      mapa.set(nombre, actual);
    }
    return Array.from(mapa.entries()).map(([modelo, d]) => ({
      modelo,
      unidades: d.unidades,
      ingreso: d.ingreso,
      margen: d.unidades ? Math.round((d.ingreso - d.costo) / d.unidades) : 0,
    }));
  }, [items.data]);

  const modelosOrdenados = useMemo(
    () => ordenar(modelos, ordenModelo.clave, ordenModelo.dir),
    [modelos, ordenModelo],
  );

  const ordenarPor = (c: keyof ModeloFila) =>
    setOrdenModelo((o) =>
      o.clave === c ? { clave: c, dir: o.dir === "asc" ? "desc" : "asc" } : { clave: c, dir: "desc" },
    );

  /* 3. Vendedores */
  const vendedores = useMemo(() => {
    const mapa = new Map<string, { ventas: number; ingresos: number; equipos: number }>();
    for (const v of ventas.data ?? []) {
      const k = (v.vendedor_id as string | null) ?? "sin";
      const a = mapa.get(k) ?? { ventas: 0, ingresos: 0, equipos: 0 };
      a.ventas += 1;
      a.ingresos += Number(v.total);
      mapa.set(k, a);
    }
    for (const it of items.data ?? []) {
      const venta = it.ventas as { id?: string } | null;
      const fila = (ventas.data ?? []).find((v) => v.id === venta?.id);
      const k = (fila?.vendedor_id as string | null) ?? "sin";
      const a = mapa.get(k);
      if (a) a.equipos += 1;
    }
    return Array.from(mapa.entries())
      .map(([id, d]) => ({
        vendedor: id === "sin" ? "Sin vendedor" : nombreUsuario(id),
        equipos: d.equipos,
        ventas: d.ventas,
        ingresos: d.ingresos,
        ticket: d.ventas ? Math.round(d.ingresos / d.ventas) : 0,
      }))
      .sort((a, b) => b.ingresos - a.ingresos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventas.data, items.data, usuarios.data]);

  /* 4. Tiendas */
  const porTienda = useMemo(() => {
    const mapa = new Map<string, { ventas: number; ingresos: number; ganancia: number }>();
    for (const v of ventas.data ?? []) {
      const k = v.tienda_id as string;
      const a = mapa.get(k) ?? { ventas: 0, ingresos: 0, ganancia: 0 };
      a.ventas += 1;
      a.ingresos += Number(v.total);
      a.ganancia += gananciaPorVenta.get(v.id) ?? 0;
      mapa.set(k, a);
    }
    return Array.from(mapa.entries())
      .map(([id, d]) => ({
        tienda: nombreTienda(id),
        ventas: d.ventas,
        ingresos: d.ingresos,
        ganancia: d.ganancia,
        ticket: d.ventas ? Math.round(d.ingresos / d.ventas) : 0,
      }))
      .sort((a, b) => b.ingresos - a.ingresos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventas.data, gananciaPorVenta, tiendas.data]);

  /* 5. Rotación */
  const rotacion = useMemo(() => {
    const filas = (stock.data ?? []).map((e) => ({
      imei: e.imei as string,
      modelo: `${e.modelo}${e.gb ? ` ${e.gb}GB` : ""}`,
      tienda: (e.tienda as string | null) ?? "—",
      dias: diasEnStock(e.fecha_ingreso as string),
    }));
    return {
      promedio: promedio(filas.map((f) => f.dias)),
      total: filas.length,
      antiguos: [...filas].sort((a, b) => b.dias - a.dias).slice(0, 20),
    };
  }, [stock.data]);

  /* 6. Gastos */
  const gastosResumen = useMemo(() => {
    const filas = gastos.data ?? [];
    const total = filas.reduce((a, g) => a + Number(g.monto), 0);
    const mapa = new Map<string, number>();
    for (const g of filas) mapa.set(g.categoria, (mapa.get(g.categoria) ?? 0) + Number(g.monto));
    return {
      total,
      categorias: Array.from(mapa.entries())
        .map(([categoria, monto]) => ({ categoria, monto }))
        .sort((a, b) => b.monto - a.monto),
    };
  }, [gastos.data]);

  /* 7. Garantías */
  const garantiasResumen = useMemo(() => {
    const filas = garantias.data ?? [];
    const cerradas = filas.filter((g) => g.fecha_cierre);
    const enSla = cerradas.filter((g) => {
      const horas =
        (new Date(g.fecha_cierre as string).getTime() - new Date(g.fecha as string).getTime()) /
        3_600_000;
      return horas <= 72;
    });
    const mapa = new Map<string, number>();
    for (const g of filas) {
      const falla = (g.falla as string).trim().toLowerCase();
      mapa.set(falla, (mapa.get(falla) ?? 0) + 1);
    }
    return {
      cantidad: filas.length,
      abiertas: filas.length - cerradas.length,
      pctSobreVentas: porcentaje(filas.length, resumen.ventas),
      cumplimiento: cerradas.length ? porcentaje(enSla.length, cerradas.length) : 0,
      vencidas: filas.filter((g) => !g.fecha_cierre && nivelSla(Number(g.horas ?? 0)) === "vencida")
        .length,
      fallas: Array.from(mapa.entries())
        .map(([falla, cantidad]) => ({ falla, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 8),
    };
  }, [garantias.data, resumen.ventas]);

  /* 8. Servicio técnico */
  const tecnico = useMemo(() => {
    const filas = servicios.data ?? [];
    const listos = filas.filter((s) => s.listo_at && s.asignado_at);
    const horas = listos.map(
      (s) =>
        (new Date(s.listo_at as string).getTime() - new Date(s.asignado_at as string).getTime()) /
        3_600_000,
    );
    return {
      cantidad: filas.length,
      listos: listos.length,
      costo: filas.reduce((a, s) => a + Number(s.costo ?? 0), 0),
      horasPromedio: promedio(horas),
    };
  }, [servicios.data]);

  const aplicarAtajo = (a: Atajo) => {
    setAtajo(a);
    setRango(rangoDeAtajo(a));
  };

  if (!autorizado) {
    return (
      <div className="glass mx-auto max-w-lg p-8 text-center">
        <h1 className="font-display text-xl">Reportes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta pantalla es solo para dirección, jefes de tienda y administración.
        </p>
      </div>
    );
  }

  const sufijo = `${rango.desde}_${rango.hasta}`;

  return (
    <div className="mx-auto max-w-[92rem] pb-10">
      <div>
        <h1 className="font-display text-2xl font-semibold">Reportes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {DESC} Todo excluye las ventas anuladas.
        </p>
      </div>

      {/* filtros */}
      <div className="glass mt-6 flex flex-wrap items-end gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          {ATAJOS.map((a) => (
            <button
              key={a.valor}
              onClick={() => aplicarAtajo(a.valor)}
              className={`h-9 rounded-xl border px-3 text-sm transition-all duration-200 ${
                atajo === a.valor
                  ? "border-[var(--accent-store)]/50 bg-[var(--accent-store-soft)] text-foreground accent-glow"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div>
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Desde
          </span>
          <input
            type="date"
            aria-label="Desde"
            className={`${campo} num`}
            value={rango.desde}
            onChange={(e) => {
              setAtajo("");
              setRango((r) => ({ ...r, desde: e.target.value }));
            }}
          />
        </div>
        <div>
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Hasta
          </span>
          <input
            type="date"
            aria-label="Hasta"
            className={`${campo} num`}
            value={rango.hasta}
            onChange={(e) => {
              setAtajo("");
              setRango((r) => ({ ...r, hasta: e.target.value }));
            }}
          />
        </div>
        <div className="min-w-48">
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Tienda
          </span>
          {todasTiendas ? (
            <select
              className={campo}
              aria-label="Tienda"
              value={tiendaSel}
              onChange={(e) => setTiendaSel(e.target.value)}
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
          ) : (
            <p className="flex h-10 items-center rounded-xl border border-white/10 bg-white/[0.02] px-3 text-sm text-muted-foreground">
              {nombreTienda(usuario?.tienda_id)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-5">
        {/* 1 */}
        <Bloque
          titulo="Ventas por período"
          descripcion="Equipos vendidos, ingresos y evolución diaria."
          onExportar={() =>
            exportarCSV(
              `ventas_por_dia_${sufijo}`,
              ["Día", "Ventas", "Ingresos", ...(verGanancias ? ["Ganancia"] : [])],
              serie.map((d) => [
                d.dia,
                d.ventas,
                d.ingresos,
                ...(verGanancias ? [d.ganancia] : []),
              ]),
            )
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metrica etiqueta="Ventas" valor={formatNumero(resumen.ventas)} />
            <Metrica etiqueta="Equipos vendidos" valor={formatNumero(resumen.equipos)} />
            <Metrica etiqueta="Ingresos" valor={formatCLP(resumen.ingresos)} />
            {verGanancias ? (
              <Metrica etiqueta="Ganancia" valor={formatCLP(resumen.ganancia)} />
            ) : (
              <Metrica
                etiqueta="Ticket promedio"
                valor={formatCLP(resumen.ventas ? resumen.ingresos / resumen.ventas : 0)}
              />
            )}
          </div>
          <div className="mt-5 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="etiqueta"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                  stroke="rgba(255,255,255,0.1)"
                  tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#16131F",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number, n: string) => [formatCLP(Number(v)), n]}
                />
                <Line
                  animationDuration={900}
                  animationEasing="ease-out"
                  type="monotone"
                  dataKey="ingresos"
                  name="Ingresos"
                  stroke="var(--accent-store)"
                  strokeWidth={2}
                  dot={false}
                />
                {verGanancias && (
                  <Line
                  animationDuration={900}
                  animationEasing="ease-out"
                    type="monotone"
                    dataKey="ganancia"
                    name="Ganancia"
                    stroke="rgba(52,211,153,0.9)"
                    strokeWidth={2}
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Bloque>

        {/* 2 */}
        <Bloque
          titulo="Ranking de modelos"
          descripcion="Ordenable por cualquier columna."
          onExportar={() =>
            exportarCSV(
              `ranking_modelos_${sufijo}`,
              ["Modelo", "Unidades", "Ingreso total", ...(verCostos ? ["Margen promedio"] : [])],
              modelosOrdenados.map((m) => [
                m.modelo,
                m.unidades,
                m.ingreso,
                ...(verCostos ? [m.margen] : []),
              ]),
            )
          }
        >
          <div className="solid-panel overflow-hidden">
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#16131F]">
                  <tr className="border-b border-white/8">
                    {(
                      [
                        ["modelo", "Modelo", "left"],
                        ["unidades", "Unidades", "right"],
                        ["ingreso", "Ingreso total", "right"],
                        ...(verCostos ? [["margen", "Margen promedio", "right"]] : []),
                      ] as [keyof ModeloFila, string, string][]
                    ).map(([k, label, alin]) => (
                      <th key={k} className={`${thBase} ${alin === "right" ? "text-right" : ""}`}>
                        <button
                          onClick={() => ordenarPor(k)}
                          className={`inline-flex items-center gap-1 transition-colors duration-200 hover:text-foreground ${
                            ordenModelo.clave === k ? "text-foreground" : ""
                          }`}
                        >
                          {label} <ArrowUpDown className="size-3" />
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modelosOrdenados.map((m) => (
                    <tr
                      key={m.modelo}
                      className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                    >
                      <td className="px-4 py-2.5">{m.modelo}</td>
                      <td className="num px-4 py-2.5 text-right">{formatNumero(m.unidades)}</td>
                      <td className="num px-4 py-2.5 text-right">{formatCLP(m.ingreso)}</td>
                      {verCostos && (
                        <td className="num px-4 py-2.5 text-right">{formatCLP(m.margen)}</td>
                      )}
                    </tr>
                  ))}
                  {modelosOrdenados.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                        {items.isLoading ? "Cargando…" : "Sin ventas de equipos en el período"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Bloque>

        {/* 3 */}
        <Bloque
          titulo="Rendimiento por vendedor"
          onExportar={() =>
            exportarCSV(
              `vendedores_${sufijo}`,
              ["Vendedor", "Equipos", "Ventas", "Ingresos", "Ticket promedio"],
              vendedores.map((v) => [v.vendedor, v.equipos, v.ventas, v.ingresos, v.ticket]),
            )
          }
        >
          <div className="solid-panel overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  <th className={thBase}>Vendedor</th>
                  <th className={`${thBase} text-right`}>Equipos</th>
                  <th className={`${thBase} text-right`}>Ventas</th>
                  <th className={`${thBase} text-right`}>Ingresos</th>
                  <th className={`${thBase} text-right`}>Ticket promedio</th>
                </tr>
              </thead>
              <tbody>
                {vendedores.map((v) => (
                  <tr
                    key={v.vendedor}
                    className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                  >
                    <td className="px-4 py-2.5">{v.vendedor}</td>
                    <td className="num px-4 py-2.5 text-right">{formatNumero(v.equipos)}</td>
                    <td className="num px-4 py-2.5 text-right">{formatNumero(v.ventas)}</td>
                    <td className="num px-4 py-2.5 text-right">{formatCLP(v.ingresos)}</td>
                    <td className="num px-4 py-2.5 text-right">{formatCLP(v.ticket)}</td>
                  </tr>
                ))}
                {vendedores.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      Sin ventas en el período
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Bloque>

        {/* 4 */}
        {todasTiendas && (
          <Bloque
            titulo="Rendimiento por tienda"
            onExportar={() =>
              exportarCSV(
                `tiendas_${sufijo}`,
                [
                  "Tienda",
                  "Ventas",
                  "Ingresos",
                  "Ticket promedio",
                  ...(verGanancias ? ["Ganancia"] : []),
                ],
                porTienda.map((t) => [
                  t.tienda,
                  t.ventas,
                  t.ingresos,
                  t.ticket,
                  ...(verGanancias ? [t.ganancia] : []),
                ]),
              )
            }
          >
            <div className="solid-panel overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8">
                    <th className={thBase}>Tienda</th>
                    <th className={`${thBase} text-right`}>Ventas</th>
                    <th className={`${thBase} text-right`}>Ingresos</th>
                    <th className={`${thBase} text-right`}>Ticket promedio</th>
                    {verGanancias && <th className={`${thBase} text-right`}>Ganancia</th>}
                  </tr>
                </thead>
                <tbody>
                  {porTienda.map((t) => (
                    <tr
                      key={t.tienda}
                      className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                    >
                      <td className="px-4 py-2.5">{t.tienda}</td>
                      <td className="num px-4 py-2.5 text-right">{formatNumero(t.ventas)}</td>
                      <td className="num px-4 py-2.5 text-right">{formatCLP(t.ingresos)}</td>
                      <td className="num px-4 py-2.5 text-right">{formatCLP(t.ticket)}</td>
                      {verGanancias && (
                        <td className="num px-4 py-2.5 text-right text-emerald-300">
                          {formatCLP(t.ganancia)}
                        </td>
                      )}
                    </tr>
                  ))}
                  {porTienda.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                        Sin ventas en el período
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Bloque>
        )}

        {/* 5 */}
        <Bloque
          titulo="Rotación de inventario"
          descripcion="Equipos disponibles y su antigüedad en stock."
          onExportar={() =>
            exportarCSV(
              `rotacion_${sufijo}`,
              ["IMEI", "Modelo", "Tienda", "Días en stock"],
              rotacion.antiguos.map((e) => [e.imei, e.modelo, e.tienda, e.dias]),
            )
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Metrica etiqueta="Promedio días en stock" valor={formatNumero(rotacion.promedio)} />
            <Metrica etiqueta="Equipos disponibles" valor={formatNumero(rotacion.total)} />
          </div>
          <div className="solid-panel mt-4 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  <th className={thBase}>IMEI</th>
                  <th className={thBase}>Modelo</th>
                  <th className={thBase}>Tienda</th>
                  <th className={`${thBase} text-right`}>Días en stock</th>
                </tr>
              </thead>
              <tbody>
                {rotacion.antiguos.map((e) => (
                  <tr
                    key={e.imei}
                    className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                  >
                    <td className="num px-4 py-2.5">{e.imei}</td>
                    <td className="px-4 py-2.5">{e.modelo}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{e.tienda}</td>
                    <td
                      className={`num px-4 py-2.5 text-right ${e.dias > 50 ? "text-amber-300" : ""}`}
                    >
                      {formatNumero(e.dias)}
                    </td>
                  </tr>
                ))}
                {rotacion.antiguos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                      Sin equipos disponibles
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Bloque>

        {/* 6 */}
        <Bloque
          titulo="Gastos del período"
          onExportar={() =>
            exportarCSV(
              `gastos_${sufijo}`,
              ["Categoría", "Monto"],
              gastosResumen.categorias.map((c) => [c.categoria, c.monto]),
            )
          }
        >
          <Metrica etiqueta="Total del período" valor={formatCLP(gastosResumen.total)} />
          <div className="solid-panel mt-4 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  <th className={thBase}>Categoría</th>
                  <th className={`${thBase} text-right`}>Monto</th>
                  <th className={`${thBase} text-right`}>Participación</th>
                </tr>
              </thead>
              <tbody>
                {gastosResumen.categorias.map((c) => (
                  <tr
                    key={c.categoria}
                    className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                  >
                    <td className="px-4 py-2.5">{c.categoria}</td>
                    <td className="num px-4 py-2.5 text-right">{formatCLP(c.monto)}</td>
                    <td className="num px-4 py-2.5 text-right text-muted-foreground">
                      {porcentaje(c.monto, gastosResumen.total)}%
                    </td>
                  </tr>
                ))}
                {gastosResumen.categorias.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                      Sin gastos en el período
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Bloque>

        {/* 7 */}
        <Bloque
          titulo="Garantías del período"
          descripcion="SLA de 72 horas."
          onExportar={() =>
            exportarCSV(
              `garantias_${sufijo}`,
              ["Falla", "Casos"],
              garantiasResumen.fallas.map((f) => [f.falla, f.cantidad]),
            )
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metrica etiqueta="Garantías" valor={formatNumero(garantiasResumen.cantidad)} />
            <Metrica etiqueta="Sobre ventas" valor={`${garantiasResumen.pctSobreVentas}%`} />
            <Metrica etiqueta="Cumplimiento SLA" valor={`${garantiasResumen.cumplimiento}%`} />
            <Metrica
              etiqueta="Abiertas / vencidas"
              valor={`${garantiasResumen.abiertas} / ${garantiasResumen.vencidas}`}
            />
          </div>
          <div className="solid-panel mt-4 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  <th className={thBase}>Falla más frecuente</th>
                  <th className={`${thBase} text-right`}>Casos</th>
                </tr>
              </thead>
              <tbody>
                {garantiasResumen.fallas.map((f) => (
                  <tr
                    key={f.falla}
                    className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                  >
                    <td className="px-4 py-2.5 first-letter:uppercase">{f.falla}</td>
                    <td className="num px-4 py-2.5 text-right">{formatNumero(f.cantidad)}</td>
                  </tr>
                ))}
                {garantiasResumen.fallas.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-10 text-center text-muted-foreground">
                      Sin garantías en el período
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Bloque>

        {/* 8 */}
        <Bloque
          titulo="Servicio técnico"
          onExportar={() =>
            exportarCSV(
              `tecnico_${sufijo}`,
              [
                "Reparaciones",
                "Listas",
                "Horas promedio",
                ...(verCostos ? ["Costo total"] : []),
              ],
              [
                [
                  tecnico.cantidad,
                  tecnico.listos,
                  tecnico.horasPromedio,
                  ...(verCostos ? [tecnico.costo] : []),
                ],
              ],
            )
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metrica etiqueta="Reparaciones" valor={formatNumero(tecnico.cantidad)} />
            <Metrica etiqueta="Terminadas" valor={formatNumero(tecnico.listos)} />
            <Metrica
              etiqueta="Tiempo promedio"
              valor={`${formatNumero(tecnico.horasPromedio)} h`}
            />
            {verCostos && <Metrica etiqueta="Costo total" valor={formatCLP(tecnico.costo)} />}
          </div>
        </Bloque>
      </div>
    </div>
  );
}
