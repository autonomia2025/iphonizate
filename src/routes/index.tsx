import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Clock,
  Headphones,
  ListChecks,
  PackageSearch,
  ShieldCheck,
  ShoppingBag,
  TrendingDown,
} from "lucide-react";

import { useStore } from "@/components/StoreContext";
import { useAuth } from "@/components/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatCLP, formatNumero } from "@/lib/stores";
import { equipoTexto, nivelSla, textoSla } from "@/lib/garantias";
import { puedeVerGanancias } from "@/lib/pos";
import { claveModelo } from "@/lib/pos";
import { diasEnStock } from "@/lib/inventario";
import { URGENCIA_INFO, pct, periodoActual, periodoTexto, rangoPeriodo, type Urgencia } from "@/lib/gestion";
import { cn } from "@/lib/utils";
import {
  Aparece,
  BarraProgreso,
  Cascada,
  Cifra,
  EstadoVacio,
  SkeletonFilas,
  SkeletonTarjetasMetrica,
  TarjetaViva,
  motion,
} from "@/components/motion";
import { RESORTE_RAPIDO, varsFila, varsHijo, varsListaFilas } from "@/lib/motion";

const DESC =
  "Panel de operaciones de la cadena: ventas, ingresos, ganancia, stock, alertas y metas del mes.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Dashboard · iPhonizate OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const DIAS_LIQUIDAR = 50;

function Metrica({
  label,
  valor,
  formato,
  sub,
}: {
  label: string;
  valor: number;
  formato: (n: number) => string;
  sub?: string;
}) {
  return (
    <TarjetaViva className="p-5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <Cifra
        valor={valor}
        formato={formato}
        degradada
        className="mt-3 block text-[1.8rem] font-semibold leading-none"
      />
      {sub && <p className="mt-3 text-[11px] text-muted-foreground">{sub}</p>}
    </TarjetaViva>
  );
}

type Alerta = {
  key: string;
  icon: typeof AlertTriangle;
  tono: "warning" | "destructive" | "muted";
  titulo: string;
  detalle: string;
  to?: string;
};

