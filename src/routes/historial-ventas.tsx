import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Receipt, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useVerGanancias } from "@/lib/permisos";
import { traerTodo } from "@/lib/traerTodo";
import { marcarEnvio } from "@/lib/envios";
import { useAuth } from "@/components/AuthContext";
import { BotonComprobante } from "@/components/vender/BotonComprobante";
import { CorregirPagoModal, type VentaACorregir } from "@/components/vender/CorregirPagoModal";
import { ImportarVentasModal } from "@/components/vender/ImportarVentasModal";
import { EliminarVentaModal, type VentaAEliminar } from "@/components/vender/EliminarVentaModal";
import { CorregirCostoModal, type ItemSinCosto } from "@/components/vender/CorregirCostoModal";
import { EstadoVacio, SkeletonFilas } from "@/components/motion";
import { formatCLP } from "@/lib/stores";
import { METODO_ETIQUETA, type MetodoPago } from "@/lib/pos";
import { hoyISO } from "@/lib/caja";

const DESC = "Historial de ventas de cada tienda, con totales, métodos de pago y comprobantes.";

type Entrega = { detalle: string; estado: "pendiente" | "enviado" | null; enviadoAt: string | null };

/** Columna "Costo servicios" del Excel: apagada por ahora a pedido del cliente (21-10). */
const INCLUIR_COSTO_SERVICIOS = false;

