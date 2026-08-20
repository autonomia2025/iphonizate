import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Warehouse, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useFlashEscaneo } from "@/components/motion";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { CampoImei } from "@/components/CampoImei";
import {
  ESTADO_CLASE,
  ESTADO_ETIQUETA,
  fechaLarga,
  puedeIngresarEquipos,
  type EquipoEstado,
} from "@/lib/inventario";

const DESC = "Traslados entre tiendas y bodega, con trazabilidad por equipo.";
const NO_TRASLADABLES: EquipoEstado[] = ["VENDIDO", "ENTREGADO", "RESERVADO"];

export const Route = createFileRoute("/movimientos")({
  head: () => ({
    meta: [
      { title: "Movimientos · riff store OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Movimientos · riff store OS" },
      { property: "og:description", content: DESC },
    ],
  }),
  component: MovimientosPage,
});

type Escaneado = {
  id: string;
  imei: string;
  modelo: string;
  color: string | null;
  estado: EquipoEstado;
  tienda: string | null;
};

const selectClase =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

function MovimientosPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const esVendedor = rol === "vendedor";
  /* El vendedor solo puede devolver a bodega desde su tienda */
  const puedeTrasladar = puedeIngresarEquipos(rol) || esVendedor;
  const esJefe = rol === "jefe_tienda";
  const origenFijo = esJefe || esVendedor;
  const queryClient = useQueryClient();

  const [origen, setOrigen] = useState<string>("");
  const [destino, setDestino] = useState<string>("");
  const [lista, setLista] = useState<Escaneado[]>([]);
  const [scan, setScan] = useState("");
  const [guardando, setGuardando] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const [filtroTienda, setFiltroTienda] = useState<string>("");
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");

  const tiendas = useQuery({
    queryKey: ["tiendas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tiendas")
        .select("id, nombre, es_bodega")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const bodega = (tiendas.data ?? []).find((t) => t.es_bodega);
  const etiquetaTienda = (t: { nombre: string; es_bodega?: boolean | null }) =>
    t.es_bodega ? `${t.nombre} · bodega` : t.nombre;

  const devolverABodega = () => {
    if (!bodega) {
      toast.error("No hay una bodega configurada en el sistema");
      return;
    }
    const miTienda = usuario?.tienda_id ?? origen;
    if (!miTienda) {
      toast.error("Tu usuario no tiene tienda asignada: elige el origen a mano");
      return;
    }
    if (miTienda === bodega.id) {
      toast.warning("Ya estás en la bodega: elige otro destino");
      return;
    }
    setOrigen(miTienda);
    setDestino(bodega.id);
    setLista([]);
    scanRef.current?.focus();
    toast.success(`Listo para devolver a ${bodega.nombre}: escanea los equipos`);
  };

  useEffect(() => {
    if (origenFijo && usuario?.tienda_id) setOrigen(usuario.tienda_id);
  }, [origenFijo, usuario?.tienda_id]);

  /* El vendedor solo tiene un destino posible: la bodega */
  useEffect(() => {
    if (esVendedor && bodega) setDestino(bodega.id);
  }, [esVendedor, bodega]);

  useEffect(() => {
    if (puedeTrasladar) scanRef.current?.focus();
  }, [puedeTrasladar]);

  const movimientos = useQuery({
    queryKey: ["v_movimientos", filtroTienda, desde, hasta],
    queryFn: async () => {
      let q = supabase
        .from("v_movimientos")
        .select("id, fecha, imei, modelo, desde_id, desde, hacia_id, hacia, movido_por")
        .order("fecha", { ascending: false })
        .limit(400);
      if (desde) q = q.gte("fecha", new Date(`${desde}T00:00:00`).toISOString());
      if (hasta) q = q.lte("fecha", new Date(`${hasta}T23:59:59`).toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filasHistorial = useMemo(() => {
    const filas = movimientos.data ?? [];
    if (!filtroTienda) return filas;
    return filas.filter((m) => m.desde_id === filtroTienda || m.hacia_id === filtroTienda);
  }, [movimientos.data, filtroTienda]);

  const nombreTienda = (id: string) =>
    (tiendas.data ?? []).find((t) => t.id === id)?.nombre ?? "la tienda seleccionada";

  const flash = useFlashEscaneo();

  const escanear = async (valorCrudo: string) => {
    const imei = valorCrudo.trim();
    setScan("");
    if (!imei) return;
    if (!origen) {
      flash.error(); toast.error("Elige primero la tienda de origen");
      return;
    }
    if (lista.some((e) => e.imei === imei)) {
      flash.error(); toast.warning(`El IMEI ${imei} ya está en la lista`);
      return;
    }

    const { data, error } = await supabase
      .from("v_stock")
      .select("id, imei, modelo, color, estado, ubicacion_id, tienda")
      .eq("imei", imei)
      .maybeSingle();

    if (error) {
      flash.error(); toast.error("No se pudo verificar el IMEI", { description: error.message });
      return;
    }
    if (!data || !data.id) {
      flash.error(); toast.error("Ese IMEI no está en el sistema");
      return;
    }

    const estado = (data.estado ?? "POR_REVISAR") as EquipoEstado;
    if (NO_TRASLADABLES.includes(estado)) {
      flash.error(); toast.error(`No se puede trasladar: está ${ESTADO_ETIQUETA[estado].toLowerCase()}`, {
        description:
          estado === "RESERVADO"
            ? "El equipo está comprometido con un cliente; libera la reserva antes de moverlo."
            : "El equipo ya salió de la cadena, no corresponde trasladarlo.",
      });
      return;
    }
    if (data.ubicacion_id !== origen) {
      flash.error(); toast.error("Ese equipo no está en el origen seleccionado", {
        description: `Está en ${data.tienda ?? "una ubicación sin asignar"}, no en ${nombreTienda(origen)}.`,
      });
      return;
    }

    setLista((prev) => [
      {
        id: data.id!,
        imei: data.imei ?? imei,
        modelo: data.modelo ?? "",
        color: data.color,
        estado,
        tienda: data.tienda,
      },
      ...prev,
    ]);
    flash.ok();
  };

  const confirmar = async () => {
    if (!origen || !destino) {
      toast.error("Elige origen y destino");
      return;
    }
    if (origen === destino) {
      toast.error("El origen y el destino deben ser distintos");
      return;
    }
    if (lista.length === 0) {
      toast.error("Escanea al menos un equipo");
      return;
    }
    setGuardando(true);
    const { data, error } = await supabase.rpc("trasladar_equipos", {
      _imeis: lista.map((e) => e.imei),
      _origen: origen,
      _destino: destino,
    });
    setGuardando(false);

    if (error) {
      toast.error("No se realizó el traslado", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    toast.success(
      `${data ?? lista.length} equipo${(data ?? lista.length) === 1 ? "" : "s"} trasladado${(data ?? lista.length) === 1 ? "" : "s"} a ${nombreTienda(destino)}`,
    );
    setLista([]);
    void movimientos.refetch();
    void queryClient.invalidateQueries({ queryKey: ["v_stock"] });
    scanRef.current?.focus();
  };

  return (
    <div className="mx-auto max-w-[86rem]">
      <div>
        <h1 className="font-display text-2xl font-semibold">Movimientos</h1>
        <p className="mt-1 text-sm text-muted-foreground">{DESC}</p>
      </div>

      {puedeTrasladar && (
        <section className="glass mt-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold">
              {esVendedor ? "Devolver equipos a bodega" : "Trasladar equipos"}
            </h2>
            {bodega && (
              <Button variant="secondary" className="gap-2" onClick={devolverABodega}>
                <Warehouse className="size-4" /> Devolver a bodega
              </Button>
            )}
          </div>

          {esVendedor ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Como vendedor puedes devolver equipos de tu tienda a{" "}
              {bodega ? etiquetaTienda(bodega) : "la bodega"}. Escanea los equipos y confirma.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                  Origen
                </label>
                <select
                  value={origen}
                  disabled={origenFijo}
                  onChange={(e) => {
                    setOrigen(e.target.value);
                    setLista([]);
                  }}
                  className={`${selectClase} ${origenFijo ? "opacity-60" : ""}`}
                >
                  <option value="">Selecciona…</option>
                  {(tiendas.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {etiquetaTienda(t)}
                    </option>
                  ))}
                </select>
                {esJefe && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Como jefe de tienda solo puedes mover equipos que estén en tu tienda.
                  </p>
                )}
              </div>

              <div className="hidden items-center justify-center pt-6 sm:flex">
                <ArrowRight className="size-5 text-[var(--accent-store)]" />
              </div>

              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                  Destino
                </label>
                <select
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                  className={selectClase}
                >
                  <option value="">Selecciona…</option>
                  {(tiendas.data ?? [])
                    .filter((t) => t.id !== origen)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {etiquetaTienda(t)}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}

          <div className="mt-5">
            <CampoImei
              valor={scan}
              onValor={setScan}
              onAgregar={(imei) => void escanear(imei)}
              claseFlash={flash.clase}
              inputRef={scanRef}
              placeholder={esVendedor ? "IMEI del equipo que devuelves" : "IMEI del equipo a trasladar"}
            />
          </div>


          {lista.length > 0 && (
            <ul className="mt-4 space-y-2">
              {lista.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {e.modelo}
                      {e.color ? ` · ${e.color}` : ""}
                    </p>
                    <p className="num mt-0.5 text-xs tracking-[0.04em] text-muted-foreground">
                      {e.imei} · {e.tienda ?? "sin ubicación"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${ESTADO_CLASE[e.estado]}`}
                    >
                      {ESTADO_ETIQUETA[e.estado]}
                    </span>
                    <button
                      type="button"
                      aria-label={`Quitar ${e.imei} de la lista`}
                      onClick={() => setLista((prev) => prev.filter((x) => x.id !== e.id))}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/8 hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Button
            onClick={() => void confirmar()}
            disabled={guardando || lista.length === 0 || !destino}
            className="accent-glow mt-5"
          >
            {guardando
              ? "Trasladando…"
              : `Confirmar traslado de ${lista.length} equipo${lista.length === 1 ? "" : "s"}`}
          </Button>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-display text-base font-semibold">Historial de movimientos</h2>

        <div className="glass mt-3 flex flex-wrap items-end gap-4 p-4">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Tienda
            </label>
            <select
              value={filtroTienda}
              onChange={(e) => setFiltroTienda(e.target.value)}
              className={`${selectClase} min-w-52`}
            >
              <option value="">Todas</option>
              {(tiendas.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Desde
            </label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className={`${selectClase} num`}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Hasta
            </label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className={`${selectClase} num`}
            />
          </div>
          {(filtroTienda || desde || hasta) && (
            <button
              type="button"
              onClick={() => {
                setFiltroTienda("");
                setDesde("");
                setHasta("");
              }}
              className="h-11 rounded-xl border border-white/10 px-3 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="solid-panel mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Equipo</th>
                  <th className="px-4 py-3 font-medium">Desde</th>
                  <th className="px-4 py-3 font-medium">Hacia</th>
                  <th className="px-4 py-3 font-medium">Quién lo movió</th>
                </tr>
              </thead>
              <tbody>
                {filasHistorial.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                  >
                    <td className="num px-4 py-2.5 text-muted-foreground">{fechaLarga(m.fecha)}</td>
                    <td className="px-4 py-2.5">
                      {m.modelo}
                      <span className="num ml-2 text-xs tracking-[0.04em] text-muted-foreground">
                        {m.imei}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{m.desde ?? "—"}</td>
                    <td className="px-4 py-2.5">{m.hacia ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{m.movido_por ?? "—"}</td>
                  </tr>
                ))}
                {filasHistorial.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      {movimientos.isLoading
                        ? "Cargando movimientos…"
                        : "Todavía no hay movimientos registrados con ese filtro."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
