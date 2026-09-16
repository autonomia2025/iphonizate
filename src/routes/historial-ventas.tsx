import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Receipt, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { BotonComprobante } from "@/components/vender/BotonComprobante";
import { EstadoVacio, SkeletonFilas } from "@/components/motion";
import { formatCLP } from "@/lib/stores";
import { METODO_ETIQUETA, puedeVerGanancias, type MetodoPago } from "@/lib/pos";
import { hoyISO } from "@/lib/caja";

const DESC = "Historial de ventas de cada tienda, con totales, métodos de pago y comprobantes.";

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
  const conGanancias = puedeVerGanancias(rol);

  const [desde, setDesde] = useState(inicioMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [busqueda, setBusqueda] = useState("");
  const [tiendaFiltro, setTiendaFiltro] = useState("todas");
  const [conAnuladas, setConAnuladas] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);

  /* Solo Renato y Liz pueden eliminar ventas: lo decide la base de datos */
  const permisoBorrar = useQuery({
    queryKey: ["puede_borrar_equipos"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("puede_borrar_equipos");
      if (error) throw error;
      return data === true;
    },
  });

  const tiendas = useQuery({
    queryKey: ["tiendas-historial"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tiendas").select("id, nombre").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const ventas = useQuery({
    queryKey: ["historial-ventas", desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ventas")
        .select(
          "id, fecha, total, ganancia, anulada, con_boleta, tienda_id, comprobante_numero, clientes(nombre), usuarios(nombre), pagos(id, metodo, monto), venta_items(id, precio, equipos(imei, modelo, gb), accesorios(nombre))",
        )
        .gte("fecha", `${desde}T00:00:00`)
        .lte("fecha", `${hasta}T23:59:59.999`)
        .order("fecha", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const nombreTienda = (id?: string | null) =>
    (tiendas.data ?? []).find((t) => t.id === id)?.nombre ?? "Sin tienda";

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (ventas.data ?? []).filter((v) => {
      if (!conAnuladas && v.anulada) return false;
      if (tiendaFiltro !== "todas" && v.tienda_id !== tiendaFiltro) return false;
      if (!q) return true;
      const textos = [
        v.clientes?.nombre ?? "",
        v.usuarios?.nombre ?? "",
        v.comprobante_numero ?? "",
        ...(v.venta_items ?? []).map(
          (i) => `${i.equipos?.imei ?? ""} ${i.equipos?.modelo ?? ""} ${i.accesorios?.nombre ?? ""}`,
        ),
      ];
      return textos.join(" ").toLowerCase().includes(q);
    });
  }, [ventas.data, busqueda, tiendaFiltro, conAnuladas]);

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
        grupo.ganancia += v.ganancia ?? 0;
      }
      mapa.set(clave, grupo);
    });
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [filas, tiendas.data]);

  const totalGeneral = porTienda.reduce((s, g) => s + g.total, 0);
  const gananciaGeneral = porTienda.reduce((s, g) => s + g.ganancia, 0);
  const ventasValidas = filas.filter((v) => !v.anulada).length;

  const detalle = (v: (typeof filas)[number]) =>
    (v.venta_items ?? [])
      .map((i) =>
        i.equipos
          ? `${i.equipos.modelo ?? ""}${i.equipos.gb ? ` ${i.equipos.gb} GB` : ""}`
          : (i.accesorios?.nombre ?? ""),
      )
      .filter(Boolean)
      .join(" · ") || "—";

  const metodos = (pagos: { metodo: string }[] | null) =>
    [...new Set((pagos ?? []).map((p) => METODO_ETIQUETA[p.metodo as MetodoPago] ?? p.metodo))].join(
      " · ",
    ) || "—";

  return (
    <div className="mx-auto max-w-[92rem]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Historial de ventas</h1>
          <p className="mt-1 text-sm text-muted-foreground">{DESC}</p>
        </div>
        <div className="flex flex-wrap gap-3">
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
              placeholder="Cliente, vendedor, IMEI, modelo o N° de comprobante"
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
      </div>

      {ventas.isLoading && (
        <div className="solid-panel mt-6 overflow-hidden p-4">
          <SkeletonFilas filas={6} columnas={conGanancias ? 8 : 7} />
        </div>
      )}

      {!ventas.isLoading && !porTienda.length && (
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
                  <th className="px-4 py-3 font-medium">Detalle</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Vendedor</th>
                  <th className="px-4 py-3 font-medium">Pagos</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  {conGanancias && <th className="px-4 py-3 text-right font-medium">Ganancia</th>}
                  <th className="px-4 py-3 font-medium">Comprobante</th>
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
                    <td className="num px-4 py-2.5 text-muted-foreground">{fechaHora(v.fecha)}</td>
                    <td className="px-4 py-2.5">{detalle(v)}</td>
                    <td className="px-4 py-2.5">{v.clientes?.nombre ?? "Sin cliente"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {v.usuarios?.nombre ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{metodos(v.pagos)}</td>
                    <td className="num px-4 py-2.5 text-right">{formatCLP(v.total)}</td>
                    {conGanancias && (
                      <td className="num px-4 py-2.5 text-right text-[var(--positive)]">
                        {formatCLP(v.ganancia ?? 0)}
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      {v.anulada ? (
                        <span className="text-xs text-red-300">Anulada</span>
                      ) : (
                        <BotonComprobante ventaId={v.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