function Dashboard() {
  const { store } = useStore();
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const verGanancias = puedeVerGanancias(rol);

  const periodo = periodoActual();
  const { inicio: inicioMes, fin: finMes } = useMemo(() => rangoPeriodo(periodo), [periodo]);
  const inicioHoy = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const tiendas = useQuery({
    queryKey: ["tiendas-slug"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tiendas").select("id, nombre, slug, es_bodega");
      if (error) throw error;
      return data ?? [];
    },
  });
  const tienda = useMemo(
    () => (tiendas.data ?? []).find((t) => t.slug === store.id) ?? null,
    [tiendas.data, store.id],
  );

  /* Ventas del mes de la tienda activa (excluye anuladas) */
  const ventas = useQuery({
    queryKey: ["dash-ventas", tienda?.id, periodo],
    enabled: !!tienda,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ventas")
        .select("id, total, fecha, con_boleta, cliente_id, clientes(nombre)")
        .eq("tienda_id", tienda!.id)
        .eq("anulada", false)
        .gte("fecha", inicioMes.toISOString())
        .lt("fecha", finMes.toISOString())
        .order("fecha", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        total: number;
        fecha: string;
        con_boleta: boolean;
        clientes: { nombre: string } | null;
      }[];
    },
  });

  /* Ítems de equipos vendidos del mes (para conteo y modelos más vendidos) */
  const items = useQuery({
    queryKey: ["dash-items", tienda?.id, periodo],
    enabled: !!tienda,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venta_items")
        .select("id, venta_id, precio, equipos(modelo, gb, bateria), ventas!inner(tienda_id, fecha, anulada)")
        .not("equipo_id", "is", null)
        .eq("ventas.tienda_id", tienda!.id)
        .eq("ventas.anulada", false)
        .gte("ventas.fecha", inicioMes.toISOString())
        .lt("ventas.fecha", finMes.toISOString())
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        venta_id: string;
        precio: number;
        equipos: { modelo: string; gb: number | null; bateria: number | null } | null;
        ventas: { fecha: string };
      }[];
    },
  });

  const gananciasMes = useQuery({
    queryKey: ["dash-ganancias", tienda?.id, periodo],
    enabled: !!tienda && verGanancias,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_ventas_full")
        .select("id, ganancia, fecha")
        .eq("tienda_id", tienda!.id)
        .eq("anulada", false)
        .gte("fecha", inicioMes.toISOString())
        .lt("fecha", finMes.toISOString())
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; ganancia: number; fecha: string }[];
    },
  });

  /* Stock de toda la cadena */
  const stock = useQuery({
    queryKey: ["dash-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_stock")
        .select("id, imei, modelo, gb, estado, fecha_ingreso, tienda")
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        imei: string;
        modelo: string;
        gb: number | null;
        estado: string;
        fecha_ingreso: string;
        tienda: string | null;
      }[];
    },
    refetchInterval: 60_000,
  });

  const accesorios = useQuery({
    queryKey: ["dash-accesorios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accesorios")
        .select("id, nombre, tipo, minimo, accesorios_stock(cantidad)")
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        nombre: string;
        tipo: string | null;
        minimo: number;
        accesorios_stock: { cantidad: number }[];
      }[];
    },
  });

  const garantias = useQuery({
    queryKey: ["v_garantias", "alertas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_garantias")
        .select("id, imei, modelo, gb, cliente_nombre, horas, estado")
        .eq("estado", "abierta")
        .order("fecha", { ascending: true })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const meta = useQuery({
    queryKey: ["dash-meta", tienda?.id, periodo],
    enabled: !!tienda,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("metas")
        .select("id, equipos_objetivo, ganancia_objetivo")
        .eq("tienda_id", tienda!.id)
        .eq("periodo", periodo)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const tareas = useQuery({
    queryKey: ["dash-tareas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tareas")
        .select("id, titulo, urgencia, hecha, fecha, asignado_id")
        .eq("hecha", false)
        .order("fecha", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  /* ---------- Métricas ---------- */
  const hoyMs = inicioHoy.getTime();
  const ventasMes = ventas.data ?? [];
  const ventasHoy = ventasMes.filter((v) => new Date(v.fecha).getTime() >= hoyMs);
  const itemsMes = items.data ?? [];
  const itemsHoy = itemsMes.filter((i) => new Date(i.ventas.fecha).getTime() >= hoyMs);

  const ingresosHoy = ventasHoy.reduce((a, v) => a + Number(v.total ?? 0), 0);
  const ingresosMes = ventasMes.reduce((a, v) => a + Number(v.total ?? 0), 0);
  const gananciaHoy = (gananciasMes.data ?? [])
    .filter((g) => new Date(g.fecha).getTime() >= hoyMs)
    .reduce((a, g) => a + Number(g.ganancia ?? 0), 0);
  const gananciaMes = (gananciasMes.data ?? []).reduce((a, g) => a + Number(g.ganancia ?? 0), 0);

  const disponiblesCadena = (stock.data ?? []).filter((e) => e.estado === "DISPONIBLE");
  const disponiblesTienda = disponiblesCadena.filter((e) => e.tienda === tienda?.nombre);

  /* ---------- Alertas ---------- */
  const alertasGarantia = (garantias.data ?? [])
    .filter((g) => (g.horas ?? 0) >= 48)
    .sort((a, b) => (b.horas ?? 0) - (a.horas ?? 0));

  const alertas = useMemo<Alerta[]>(() => {
    const lista: Alerta[] = [];

    /* 2. Modelos más vendidos sin stock */
    const vendidos = new Map<string, { modelo: string; gb: number | null; n: number }>();
    for (const it of itemsMes) {
      if (!it.equipos) continue;
      const k = claveModelo(it.equipos.modelo, it.equipos.gb);
      const prev = vendidos.get(k);
      vendidos.set(k, {
        modelo: it.equipos.modelo,
        gb: it.equipos.gb,
        n: (prev?.n ?? 0) + 1,
      });
    }
    const conStock = new Set(
      disponiblesCadena.map((e) => claveModelo(e.modelo, e.gb)),
    );
    [...vendidos.entries()]
      .filter(([, v]) => v.n >= 2)
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 4)
      .filter(([k]) => !conStock.has(k))
      .forEach(([k, v]) => {
        lista.push({
          key: `sinstock-${k}`,
          icon: PackageSearch,
          tono: "warning",
          titulo: `${equipoTexto(v.modelo, v.gb)} es de tus más vendidos y estás sin stock. Reponer.`,
          detalle: `${v.n} vendidos este mes · 0 disponibles en la cadena`,
          to: "/inventario",
        });
      });

    /* 3. Equipos con más de 50 días en stock */
    disponiblesCadena
      .map((e) => ({ ...e, dias: diasEnStock(e.fecha_ingreso) }))
      .filter((e) => e.dias > DIAS_LIQUIDAR)
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 4)
      .forEach((e) => {
        lista.push({
          key: `viejo-${e.id}`,
          icon: TrendingDown,
          tono: "destructive",
          titulo: `${equipoTexto(e.modelo, e.gb)} lleva ${e.dias} días en stock. Considera liquidar.`,
          detalle: `${e.imei} · ${e.tienda ?? "sin ubicación"}`,
          to: "/inventario",
        });
      });

    /* 4. Accesorios bajo el mínimo */
    (accesorios.data ?? [])
      .map((a) => ({
        ...a,
        total: (a.accesorios_stock ?? []).reduce((s, x) => s + Number(x.cantidad ?? 0), 0),
      }))
      .filter((a) => a.total < a.minimo)
      .sort((a, b) => a.total - b.total)
      .slice(0, 5)
      .forEach((a) => {
        lista.push({
          key: `acc-${a.id}`,
          icon: Headphones,
          tono: "warning",
          titulo: `${a.nombre}${a.tipo ? ` (${a.tipo})` : ""}: quedan ${a.total}. Reponer (mínimo ${a.minimo}).`,
          detalle: "Stock sumado de todas las tiendas",
          to: "/accesorios",
        });
      });

    return lista;
  }, [itemsMes, disponiblesCadena, accesorios.data]);

  /* ---------- Meta ---------- */
  const objEquipos = meta.data?.equipos_objetivo ?? 0;
  const equiposMes = itemsMes.length;
  const avanceEquipos = pct(equiposMes, objEquipos);
  const objGanancia = meta.data?.ganancia_objetivo ?? 0;

  /* ---------- Últimas ventas ---------- */
  const gananciaPorVenta = useMemo(() => {
    const m: Record<string, number> = {};
    for (const g of gananciasMes.data ?? []) m[g.id] = Number(g.ganancia ?? 0);
    return m;
  }, [gananciasMes.data]);

  const modelosPorVenta = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const it of itemsMes) {
      if (!it.equipos) continue;
      (m[it.venta_id] ??= []).push(equipoTexto(it.equipos.modelo, it.equipos.gb));
    }
    return m;
  }, [itemsMes]);

  const ultimas = ventasMes.slice(0, 8);
  const totalUltimas = ultimas.reduce((a, v) => a + Number(v.total ?? 0), 0);

  return (
    <div className="mx-auto max-w-[86rem] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Resumen del día</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operación de <span style={{ color: store.accent }}>{store.nombre}</span> ·{" "}
            {periodoTexto(periodo)}
          </p>
        </div>
      </div>

      {ventas.isLoading && !ventas.data ? (
        <SkeletonTarjetasMetrica />
      ) : (
        <Cascada className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metrica
            label="Ventas hoy"
            valor={itemsHoy.length}
            formato={formatNumero}
            sub={`${ventasHoy.length} boletas emitidas hoy`}
          />
          <Metrica
            label="Ingresos hoy"
            valor={ingresosHoy}
            formato={formatCLP}
            sub={`${formatCLP(ingresosMes)} en el mes`}
          />
          {verGanancias ? (
            <Metrica
              label="Ganancia hoy"
              valor={gananciaHoy}
              formato={formatCLP}
              sub={`${formatCLP(gananciaMes)} en el mes`}
            />
          ) : (
            <Metrica
              label="Stock en la tienda"
              valor={disponiblesTienda.length}
              formato={formatNumero}
              sub={`${store.nombre} · equipos disponibles`}
            />
          )}
          <Metrica
            label="Stock disponible"
            valor={disponiblesCadena.length}
            formato={formatNumero}
            sub="Equipos disponibles en toda la cadena"
          />
        </Cascada>
      )}

      <section className="glass grid gap-4 p-5 sm:grid-cols-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Ventas del mes
          </p>
          <p className="num mt-1 text-lg font-semibold">{formatNumero(equiposMes)} equipos</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Ingresos del mes
          </p>
          <p className="num mt-1 text-lg font-semibold">{formatCLP(ingresosMes)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {verGanancias ? "Ganancia del mes" : "Ticket promedio del mes"}
          </p>
          <p className="num mt-1 text-lg font-semibold text-positive">
            {verGanancias
              ? formatCLP(gananciaMes)
              : formatCLP(ventasMes.length ? ingresosMes / ventasMes.length : 0)}
          </p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        {/* Alertas */}
        <section className="glass p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold">Alertas</h2>
            <span className="num rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-muted-foreground">
              {alertas.length + alertasGarantia.length} activas
            </span>
          </div>
          <motion.ul
            className="mt-4 space-y-2.5"
            initial="oculto"
            animate="visible"
            variants={{ oculto: {}, visible: { transition: { staggerChildren: 0.05 } } }}
          >
            {alertasGarantia.map((g) => {
              const horas = g.horas ?? 0;
              const vencida = nivelSla(horas) === "vencida";
              return (
                <motion.li key={g.id as string} variants={varsHijo}>
                  <Link
                    to="/garantias"
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3 transition-colors duration-200",
                      vencida && "pulso-alerta",
                      vencida
                        ? "border-red-400/50 bg-red-500/[0.12] hover:bg-red-500/[0.18]"
                        : "border-red-400/25 bg-red-500/[0.07] hover:bg-red-500/[0.12]",
                    )}
                  >
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-destructive/15 text-destructive">
                      <ShieldCheck className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">
                        Garantía {equipoTexto(g.modelo, g.gb)} ({g.cliente_nombre}) —{" "}
                        {textoSla(horas)}
                      </span>
                      <span className="num block text-[12px] text-muted-foreground">{g.imei}</span>
                    </span>
                  </Link>
                </motion.li>
              );
            })}

            {alertas.map((a) => {
              const contenido = (
                <>
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
                    <span className="num block text-[12px] text-muted-foreground">{a.detalle}</span>
                  </span>
                </>
              );
              return (
                <motion.li key={a.key} variants={varsHijo}>
                  {a.to ? (
                    <Link
                      to={a.to}
                      className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 transition-colors duration-200 hover:bg-white/[0.06]"
                    >
                      {contenido}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                      {contenido}
                    </div>
                  )}
                </motion.li>
              );
            })}

            {alertas.length + alertasGarantia.length === 0 && (
              <li className="rounded-xl border border-white/[0.06] bg-white/[0.03]">
                {stock.isLoading ? (
                  <p className="p-4 text-[13px] text-muted-foreground">Revisando la operación…</p>
                ) : (
                  <EstadoVacio
                    icono={ShieldCheck}
                    titulo="Todo impecable por acá"
                    mensaje="Ni una alerta activa: la operación está al día. Aprovecha y vende."
                    className="py-8"
                  />
                )}
              </li>
            )}
          </motion.ul>
        </section>

        <div className="space-y-4">
          {/* Meta del mes */}
          <section className="glass flex flex-col p-5">
            <h2 className="font-display text-sm font-semibold">
              Meta del mes · {periodoTexto(periodo)}
            </h2>
            {objEquipos > 0 ? (
              <>
                <p className="num mt-4 text-[1.6rem] font-semibold leading-none">
                  llevan {formatNumero(equiposMes)} de {formatNumero(objEquipos)} equipos
                </p>
                <BarraProgreso valor={avanceEquipos} color={store.accent} className="mt-4" />
                <p className="num mt-2 text-[12px]" style={{ color: store.accent }}>
                  {avanceEquipos}% cumplido
                </p>
                {verGanancias && objGanancia > 0 && (
                  <p className="num mt-3 text-[12px] text-muted-foreground">
                    Ganancia: {formatCLP(gananciaMes)} de {formatCLP(objGanancia)} (
                    {pct(gananciaMes, objGanancia)}%)
                  </p>
                )}
              </>
            ) : (
              <p className="mt-3 text-[13px] text-muted-foreground">
                Esta tienda todavía no tiene meta definida para el período.{" "}
                <Link to="/metas" className="underline" style={{ color: store.accent }}>
                  Definir meta
                </Link>
              </p>
            )}
          </section>

          {/* Tareas pendientes */}
          <section className="glass p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold">Tareas pendientes</h2>
              <Link to="/tareas" className="text-[11px] text-muted-foreground hover:text-foreground">
                Ver todas
              </Link>
            </div>
            <ul className="mt-3 space-y-2">
              {(tareas.data ?? []).slice(0, 5).map((t) => {
                const info = URGENCIA_INFO[(t.urgencia as Urgencia) ?? "media"] ?? URGENCIA_INFO.media;
                return (
                  <li
                    key={t.id}
                    className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-[13px]"
                  >
                    <span className={cn("size-2 shrink-0 rounded-full", info.punto)} />
                    <span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{info.label}</span>
                  </li>
                );
              })}
              {(tareas.data ?? []).length === 0 && (
                <li className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-[13px] text-muted-foreground">
                  <ListChecks className="size-4" /> Sin tareas pendientes.
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>

      {/* Últimas ventas */}
      <section className="solid-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold">Últimas ventas</h2>
          <span className="num text-[12px] text-muted-foreground">
            {ultimas.length} boletas · {formatCLP(totalUltimas)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Fecha</th>
                <th className="px-3 py-2.5 font-medium">Cliente</th>
                <th className="px-3 py-2.5 font-medium">Equipos</th>
                <th className="px-3 py-2.5 font-medium">Boleta</th>
                <th className="px-3 py-2.5 text-right font-medium">Total</th>
                {verGanancias && <th className="px-5 py-2.5 text-right font-medium">Ganancia</th>}
              </tr>
            </thead>
            <motion.tbody initial="oculto" animate="visible" variants={varsListaFilas}>
              {ultimas.map((v) => (
                <motion.tr
                  key={v.id}
                  variants={varsFila}
                  whileHover={{ x: 2 }}
                  transition={RESORTE_RAPIDO}
                  className="fila-densa border-t border-white/[0.05] hover:bg-surface-alt"
                >
                  <td className="num px-5 py-2.5 text-muted-foreground">
                    {new Date(v.fecha).toLocaleString("es-CL", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2.5">{v.clientes?.nombre ?? "Sin cliente"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {(modelosPorVenta[v.id] ?? []).join(" · ") || "Solo accesorios"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-muted-foreground">
                      {v.con_boleta ? "Con boleta" : "Sin boleta"}
                    </span>
                  </td>
                  <td className="num px-3 py-2.5 text-right font-medium">
                    {formatCLP(Number(v.total ?? 0))}
                  </td>
                  {verGanancias && (
                    <td className="num px-5 py-2.5 text-right text-positive">
                      {formatCLP(gananciaPorVenta[v.id] ?? 0)}
                    </td>
                  )}
                </motion.tr>
              ))}
              {ultimas.length === 0 && (
                <tr>
                  <td
                    className="px-5 py-8 text-center text-muted-foreground"
                    colSpan={verGanancias ? 6 : 5}
                  >
                    {ventas.isLoading ? (
                      <SkeletonFilas filas={4} columnas={verGanancias ? 6 : 5} />
                    ) : (
                      <EstadoVacio
                        icono={ShoppingBag}
                        titulo="Todavía no se vende nada este mes"
                        mensaje="Cuando registres la primera venta del período va a aparecer justo acá."
                        accion={
                          <Link
                            to="/vender"
                            className="inline-flex rounded-xl px-4 py-2 text-[13px] font-medium text-background"
                            style={{ background: store.accent }}
                          >
                            Ir a vender
                          </Link>
                        }
                      />
                    )}
                  </td>
                </tr>
              )}
            </motion.tbody>
          </table>
        </div>
      </section>

      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Clock className="size-3.5" /> Los datos se actualizan automáticamente cada minuto.
      </p>
    </div>
  );
}
