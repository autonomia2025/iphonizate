import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { EquipoDetalle, type EquipoFila } from "@/components/inventario/EquipoDetalle";
import { useEquiposEnVivo } from "@/components/inventario/useEquiposEnVivo";
import { AnimatePresence, EstadoVacio, SkeletonFilas, motion } from "@/components/motion";
import { RESORTE_RAPIDO, varsFila, varsListaFilas } from "@/lib/motion";
import { formatCLP } from "@/lib/stores";
import { limpiarImei } from "@/components/CampoImei";
import {
  ESTADO_CLASE,
  ESTADO_ETIQUETA,
  diasEnStock,
  puedeVerCostos,
  type EquipoEstado,
} from "@/lib/inventario";

const DESC = "Equipos disponibles por tienda, con batería, capacidad y precio de lista.";

/* Estados que se pueden sumar a la vista para no esconder nada */
const EXTRAS: EquipoEstado[] = ["POR_REVISAR", "EN_TECNICO", "RESERVADO"];

export const Route = createFileRoute("/stock")({
  head: () => ({
    meta: [
      { title: "Stock · riff store OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Stock · riff store OS" },
      { property: "og:description", content: DESC },
    ],
  }),
  component: StockPage,
});

const claveModelo = (modelo?: string | null, gb?: number | null) =>
  `${(modelo ?? "").trim().toLowerCase()}:${gb ?? 0}`;

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition-all duration-200 ${
        activo
          ? "accent-glow border-[var(--accent-store)]/50 bg-[var(--accent-store-soft)] text-foreground"
          : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StockPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const conCostos = puedeVerCostos(rol);

  const [busqueda, setBusqueda] = useState("");
  const [extras, setExtras] = useState<EquipoEstado[]>([]);
  const [seleccionado, setSeleccionado] = useState<EquipoFila | null>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    buscadorRef.current?.focus();
  }, []);

  const stock = useQuery({
    queryKey: ["v_stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_stock")
        .select(
          "id, imei, modelo, gb, color, bateria, categoria, estado, ubicacion_id, tienda, fecha_ingreso",
        )
        .order("fecha_ingreso", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const precios = useQuery({
    queryKey: ["precios"],
    queryFn: async () => {
      const { data, error } = await supabase.from("precios").select("modelo, gb, precio");
      if (error) throw error;
      return data ?? [];
    },
  });

  const full = useQuery({
    queryKey: ["v_equipos_full"],
    enabled: conCostos,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_equipos_full")
        .select("id, costo, email_vinculado, proveedor, lote, notas");
      if (error) throw error;
      return data ?? [];
    },
  });

  const mapaPrecios = useMemo(() => {
    const mapa = new Map<string, number>();
    (precios.data ?? []).forEach((p) => mapa.set(claveModelo(p.modelo, p.gb), p.precio));
    return mapa;
  }, [precios.data]);

  const mapaExtras = useMemo(() => {
    const mapa = new Map<string, NonNullable<typeof full.data>[number]>();
    (full.data ?? []).forEach((f) => f.id && mapa.set(f.id, f));
    return mapa;
  }, [full.data]);

  const { enVivo } = useEquiposEnVivo(() => {
    void stock.refetch();
    if (conCostos) void full.refetch();
  });

  const todas: (EquipoFila & { precio: number | null })[] = useMemo(
    () =>
      (stock.data ?? [])
        .filter((e) => !!e.id)
        .map((e) => {
          const ex = mapaExtras.get(e.id!);
          return {
            id: e.id!,
            imei: e.imei ?? "",
            modelo: e.modelo ?? "",
            gb: e.gb,
            color: e.color,
            bateria: e.bateria,
            categoria: e.categoria,
            estado: (e.estado ?? "POR_REVISAR") as EquipoEstado,
            tienda: e.tienda,
            ubicacion_id: e.ubicacion_id,
            fecha_ingreso: e.fecha_ingreso,
            precio: mapaPrecios.get(claveModelo(e.modelo, e.gb)) ?? null,
            costo: ex?.costo ?? null,
            email_vinculado: ex?.email_vinculado ?? null,
            proveedor: ex?.proveedor ?? null,
            lote: ex?.lote ?? null,
            notas: ex?.notas ?? null,
          };
        }),
    [stock.data, mapaExtras, mapaPrecios],
  );

  const conteos = useMemo(() => {
    const mapa = new Map<EquipoEstado, number>();
    todas.forEach((e) => mapa.set(e.estado, (mapa.get(e.estado) ?? 0) + 1));
    return mapa;
  }, [todas]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const visibles: EquipoEstado[] = ["DISPONIBLE", ...extras];
    return todas.filter((e) => {
      if (!visibles.includes(e.estado)) return false;
      if (!q) return true;
      return (
        e.imei.toLowerCase().includes(q) ||
        e.modelo.toLowerCase().includes(q) ||
        (e.color ?? "").toLowerCase().includes(q)
      );
    });
  }, [todas, extras, busqueda]);

  const porTienda = useMemo(() => {
    const mapa = new Map<string, { tienda: string; filas: typeof filtradas }>();
    filtradas.forEach((e) => {
      const clave = e.ubicacion_id ?? "sin-ubicacion";
      const nombre = e.tienda ?? "Sin ubicación";
      const grupo = mapa.get(clave) ?? { tienda: nombre, filas: [] };
      grupo.filas.push(e);
      mapa.set(clave, grupo);
    });
    return [...mapa.values()].sort((a, b) => a.tienda.localeCompare(b.tienda, "es"));
  }, [filtradas]);

  const sinPrecio = filtradas.filter((e) => e.precio == null).length;

  const buscarImei = (valor: string) => {
    const imei = limpiarImei(valor);
    if (imei.length !== 15) return;
    const equipo = todas.find((e) => e.imei === imei);
    if (!equipo) {
      toast.error("Ese IMEI no está en el sistema");
      return;
    }
    setSeleccionado(equipo);
  };

  const toggleExtra = (estado: EquipoEstado) =>
    setExtras((prev) => (prev.includes(estado) ? prev.filter((e) => e !== estado) : [...prev, estado]));

  return (
    <div className="mx-auto max-w-[86rem]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Stock</h1>
          <p className="mt-1 text-sm text-muted-foreground">{DESC}</p>
        </div>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            aria-hidden
            className={`size-2 rounded-full ${enVivo ? "punto-vivo bg-emerald-400" : "bg-white/25"}`}
          />
          {enVivo ? "En vivo" : "Conectando…"}
        </span>
      </div>

      <div className="glass mt-6 p-4">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={buscadorRef}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                buscarImei(busqueda);
              }
            }}
            placeholder="Escanea o escribe el IMEI y presiona Enter · también busca por modelo o color"
            className="num h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm outline-none transition-all duration-200 placeholder:font-sans placeholder:text-muted-foreground focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs uppercase tracking-wide text-muted-foreground">
            Ver también
          </span>
          {EXTRAS.map((s) => (
            <Chip key={s} activo={extras.includes(s)} onClick={() => toggleExtra(s)}>
              {ESTADO_ETIQUETA[s]} {conteos.get(s) ?? 0}
            </Chip>
          ))}
          <span className="num ml-auto text-xs text-muted-foreground">
            {conteos.get("DISPONIBLE") ?? 0} disponibles en la cadena
          </span>
        </div>
      </div>

      {sinPrecio > 0 && (
        <p className="mt-3 text-xs text-amber-300">
          {sinPrecio} equipo{sinPrecio === 1 ? "" : "s"} sin precio de lista cargado: agrégalo en
          Precios para que el vendedor no tenga que adivinar.
        </p>
      )}

      {stock.isLoading && (
        <div className="solid-panel mt-6 overflow-hidden p-4">
          <SkeletonFilas filas={6} columnas={conCostos ? 8 : 7} />
        </div>
      )}

      {!stock.isLoading && porTienda.length === 0 && (
        <div className="solid-panel mt-6 overflow-hidden py-10">
          <EstadoVacio
            icono={Boxes}
            titulo="No hay equipos que mostrar"
            mensaje="Nada calza con el filtro. Prueba con otro criterio, activa los estados de arriba o ingresa equipos nuevos."
          />
        </div>
      )}

      {porTienda.map((grupo) => (
        <section key={grupo.tienda} className="solid-panel mt-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
            <span className="text-sm font-medium">{grupo.tienda}</span>
            <span className="num text-xs text-muted-foreground">
              {grupo.filas.length} equipo{grupo.filas.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">IMEI</th>
                  <th className="px-4 py-3 font-medium">Modelo</th>
                  <th className="px-4 py-3 text-right font-medium">GB</th>
                  <th className="px-4 py-3 font-medium">Color</th>
                  <th className="px-4 py-3 text-right font-medium">Batería %</th>
                  <th className="px-4 py-3 text-right font-medium">Precio de lista</th>
                  <th className="px-4 py-3 text-right font-medium">Días en stock</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  {conCostos && <th className="px-4 py-3 text-right font-medium">Costo</th>}
                </tr>
              </thead>
              <motion.tbody initial="oculto" animate="visible" variants={varsListaFilas}>
                <AnimatePresence initial={false}>
                  {grupo.filas.map((e) => (
                    <motion.tr
                      key={e.id}
                      layout
                      variants={varsFila}
                      initial="oculto"
                      animate="visible"
                      exit="salida"
                      whileHover={{ x: 2 }}
                      transition={RESORTE_RAPIDO}
                      onClick={() => setSeleccionado(e)}
                      className="fila-densa cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/[0.035]"
                    >
                      <td className="num px-4 py-2.5 tracking-[0.04em]">{e.imei}</td>
                      <td className="px-4 py-2.5">{e.modelo}</td>
                      <td className="num px-4 py-2.5 text-right">{e.gb ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{e.color ?? "—"}</td>
                      <td className="num px-4 py-2.5 text-right">{e.bateria ?? "—"}</td>
                      <td className="num px-4 py-2.5 text-right">
                        {e.precio != null ? (
                          formatCLP(e.precio)
                        ) : (
                          <span className="text-xs text-amber-300">sin precio</span>
                        )}
                      </td>
                      <td className="num px-4 py-2.5 text-right">{diasEnStock(e.fecha_ingreso)}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${ESTADO_CLASE[e.estado]}`}
                        >
                          {ESTADO_ETIQUETA[e.estado]}
                        </span>
                      </td>
                      {conCostos && (
                        <td className="num px-4 py-2.5 text-right">
                          {e.costo != null ? formatCLP(e.costo) : "—"}
                        </td>
                      )}
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </motion.tbody>
            </table>
          </div>
        </section>
      ))}

      <EquipoDetalle
        equipo={seleccionado}
        onCerrar={() => setSeleccionado(null)}
        puedeCostos={conCostos}
        onCambio={() => {
          void stock.refetch();
          if (conCostos) void full.refetch();
        }}
      />
    </div>
  );
}
