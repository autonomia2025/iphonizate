import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, PackageSearch, Plus, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { limpiarImei } from "@/components/CampoImei";
import { IngresarEquipoModal } from "@/components/inventario/IngresarEquipoModal";
import { ImportarEquiposModal } from "@/components/inventario/ImportarEquiposModal";
import { EquipoDetalle, type EquipoFila } from "@/components/inventario/EquipoDetalle";
import { tieneAlertaImei } from "@/components/inventario/VerificacionEquipo";

import { useEquiposEnVivo } from "@/components/inventario/useEquiposEnVivo";
import {
  AnimatePresence,
  EstadoVacio,
  SkeletonFilas,
  motion,
} from "@/components/motion";
import { RESORTE_RAPIDO, varsFila, varsListaFilas } from "@/lib/motion";
import { formatCLP } from "@/lib/stores";
import {
  CATEGORIA_ETIQUETA,
  ESTADOS,
  ESTADO_CLASE,
  ESTADO_ETIQUETA,
  diasEnStock,
  puedeIngresarEquipos,
  puedeVerCostos,
  type EquipoEstado,
} from "@/lib/inventario";

const DESC = "Equipos de la cadena por IMEI, estado, ubicación y días en stock.";

export const Route = createFileRoute("/inventario")({
  head: () => ({
    meta: [
      { title: "Inventario · riff store OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Inventario · riff store OS" },
      { property: "og:description", content: DESC },
    ],
  }),
  component: InventarioPage,
});

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

function InventarioPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const conCostos = puedeVerCostos(rol);
  const puedeIngresar = puedeIngresarEquipos(rol);

  const [busqueda, setBusqueda] = useState("");
  const [ubicacion, setUbicacion] = useState<string | null>(null);
  const [estado, setEstado] = useState<EquipoEstado | null>(null);
  const [soloAlertas, setSoloAlertas] = useState(false);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [importAbierto, setImportAbierto] = useState(false);
  const [seleccionado, setSeleccionado] = useState<EquipoFila | null>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    buscadorRef.current?.focus();
  }, []);

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

  const stock = useQuery({
    queryKey: ["v_stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_stock")
        .select(
          "id, imei, modelo, gb, color, bateria, categoria, estado, ubicacion_id, tienda, fecha_ingreso, serie, imei2, icloud_activo, lista_negra, bloqueo_operador, reemplazado_apple, garantia_estado, pais_compra, fecha_compra_estimada, bloqueo_usa, verificado_at",
        )
        .order("fecha_ingreso", { ascending: false });

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

  const extras = useMemo(() => {
    const mapa = new Map<string, NonNullable<typeof full.data>[number]>();
    (full.data ?? []).forEach((f) => f.id && mapa.set(f.id, f));
    return mapa;
  }, [full.data]);

  const filas: EquipoFila[] = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (stock.data ?? [])
      .filter((e) => !!e.id)
      .map((e) => {
        const ex = extras.get(e.id!);
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
          serie: e.serie,
          imei2: e.imei2,
          icloud_activo: e.icloud_activo,
          lista_negra: e.lista_negra,
          bloqueo_operador: e.bloqueo_operador,
          reemplazado_apple: e.reemplazado_apple,
          garantia_estado: e.garantia_estado,
          pais_compra: e.pais_compra,
          fecha_compra_estimada: e.fecha_compra_estimada,
          bloqueo_usa: e.bloqueo_usa,
          verificado_at: e.verificado_at,
          costo: ex?.costo ?? null,
          email_vinculado: ex?.email_vinculado ?? null,
          proveedor: ex?.proveedor ?? null,
          lote: ex?.lote ?? null,
          notas: ex?.notas ?? null,
        } as EquipoFila & { ubicacion_id: string | null };
      })
      .filter((e) => {
        if (ubicacion && (e as { ubicacion_id?: string | null }).ubicacion_id !== ubicacion)
          return false;
        if (estado && e.estado !== estado) return false;
        if (soloAlertas && !tieneAlertaImei(e)) return false;
        if (!q) return true;
        return (
          e.imei.toLowerCase().includes(q) ||
          e.modelo.toLowerCase().includes(q) ||
          (e.color ?? "").toLowerCase().includes(q)
        );
      });
  }, [stock.data, extras, busqueda, ubicacion, estado, soloAlertas]);


  const { enVivo, destellos } = useEquiposEnVivo(() => {
    void stock.refetch();
    if (conCostos) void full.refetch();
  });

  /* Conteo por estado para que nadie crea que un equipo desapareció */
  const conteos = useMemo(() => {
    const mapa = new Map<EquipoEstado, number>();
    (stock.data ?? []).forEach((e) => {
      const s = (e.estado ?? "POR_REVISAR") as EquipoEstado;
      mapa.set(s, (mapa.get(s) ?? 0) + 1);
    });
    return mapa;
  }, [stock.data]);

  const estadosPresentes = useMemo(
    () => ESTADOS.filter((s) => (conteos.get(s) ?? 0) > 0),
    [conteos],
  );

  /* Equipos con iCloud activo o lista negra: no dependen del filtro de estado */
  const conAlertas = useMemo(
    () => (stock.data ?? []).filter((e) => tieneAlertaImei(e)).length,
    [stock.data],
  );


  const abrirPorImei = (valor: string) => {
    const imei = limpiarImei(valor);
    if (imei.length !== 15) return;
    const equipo = filas.find((e) => e.imei === imei);
    if (!equipo) {
      toast.error("Ese IMEI no está en el sistema o está fuera del filtro actual");
      return;
    }
    setSeleccionado(equipo);
  };

  return (
    <div className="mx-auto max-w-[86rem]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Inventario</h1>
          <p className="mt-1 text-sm text-muted-foreground">{DESC}</p>
        </div>
        {puedeIngresar && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setImportAbierto(true)} className="gap-2">
              <FileSpreadsheet className="size-4" /> Importar desde Excel
            </Button>
            <Button onClick={() => setModalAbierto(true)} className="accent-glow gap-2">
              <Plus className="size-4" /> Ingresar equipo
            </Button>
          </div>
        )}
      </div>

      <div className="glass mt-6 p-4">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={buscadorRef}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              /* Enter con 15 dígitos abre la ficha del equipo */
              if (e.key === "Enter") {
                e.preventDefault();
                abrirPorImei(busqueda);
              }
            }}
            placeholder="Escanea o escribe el IMEI y presiona Enter · también busca por modelo o color"
            className="num h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm outline-none transition-all duration-200 placeholder:font-sans placeholder:text-muted-foreground focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs uppercase tracking-wide text-muted-foreground">
            Ubicación
          </span>
          <Chip activo={!ubicacion} onClick={() => setUbicacion(null)}>
            Todas
          </Chip>
          {(tiendas.data ?? []).map((t) => (
            <Chip key={t.id} activo={ubicacion === t.id} onClick={() => setUbicacion(t.id)}>
              {t.nombre}
            </Chip>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs uppercase tracking-wide text-muted-foreground">Estado</span>
          <Chip activo={!estado} onClick={() => setEstado(null)}>
            Todos {stock.data?.length ?? 0}
          </Chip>
          {(estadosPresentes.length ? estadosPresentes : ESTADOS).map((s) => (
            <Chip key={s} activo={estado === s} onClick={() => setEstado(s)}>
              {ESTADO_ETIQUETA[s]} {conteos.get(s) ?? 0}
            </Chip>
          ))}
          <button
            type="button"
            onClick={() => setSoloAlertas((v) => !v)}
            className={`ml-1 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all duration-200 ${
              soloAlertas
                ? "border-red-400/50 bg-red-500/15 text-red-200"
                : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldAlert className="size-3.5" /> Con alertas {conAlertas}
          </button>
        </div>
      </div>


      <div className="solid-panel mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Equipos de la cadena
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              aria-hidden
              className={`size-2 rounded-full ${enVivo ? "punto-vivo bg-emerald-400" : "bg-white/25"}`}
            />
            {enVivo ? "En vivo" : "Conectando…"}
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
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium">Ubicación</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Días en stock</th>
                {conCostos && <th className="px-4 py-3 text-right font-medium">Costo</th>}
              </tr>
            </thead>
            <motion.tbody initial="oculto" animate="visible" variants={varsListaFilas}>
              <AnimatePresence initial={false}>
              {filas.map((e) => (
                <motion.tr
                  key={`${e.id}-${destellos[e.id] ?? 0}`}
                  layout
                  variants={varsFila}
                  initial="oculto"
                  animate="visible"
                  exit="salida"
                  whileHover={{ x: 2 }}
                  transition={RESORTE_RAPIDO}
                  onClick={() => setSeleccionado(e)}
                  className={`fila-densa cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/[0.035] ${destellos[e.id] ? "destello" : ""}`}
                >
                  <td className="num px-4 py-2.5 tracking-[0.04em]">{e.imei}</td>
                  <td className="px-4 py-2.5">{e.modelo}</td>
                  <td className="num px-4 py-2.5 text-right">{e.gb ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{e.color ?? "—"}</td>
                  <td className="num px-4 py-2.5 text-right">{e.bateria ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {e.categoria
                      ? (CATEGORIA_ETIQUETA[e.categoria as keyof typeof CATEGORIA_ETIQUETA] ??
                        e.categoria)
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">{e.tienda ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${ESTADO_CLASE[e.estado]}`}
                    >
                      {ESTADO_ETIQUETA[e.estado]}
                    </span>
                  </td>
                  <td className="num px-4 py-2.5 text-right">{diasEnStock(e.fecha_ingreso)}</td>
                  {conCostos && (
                    <td className="num px-4 py-2.5 text-right">
                      {e.costo != null ? formatCLP(e.costo) : "—"}
                    </td>
                  )}
                </motion.tr>
              ))}
              </AnimatePresence>
              {filas.length === 0 && (
                <tr>
                  <td
                    colSpan={conCostos ? 10 : 9}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    {stock.isLoading ? (
                      <SkeletonFilas filas={6} columnas={conCostos ? 10 : 9} />
                    ) : (
                      <EstadoVacio
                        icono={PackageSearch}
                        titulo="Acá no hay nada que mostrar"
                        mensaje="Ningún equipo calza con el filtro. Prueba con otro criterio o ingresa equipos nuevos."
                      />
                    )}
                  </td>
                </tr>
              )}
            </motion.tbody>
          </table>
        </div>
      </div>

      <p className="num mt-3 text-xs text-muted-foreground">
        {filas.length} equipo{filas.length === 1 ? "" : "s"} en pantalla
      </p>

      {puedeIngresar && (
        <>
          <IngresarEquipoModal
            abierto={modalAbierto}
            onCerrar={() => setModalAbierto(false)}
            tiendas={tiendas.data ?? []}
            tiendaPorDefecto={usuario?.tienda_id ?? null}
            puedeCostos={conCostos}
            onGuardado={() => {
              void stock.refetch();
              if (conCostos) void full.refetch();
            }}
          />
          <ImportarEquiposModal
            abierto={importAbierto}
            onCerrar={() => setImportAbierto(false)}
            tiendas={tiendas.data ?? []}
            puedeCostos={conCostos}
            onImportado={() => {
              void stock.refetch();
              if (conCostos) void full.refetch();
            }}
          />
        </>
      )}

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