export const Route = createFileRoute("/historial-ventas")({
  head: () => ({
    meta: [
      { title: "Historial de ventas · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Historial de ventas · iPhonizate OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistorialVentasPage,
});

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

const fechaHora = (f: string) =>
  new Date(f).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Primer día del mes en curso, en formato ISO corto. */
const inicioMesISO = () => `${hoyISO().slice(0, 7)}-01`;

function HistorialVentasPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const conGanancias = useVerGanancias(rol);

  const [desde, setDesde] = useState(inicioMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [busqueda, setBusqueda] = useState("");
  const [tiendaFiltro, setTiendaFiltro] = useState("todas");
  const [conAnuladas, setConAnuladas] = useState(false);
  const [soloEnviosPendientes, setSoloEnviosPendientes] = useState(false);
  const [soloSinCosto, setSoloSinCosto] = useState(false);
  const [corrigiendoCosto, setCorrigiendoCosto] = useState<ItemSinCosto | null>(null);
  const [aEliminar, setAEliminar] = useState<VentaAEliminar | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<VentaACorregir | null>(null);
  const [importando, setImportando] = useState(false);

  /* Renato, Liz y Valentina pueden eliminar ventas y corregir pagos: lo decide la base de datos */
  const permisoBorrar = useQuery({
    queryKey: ["puede_corregir_ventas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("puede_corregir_ventas");
      if (error) throw error;
      return data === true;
    },
  });

  const tiendas = useQuery({
    queryKey: ["tiendas-historial"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tiendas").select("id, nombre, es_bodega").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  /* ganancia y comprobante_numero no están concedidas en la tabla ventas: pedirlas
     ahí hace fallar la consulta entera. Se leen aparte desde sus vistas. */
  const ventas = useQuery({
    queryKey: ["historial-ventas", desde, hasta],
    queryFn: async () => {
      const data = await traerTodo((filaIni, filaFin) =>
        supabase
          .from("ventas")
          .select(
            "id, fecha, total, anulada, con_boleta, tienda_id, clientes(nombre), usuarios!ventas_vendedor_id_fkey(nombre), pagos(id, metodo, monto, nombre_pagador), venta_items(id, precio, equipos(imei, modelo, gb, color), accesorios(nombre))",
          )
          .gte("fecha", `${desde}T00:00:00`)
          .lte("fecha", `${hasta}T23:59:59.999`)
          .order("fecha", { ascending: false })
          .order("id")
          .range(filaIni, filaFin),
      );
      return data;
    },
  });

  const ganancias = useQuery({
    queryKey: ["historial-ganancias", desde, hasta],
    enabled: conGanancias,
    queryFn: async () => {
      const data = await traerTodo((filaIni, filaFin) =>
        supabase
          .from("v_ventas_full")
          .select("id, ganancia")
          .gte("fecha", `${desde}T00:00:00`)
          .lte("fecha", `${hasta}T23:59:59.999`)
          .order("id")
          .range(filaIni, filaFin),
      );
      return new Map((data ?? []).map((v) => [v.id as string, Number(v.ganancia ?? 0)]));
    },
  });

  /* Costo de cada equipo vendido (solo para quien ve ganancias): así se ven los que quedaron en 0 */
  const costos = useQuery({
    queryKey: ["historial-costos", desde, hasta],
    enabled: conGanancias,
    queryFn: async () => {
      const data = await traerTodo((filaIni, filaFin) =>
        supabase
          .from("v_venta_items")
          .select("id, costo_snapshot")
          .gte("fecha", `${desde}T00:00:00`)
          .lte("fecha", `${hasta}T23:59:59.999`)
          .order("id")
          .range(filaIni, filaFin),
      );
      return new Map(
        data.map((i) => [i.id as string, i.costo_snapshot == null ? null : Number(i.costo_snapshot)]),
      );
    },
  });
  const costoDe = (itemId: string) => costos.data?.get(itemId);

  const numeros = useQuery({
    queryKey: ["historial-comprobantes", desde, hasta],
    queryFn: async () => {
      const data = await traerTodo((filaIni, filaFin) =>
        supabase
          .from("v_comprobantes")
          .select("id, comprobante_numero")
          .gte("fecha", `${desde}T00:00:00`)
          .lte("fecha", `${hasta}T23:59:59.999`)
          .order("id")
          .range(filaIni, filaFin),
      );
      return new Map((data ?? []).map((v) => [v.id as string, v.comprobante_numero ?? ""]));
    },
  });

  /* Presencial o envío va en su propia consulta: si falla, el historial se ve igual */
  const entregas = useQuery({
    queryKey: ["historial-entregas", desde, hasta],
    queryFn: async () => {
      const armar = (columnas: string) =>
        supabase
          .from("ventas")
          .select(columnas)
          .eq("modalidad", "envio")
          .gte("fecha", `${desde}T00:00:00`)
          .lte("fecha", `${hasta}T23:59:59.999`)
          .limit(1000);
      /* Si la base aún no tiene el estado del envío, se muestra al menos que es envío */
      let { data, error } = await armar("id, envio_detalle, envio_estado, enviado_at");
      if (error) ({ data, error } = await armar("id, envio_detalle"));
      if (error) return new Map<string, Entrega>();
      const filas = (data ?? []) as unknown as {
        id: string;
        envio_detalle: string | null;
        envio_estado?: string | null;
        enviado_at?: string | null;
      }[];
      return new Map(
        filas.map((v) => [
          v.id,
          {
            detalle: v.envio_detalle ?? "",
            estado: (v.envio_estado ?? null) as Entrega["estado"],
            enviadoAt: v.enviado_at ?? null,
          },
        ]),
      );
    },
  });
  const envioDe = (id: string) => entregas.data?.get(id);

  const [marcandoEnvio, setMarcandoEnvio] = useState<string | null>(null);
  const cambiarEnvio = async (id: string, enviado: boolean) => {
    setMarcandoEnvio(id);
    try {
      await marcarEnvio(id, enviado);
      toast.success(enviado ? "Envío marcado como enviado" : "El envío vuelve a pendiente");
      void entregas.refetch();
    } catch (e) {
      toast.error("No se pudo cambiar el envío", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setMarcandoEnvio(null);
    }
  };

  const gananciaDe = (id: string) => ganancias.data?.get(id) ?? 0;
  const numeroDe = (id: string) => numeros.data?.get(id) ?? "";

  const nombreTienda = (id?: string | null) =>
    (tiendas.data ?? []).find((t) => t.id === id)?.nombre ?? "Sin tienda";

  /* Venta con algún equipo cuyo costo quedó en 0: su ganancia está inflada */
  const tieneSinCosto = (v: NonNullable<typeof ventas.data>[number]) =>
    conGanancias && (v.venta_items ?? []).some((i) => !!i.equipos && costoDe(i.id) === 0);
  const ventasSinCosto = (ventas.data ?? []).filter((v) => !v.anulada && tieneSinCosto(v)).length;

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (ventas.data ?? []).filter((v) => {
      if (!conAnuladas && v.anulada) return false;
      if (soloEnviosPendientes && envioDe(v.id)?.estado !== "pendiente") return false;
      if (soloSinCosto && !tieneSinCosto(v)) return false;
      if (tiendaFiltro !== "todas" && v.tienda_id !== tiendaFiltro) return false;
      if (!q) return true;
      const textos = [
        v.clientes?.nombre ?? "",
        v.usuarios?.nombre ?? "",
        numeroDe(v.id),
        nombreTienda(v.tienda_id),
        envioDe(v.id)
          ? `envio ${envioDe(v.id)?.detalle} ${envioDe(v.id)?.estado === "pendiente" ? "pendiente" : ""}`
          : "presencial",
        ...(v.venta_items ?? []).map(
          (i) =>
            `${i.equipos?.imei ?? ""} ${i.equipos?.modelo ?? ""} ${i.equipos?.color ?? ""} ${i.accesorios?.nombre ?? ""}`,
        ),
      ];
      return textos.join(" ").toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ventas.data,
    numeros.data,
    entregas.data,
    tiendas.data,
    busqueda,
    tiendaFiltro,
    conAnuladas,
    soloEnviosPendientes,
    soloSinCosto,
    costos.data,
  ]);

  const porTienda = useMemo(() => {
    const mapa = new Map<
      string,
      { tienda: string; filas: typeof filas; total: number; ganancia: number }
    >();
    filas.forEach((v) => {
      const clave = v.tienda_id ?? "sin-tienda";
      const grupo =
        mapa.get(clave) ?? { tienda: nombreTienda(v.tienda_id), filas: [], total: 0, ganancia: 0 };
      grupo.filas.push(v);
      if (!v.anulada) {
        grupo.total += v.total ?? 0;
        grupo.ganancia += gananciaDe(v.id);
      }
      mapa.set(clave, grupo);
    });
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [filas, tiendas.data, ganancias.data]);

  const totalGeneral = porTienda.reduce((s, g) => s + g.total, 0);
  const gananciaGeneral = porTienda.reduce((s, g) => s + g.ganancia, 0);
  const ventasValidas = filas.filter((v) => !v.anulada).length;

  /* Cada producto en su línea; los equipos con color e IMEI a la vista */
  const detalle = (v: (typeof filas)[number]) => {
    const items = v.venta_items ?? [];
    if (items.length === 0) return "—";
    return items.map((i) =>
      i.equipos ? (
        <span key={i.id} className="block">
          {i.equipos.modelo ?? ""}
          {i.equipos.gb ? ` ${i.equipos.gb} GB` : ""}
          {i.equipos.color ? <span className="text-muted-foreground"> · {i.equipos.color}</span> : null}
          {i.equipos.imei && (
            <span className="num block text-xs tracking-[0.04em] text-muted-foreground">
              {i.equipos.imei}
            </span>
          )}
          {conGanancias && costoDe(i.id) === 0 && (
            <button
              type="button"
              onClick={() =>
                setCorrigiendoCosto({
                  id: i.id,
                  modelo: `${i.equipos?.modelo ?? ""}${i.equipos?.gb ? ` ${i.equipos.gb} GB` : ""}`,
                  imei: i.equipos?.imei ?? null,
                  precio: i.precio,
                })
              }
              className="mt-0.5 inline-flex rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300 hover:bg-amber-500/20"
            >
              Sin costo · cargar
            </button>
          )}
        </span>
      ) : (
        <span key={i.id} className="block">
          {i.accesorios?.nombre ?? "Accesorio"}
        </span>
      ),
    );
  };

  const metodos = (pagos: { metodo: string }[] | null) =>
    [...new Set((pagos ?? []).map((p) => METODO_ETIQUETA[p.metodo as MetodoPago] ?? p.metodo))].join(
      " · ",
    ) || "—";

  const puedeEliminar = permisoBorrar.data === true;

  /* Costo de los servicios (batería, pantalla…) que corresponden a cada equipo vendido: los
     arreglos hechos después de su venta anterior y hasta esta venta. Solo al descargar. */
  const costoServiciosPorItem = async () => {
    const itemsRango = await traerTodo((filaIni, filaFin) =>
      supabase
        .from("v_venta_items")
        .select("id, equipo_id, fecha")
        .not("equipo_id", "is", null)
        .gte("fecha", `${desde}T00:00:00`)
        .lte("fecha", `${hasta}T23:59:59.999`)
        .order("id")
        .range(filaIni, filaFin),
    );
    const idsEquipos = [...new Set(itemsRango.map((i) => i.equipo_id).filter(Boolean))] as string[];
    const ventasEquipo: { equipo_id: string | null; fecha: string | null; anulada: boolean | null }[] = [];
    const servicios: { equipo_id: string | null; costo: number | null; created_at: string | null }[] = [];
    for (let k = 0; k < idsEquipos.length; k += 100) {
      const lote = idsEquipos.slice(k, k + 100);
      const [v, s] = await Promise.all([
        supabase.from("v_venta_items").select("equipo_id, fecha, anulada").in("equipo_id", lote),
        supabase.from("v_servicios_equipo").select("equipo_id, costo, created_at").in("equipo_id", lote),
      ]);
      if (v.error) throw v.error;
      if (s.error) throw s.error;
      ventasEquipo.push(...(v.data ?? []));
      servicios.push(...(s.data ?? []));
    }
    const resultado = new Map<string, number>();
    for (const item of itemsRango) {
      if (!item.id || !item.equipo_id || !item.fecha) continue;
      const fecha = item.fecha;
      const anterior = ventasEquipo
        .filter((v) => v.equipo_id === item.equipo_id && !v.anulada && v.fecha && v.fecha < fecha)
        .reduce<string | null>((max, v) => (!max || v.fecha! > max ? v.fecha! : max), null);
      const total = servicios
        .filter(
          (s) =>
            s.equipo_id === item.equipo_id &&
            s.created_at &&
            s.created_at <= fecha &&
            (!anterior || s.created_at > anterior),
        )
        .reduce((a, s) => a + Number(s.costo ?? 0), 0);
      resultado.set(item.id, total);
    }
    return resultado;
  };

  /* Excel de lo que está en pantalla (respeta filtros): una fila por producto vendido */
  const descargarExcel = async () => {
    const XLSX = await import("xlsx");
    let serviciosItem = new Map<string, number>();
    if (conGanancias && INCLUIR_COSTO_SERVICIOS) {
      try {
        serviciosItem = await costoServiciosPorItem();
      } catch {
        toast.error("No se pudo calcular el costo de servicios", {
          description: "El Excel se descarga igual, sin esa columna completa.",
        });
      }
    }
    const entregaTexto = (id: string) => {
      const e = envioDe(id);
      if (!e) return "Presencial";
      return e.estado === "pendiente" ? "Envío pendiente" : e.estado === "enviado" ? "Enviado" : "Envío";
    };
    const filasExcel = filas.flatMap((v) => {
      const items = v.venta_items ?? [];
      const lineas = items.length ? items : [null];
      return lineas.map((i, idx) => {
        const costo = i ? costoDe(i.id) : undefined;
        return {
          Fecha: fechaHora(v.fecha),
          Tienda: nombreTienda(v.tienda_id),
          Comprobante: numeroDe(v.id),
          Cliente: v.clientes?.nombre ?? "",
          Vendedor: v.usuarios?.nombre ?? "",
          Producto: i ? (i.equipos?.modelo ?? i.accesorios?.nombre ?? "") : "",
          GB: i?.equipos?.gb ?? "",
          Color: i?.equipos?.color ?? "",
          IMEI: i?.equipos?.imei ?? "",
          "Precio venta": i?.precio ?? "",
          ...(conGanancias
            ? {
                Costo: costo ?? "",
                ...(INCLUIR_COSTO_SERVICIOS
                  ? { "Costo servicios": i?.equipos ? (serviciosItem.get(i.id) ?? 0) : "" }
                  : {}),
                Ganancia: i && costo != null ? i.precio - costo : "",
                "Sin costo": i?.equipos && costo === 0 ? "SÍ" : "",
              }
            : {}),
          "Total venta": idx === 0 ? v.total : "",
          Pago: idx === 0 ? metodos(v.pagos) : "",
          Entrega: idx === 0 ? entregaTexto(v.id) : "",
          Anulada: v.anulada ? "Sí" : "",
        };
      });
    });
    const hoja = XLSX.utils.json_to_sheet(filasExcel);
    hoja["!cols"] = Object.keys(filasExcel[0] ?? {}).map((k) => ({ wch: Math.max(10, k.length + 2) }));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Ventas");
    XLSX.writeFile(libro, `ventas-${desde}-a-${hasta}.xlsx`);
  };

  /* Resumen en texto plano de lo que se vendió, para la ventana de eliminar */
  const resumenVenta = (v: (typeof filas)[number]) =>
    (v.venta_items ?? [])
      .map((i) =>
        i.equipos
          ? `${i.equipos.modelo ?? ""}${i.equipos.gb ? ` ${i.equipos.gb} GB` : ""}${i.equipos.imei ? ` · ${i.equipos.imei}` : ""}`
          : (i.accesorios?.nombre ?? ""),
      )
      .filter(Boolean)
      .join(" / ") || "Sin productos";

  const ventaEliminada = () => {
    setAEliminar(null);
    void ventas.refetch();
    void ganancias.refetch();
    void numeros.refetch();
  };

  return (
    <div className="mx-auto max-w-[92rem]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Historial de ventas</h1>
          <p className="mt-1 text-sm text-muted-foreground">{DESC}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <button
            type="button"
            onClick={() => void descargarExcel()}
            disabled={filas.length === 0}
            className="glass flex items-center gap-2 px-4 py-3 text-sm transition-colors duration-200 hover:border-[var(--accent-store)]/50 disabled:opacity-50"
          >
            <Download className="size-4 text-[var(--accent-store)]" /> Descargar Excel
          </button>
          {puedeEliminar && (
            <button
              type="button"
              onClick={() => setImportando(true)}
              className="glass flex items-center gap-2 px-4 py-3 text-sm transition-colors duration-200 hover:border-[var(--accent-store)]/50"
            >
              <FileSpreadsheet className="size-4 text-[var(--accent-store)]" /> Importar ventas
            </button>
          )}
          <div className="glass px-5 py-3 text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Ventas</p>
            <p className="num font-display text-2xl font-semibold">{ventasValidas}</p>
          </div>
          <div className="glass px-5 py-3 text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Ingresos</p>
            <p className="num font-display text-2xl font-semibold">{formatCLP(totalGeneral)}</p>
          </div>
          {conGanancias && (
            <div className="glass px-5 py-3 text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Ganancia</p>
              <p className="num font-display text-2xl font-semibold text-[var(--positive)]">
                {formatCLP(gananciaGeneral)}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="glass mt-6 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-52 flex-1">
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Buscar
          </span>
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={`${campo} pl-10`}
              value={busqueda}
              placeholder="Cliente, vendedor, IMEI, modelo, color o N° de comprobante"
              aria-label="Buscar en el historial"
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </label>
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
        <button
          type="button"
          onClick={() => setConAnuladas((v) => !v)}
          className={`rounded-full border px-4 py-1.5 text-xs transition-all duration-200 ${
            conAnuladas
              ? "accent-glow border-[var(--accent-store)]/50 bg-[var(--accent-store-soft)] text-foreground"
              : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground"
          }`}
        >
          Incluir anuladas
        </button>
        <button
          type="button"
          onClick={() => setSoloEnviosPendientes((v) => !v)}
          className={`rounded-full border px-4 py-1.5 text-xs transition-all duration-200 ${
            soloEnviosPendientes
              ? "accent-glow border-[var(--accent-store)]/50 bg-[var(--accent-store-soft)] text-foreground"
              : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground"
          }`}
        >
          Solo envíos pendientes
        </button>
        {conGanancias && (
          <button
            type="button"
            onClick={() => setSoloSinCosto((v) => !v)}
            className={`rounded-full border px-4 py-1.5 text-xs transition-all duration-200 ${
              soloSinCosto
                ? "accent-glow border-[var(--accent-store)]/50 bg-[var(--accent-store-soft)] text-foreground"
                : ventasSinCosto > 0
                  ? "border-amber-400/40 bg-amber-500/10 text-amber-300"
                  : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground"
            }`}
          >
            Sin costo{ventasSinCosto > 0 ? ` (${ventasSinCosto})` : ""}
          </button>
        )}
      </div>

      {ventas.isLoading && (
        <div className="solid-panel mt-6 overflow-hidden p-4">
          <SkeletonFilas filas={6} columnas={conGanancias ? 8 : 7} />
        </div>
      )}

      {ventas.isError && (
        <div className="mt-6 rounded-xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-200">
          <p className="font-medium">No pudimos cargar el historial de ventas.</p>
          <p className="mt-1 text-xs text-red-200/80">
            {ventas.error instanceof Error ? ventas.error.message : "Inténtalo otra vez."}
          </p>
          <button
            type="button"
            onClick={() => void ventas.refetch()}
            className="mt-3 rounded-full border border-red-400/30 px-3 py-1 text-xs hover:text-red-100"
          >
            Reintentar
          </button>
        </div>
      )}

      {!ventas.isLoading && !ventas.isError && !porTienda.length && (
        <div className="solid-panel mt-6 overflow-hidden py-10">
          <EstadoVacio
            icono={Receipt}
            titulo="No hay ventas en ese rango"
            mensaje="Cambia las fechas o la tienda para ver otras ventas."
          />
        </div>
      )}

      {porTienda.map((grupo) => (
        <section key={grupo.tienda} className="solid-panel mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-2.5">
            <span className="text-sm font-medium">{grupo.tienda}</span>
            <span className="num flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>
                {grupo.filas.length} venta{grupo.filas.length === 1 ? "" : "s"}
              </span>
              <span>Ingresos {formatCLP(grupo.total)}</span>
              {conGanancias && (
                <span className="text-[var(--positive)]">Ganancia {formatCLP(grupo.ganancia)}</span>
              )}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">N° venta</th>
                  <th className="px-4 py-3 font-medium">Tienda</th>
                  <th className="px-4 py-3 font-medium">Detalle</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Vendedor</th>
                  <th className="px-4 py-3 font-medium">Pagos</th>
                  <th className="px-4 py-3 font-medium">Entrega</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  {conGanancias && <th className="px-4 py-3 text-right font-medium">Ganancia</th>}
                  <th className="px-4 py-3 font-medium">Comprobante</th>
                  {puedeEliminar && <th className="px-4 py-3 font-medium">Eliminar</th>}
                </tr>
              </thead>
              <tbody>
                {grupo.filas.map((v) => (
                  <tr
                    key={v.id}
                    className={`border-b border-white/5 last:border-0 hover:bg-white/[0.035] ${
                      v.anulada ? "text-muted-foreground line-through" : ""
                    }`}
                  >
                    <td className="num px-4 py-2.5 align-top text-muted-foreground">
                      {fechaHora(v.fecha)}
                    </td>
                    <td className="num whitespace-nowrap px-4 py-2.5 align-top">
                      {numeroDe(v.id) || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5 align-top text-muted-foreground">
                      {nombreTienda(v.tienda_id)}
                    </td>
                    <td className="px-4 py-2.5">{detalle(v)}</td>
                    <td className="px-4 py-2.5">{v.clientes?.nombre ?? "Sin cliente"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {v.usuarios?.nombre ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {metodos(v.pagos)}
                      {puedeEliminar && !v.anulada && (v.pagos ?? []).length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setCorrigiendo({
                              id: v.id,
                              pagos: (v.pagos ?? []).map((p) => ({
                                id: p.id,
                                metodo: p.metodo as MetodoPago,
                                monto: p.monto,
                                nombre_pagador: p.nombre_pagador,
                              })),
                            })
                          }
                          className="ml-2 text-xs text-[var(--accent-store)] hover:underline"
                        >
                          Corregir
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {(() => {
                        const envio = envioDe(v.id);
                        if (!envio) return "Presencial";
                        return (
                          <>
                            {envio.estado === "pendiente" ? (
                              <span className="inline-flex rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                                Envío pendiente
                              </span>
                            ) : envio.estado === "enviado" ? (
                              <span className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                                Enviado{envio.enviadoAt ? ` ${fechaHora(envio.enviadoAt).slice(0, 5)}` : ""}
                              </span>
                            ) : (
                              <span className="text-foreground">Envío</span>
                            )}
                            {envio.detalle && <span className="mt-1 block max-w-56 text-xs">{envio.detalle}</span>}
                            {envio.estado && !v.anulada && (
                              <button
                                type="button"
                                disabled={marcandoEnvio !== null}
                                onClick={() => void cambiarEnvio(v.id, envio.estado === "pendiente")}
                                className="mt-1 text-xs text-[var(--accent-store)] hover:underline disabled:opacity-50"
                              >
                                {marcandoEnvio === v.id
                                  ? "Guardando…"
                                  : envio.estado === "pendiente"
                                    ? "Marcar enviado"
                                    : "Volver a pendiente"}
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td className="num px-4 py-2.5 text-right">{formatCLP(v.total)}</td>
                    {conGanancias && (
                      <td className="num px-4 py-2.5 text-right text-[var(--positive)]">
                        {formatCLP(gananciaDe(v.id))}
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      {v.anulada ? (
                        <span className="text-xs text-red-300">Anulada</span>
                      ) : (
                        <BotonComprobante ventaId={v.id} />
                      )}
                    </td>
                    {puedeEliminar && (
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            setAEliminar({
                              id: v.id,
                              total: v.total,
                              fecha: v.fecha,
                              resumen: resumenVenta(v),
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-full border border-red-400/25 bg-red-400/10 px-3 py-1 text-xs text-red-300 transition-colors hover:text-red-200 disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" />
                          Eliminar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <CorregirPagoModal
        venta={corrigiendo}
        onCerrar={() => setCorrigiendo(null)}
        onGuardado={() => void ventas.refetch()}
      />

      <CorregirCostoModal
        item={corrigiendoCosto}
        onCerrar={() => setCorrigiendoCosto(null)}
        onGuardado={() => {
          setCorrigiendoCosto(null);
          void costos.refetch();
          void ganancias.refetch();
        }}
      />

      <EliminarVentaModal
        venta={aEliminar}
        onCerrar={() => setAEliminar(null)}
        onEliminada={ventaEliminada}
      />

      <ImportarVentasModal
        abierto={importando}
        onCerrar={() => setImportando(false)}
        tiendas={tiendas.data ?? []}
        puedeCostos={conGanancias}
        onImportado={(rango) => {
          setDesde(rango.desde);
          setHasta(rango.hasta);
          setConAnuladas(false);
          void ventas.refetch();
          void ganancias.refetch();
          void numeros.refetch();
        }}
      />
    </div>
  );
}
