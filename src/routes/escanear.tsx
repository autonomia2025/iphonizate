import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageCheck, Printer, ScanLine, Warehouse, Wrench } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { useFlashEscaneo } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoImei } from "@/components/CampoImei";
import { EtiquetasModal } from "@/components/inventario/EtiquetasModal";
import { EquipoTimeline } from "@/components/inventario/EquipoTimeline";
import { formatCLP } from "@/lib/stores";
import {
  CATEGORIA_ETIQUETA,
  ESTADO_CLASE,
  ESTADO_ETIQUETA,
  SERVICIOS,
  diasEnStock,
  fechaLarga,
  puedeVerCostos,
  type EquipoEstado,
  type ServicioTipo,
} from "@/lib/inventario";

const DESC =
  "Escanea el código de barras del equipo y ve toda su ficha, su historia y lo que dejó dicho la persona anterior.";

export const Route = createFileRoute("/escanear")({
  head: () => ({
    meta: [
      { title: "Escanear equipo · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Escanear equipo · iPhonizate OS" },
      { property: "og:description", content: DESC },
    ],
  }),
  component: EscanearPage,
});

type Ficha = {
  id: string;
  imei: string;
  modelo: string;
  gb: number | null;
  color: string | null;
  bateria: number | null;
  categoria: string | null;
  estado: EquipoEstado;
  tienda: string | null;
  ubicacion_id: string | null;
  fecha_ingreso: string | null;
  costo: number | null;
  email_vinculado: string | null;
  proveedor: string | null;
  lote: string | null;
  notas: string | null;
  precio: number | null;
};

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className="mt-0.5 text-sm">{valor ?? "—"}</p>
    </div>
  );
}

function EscanearPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const conCostos = puedeVerCostos(rol);
  const queryClient = useQueryClient();
  const flash = useFlashEscaneo();
  const scanRef = useRef<HTMLInputElement>(null);

  const [scan, setScan] = useState("");
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [recientes, setRecientes] = useState<{ imei: string; modelo: string }[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [accion, setAccion] = useState<null | "disponible" | "bodega" | "tecnico">(null);
  const [etiquetaAbierta, setEtiquetaAbierta] = useState(false);
  const [etapaEtiqueta, setEtapaEtiqueta] = useState<string | null>(null);
  const [arreglos, setArreglos] = useState<Partial<Record<ServicioTipo, string>>>({});
  const [panelArreglos, setPanelArreglos] = useState(false);

  useEffect(() => {
    scanRef.current?.focus();
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
  const bodega = (tiendas.data ?? []).find((t) => t.es_bodega);

  const servicios = useQuery({
    queryKey: ["servicios_equipo", ficha?.id],
    enabled: !!ficha?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_servicios_equipo")
        .select("id, tipo, costo, estado")
        .eq("equipo_id", ficha!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const costosArreglo = useQuery({
    queryKey: ["costos_arreglo", ficha?.modelo],
    enabled: conCostos && !!ficha?.modelo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("costos_arreglo")
        .select("tipo, costo")
        .eq("modelo", ficha!.modelo);
      if (error) throw error;
      return new Map((data ?? []).map((fila) => [fila.tipo, String(fila.costo)]));
    },
  });
  const pendientes = (servicios.data ?? []).filter((s) => s.estado !== "listo");

  const cargar = async (imeiCrudo: string) => {
    const imei = imeiCrudo.trim();
    setScan("");
    if (!imei) return;
    setBuscando(true);

    const { data, error } = await supabase
      .from("v_stock")
      .select(
        "id, imei, modelo, gb, color, bateria, categoria, estado, ubicacion_id, tienda, fecha_ingreso",
      )
      .eq("imei", imei)
      .maybeSingle();

    if (error || !data?.id) {
      setBuscando(false);
      flash.error();
      toast.error("Ese IMEI no está en el sistema", {
        description: "Puedes ingresarlo desde Inventario para que quede con su etiqueta.",
      });
      return;
    }

    const [extra, precio] = await Promise.all([
      conCostos
        ? supabase
            .from("v_equipos_full")
            .select("costo, email_vinculado, proveedor, lote, notas")
            .eq("id", data.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("precios")
        .select("precio")
        .eq("modelo", data.modelo ?? "")
        .eq("gb", data.gb ?? 0)
        .maybeSingle(),
    ]);

    setBuscando(false);
    setFicha({
      id: data.id,
      imei: data.imei ?? imei,
      modelo: data.modelo ?? "",
      gb: data.gb,
      color: data.color,
      bateria: data.bateria,
      categoria: data.categoria,
      estado: (data.estado ?? "POR_REVISAR") as EquipoEstado,
      tienda: data.tienda,
      ubicacion_id: data.ubicacion_id,
      fecha_ingreso: data.fecha_ingreso,
      costo: extra.data?.costo ?? null,
      email_vinculado: extra.data?.email_vinculado ?? null,
      proveedor: extra.data?.proveedor ?? null,
      lote: extra.data?.lote ?? null,
      notas: extra.data?.notas ?? null,
      precio: precio.data?.precio ?? null,
    });
    setPanelArreglos(false);
    setArreglos({});
    setRecientes((prev) => [
      { imei: data.imei ?? imei, modelo: data.modelo ?? "" },
      ...prev.filter((r) => r.imei !== (data.imei ?? imei)),
    ].slice(0, 8));
    flash.ok();
  };

  const refrescar = async () => {
    void queryClient.invalidateQueries({ queryKey: ["v_equipo_timeline"] });
    void queryClient.invalidateQueries({ queryKey: ["v_stock"] });
    void servicios.refetch();
    if (ficha) {
      const { data } = await supabase
        .from("v_stock")
        .select("estado, ubicacion_id, tienda")
        .eq("id", ficha.id)
        .maybeSingle();
      if (data)
        setFicha((f) =>
          f
            ? {
                ...f,
                estado: (data.estado ?? f.estado) as EquipoEstado,
                ubicacion_id: data.ubicacion_id,
                tienda: data.tienda,
              }
            : f,
        );
    }
  };

  const rolPuedeDisponible =
    !!rol && ["direccion", "jefe_tienda", "administracion", "operaciones"].includes(rol);
  const rolPuedeTrasladar =
    !!rol &&
    ["direccion", "jefe_tienda", "administracion", "operaciones", "vendedor"].includes(rol);
  const mismaTienda = ficha?.ubicacion_id === usuario?.tienda_id;
  const enBodega = !!bodega && ficha?.ubicacion_id === bodega.id;

  const puedeDisponible =
    !!ficha &&
    rolPuedeDisponible &&
    ["POR_REVISAR", "EN_TECNICO"].includes(ficha.estado) &&
    pendientes.length === 0;

  const puedeBodega =
    !!ficha &&
    !!bodega &&
    rolPuedeTrasladar &&
    !!ficha.ubicacion_id &&
    !enBodega &&
    !["VENDIDO", "ENTREGADO", "RESERVADO"].includes(ficha.estado) &&
    (["direccion", "administracion", "operaciones"].includes(rol ?? "") || mismaTienda);

  const puedeTecnico =
    !!ficha && rolPuedeDisponible && ["POR_REVISAR", "DISPONIBLE"].includes(ficha.estado);

  const marcarDisponible = async () => {
    if (!ficha) return;
    setAccion("disponible");
    const { error } = await supabase.rpc("marcar_equipo_disponible", { _equipo: ficha.id });
    setAccion(null);
    if (error) {
      toast.error("No se pudo marcar como disponible", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    toast.success("Equipo disponible");
    await refrescar();
    setEtapaEtiqueta("Disponible");
    setEtiquetaAbierta(true);
  };

  const devolverBodega = async () => {
    if (!ficha || !bodega || !ficha.ubicacion_id) return;
    setAccion("bodega");
    const { error } = await supabase.rpc("trasladar_equipos", {
      _imeis: [ficha.imei],
      _origen: ficha.ubicacion_id,
      _destino: bodega.id,
    });
    setAccion(null);
    if (error) {
      toast.error("No se pudo devolver a bodega", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    toast.success(`Equipo devuelto a ${bodega.nombre}`);
    void queryClient.invalidateQueries({ queryKey: ["v_movimientos"] });
    await refrescar();
    setEtapaEtiqueta(`En ${bodega.nombre}`);
    setEtiquetaAbierta(true);
  };

  const mandarTecnico = async () => {
    if (!ficha) return;
    const elegidos = Object.entries(arreglos);
    if (elegidos.length === 0) {
      toast.error("Elige al menos un arreglo");
      return;
    }
    setAccion("tecnico");
    const { error } = await supabase.rpc("agregar_servicios_equipo", {
      _equipo: ficha.id,
      _servicios: elegidos.map(([tipo, costo]) => ({
        tipo,
        costo: Number(String(costo ?? "").replace(/\D/g, "")) || 0,
      })),
    });
    setAccion(null);
    if (error) {
      toast.error("No se pudieron agregar los arreglos", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    toast.success(`${elegidos.length} arreglo(s) agregados`, {
      description: "Queda por revisar, listo para asignar a un técnico.",
    });
    setArreglos({});
    setPanelArreglos(false);
    await refrescar();
    setEtapaEtiqueta("A técnico");
    setEtiquetaAbierta(true);
  };

  const resumenPendientes = useMemo(
    () => pendientes.map((s) => s.tipo).join(", "),
    [pendientes],
  );

  return (
    <div className="mx-auto max-w-[86rem]">
      <div>
        <h1 className="font-display text-2xl font-semibold">Escanear equipo</h1>
        <p className="mt-1 text-sm text-muted-foreground">{DESC}</p>
      </div>

      <section className="glass mt-6 p-5">
        <div className="flex items-center gap-2 text-sm">
          <ScanLine className="size-4 text-[var(--accent-store)]" />
          <span className="font-display">Pistola o teclado</span>
        </div>
        <div className="mt-4">
          <CampoImei
            valor={scan}
            onValor={setScan}
            onAgregar={(imei) => void cargar(imei)}
            claseFlash={flash.clase}
            inputRef={scanRef}
            placeholder="Escanea el código de barras del equipo"
          />
        </div>
        {recientes.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Recientes
            </span>
            {recientes.map((r) => (
              <button
                key={r.imei}
                type="button"
                onClick={() => void cargar(r.imei)}
                className="num rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                {r.modelo} · {r.imei.slice(-6)}
              </button>
            ))}
          </div>
        )}
      </section>

      {buscando && (
        <p className="mt-6 text-sm text-muted-foreground">Buscando el equipo…</p>
      )}

      {ficha && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <section className="glass p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">{ficha.modelo}</h2>
                <p className="num text-sm tracking-[0.06em] text-muted-foreground">{ficha.imei}</p>
              </div>
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${ESTADO_CLASE[ficha.estado]}`}
              >
                {ESTADO_ETIQUETA[ficha.estado]}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="gap-2"
                onClick={() => {
                  setEtapaEtiqueta(ESTADO_ETIQUETA[ficha.estado]);
                  setEtiquetaAbierta(true);
                }}
              >
                <Printer className="size-4" /> Imprimir etiqueta
              </Button>
              {puedeDisponible && (
                <Button
                  size="sm"
                  className="accent-glow gap-2"
                  disabled={accion !== null}
                  onClick={() => void marcarDisponible()}
                >
                  <PackageCheck className="size-4" />
                  {accion === "disponible" ? "Marcando…" : "Marcar como disponible"}
                </Button>
              )}
              {puedeBodega && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-2"
                  disabled={accion !== null}
                  onClick={() => void devolverBodega()}
                >
                  <Warehouse className="size-4" />
                  {accion === "bodega" ? "Devolviendo…" : "Devolver a bodega"}
                </Button>
              )}
              {puedeTecnico && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-2"
                  onClick={() => setPanelArreglos((v) => !v)}
                >
                  <Wrench className="size-4" /> Mandar a técnico
                </Button>
              )}
            </div>

            {pendientes.length > 0 && (
              <p className="mt-3 text-xs text-amber-300">
                Tiene {pendientes.length} arreglo{pendientes.length === 1 ? "" : "s"} sin terminar:{" "}
                {resumenPendientes}
              </p>
            )}

            {panelArreglos && (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold">Qué hay que arreglarle</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {SERVICIOS.map((s) => {
                    const marcado = arreglos[s.tipo] !== undefined;
                    return (
                      <div key={s.tipo} className="flex items-center gap-2">
                        <label className="flex flex-1 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={(e) =>
                              setArreglos((prev) => {
                                const copia = { ...prev };
                                if (e.target.checked) copia[s.tipo] = costosArreglo.data?.get(s.tipo) ?? "";
                                else delete copia[s.tipo];
                                return copia;
                              })
                            }
                          />
                          {s.label}
                        </label>
                        {marcado && conCostos && (
                           <div>
                             <Input
                               className="h-8 w-28"
                               inputMode="numeric"
                               placeholder="Costo"
                               value={arreglos[s.tipo] ?? ""}
                               onChange={(e) =>
                                 setArreglos((prev) => ({ ...prev, [s.tipo]: e.target.value.replace(/\D/g, "") }))
                               }
                             />
                             {!arreglos[s.tipo] && <p className="mt-1 text-[10px] text-amber-300">Sin costo cargado</p>}
                           </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <Button
                  size="sm"
                  className="accent-glow mt-4"
                  disabled={accion !== null}
                  onClick={() => void mandarTecnico()}
                >
                  {accion === "tecnico" ? "Guardando…" : "Guardar arreglos"}
                </Button>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Dato etiqueta="Capacidad" valor={ficha.gb ? `${ficha.gb} GB` : "—"} />
              <Dato etiqueta="Color" valor={ficha.color} />
              <Dato
                etiqueta="Batería"
                valor={ficha.bateria != null ? `${ficha.bateria}%` : "—"}
              />
              <Dato
                etiqueta="Categoría"
                valor={
                  ficha.categoria
                    ? (CATEGORIA_ETIQUETA[
                        ficha.categoria as keyof typeof CATEGORIA_ETIQUETA
                      ] ?? ficha.categoria)
                    : "—"
                }
              />
              <Dato etiqueta="Ubicación" valor={ficha.tienda} />
              <Dato etiqueta="Días en stock" valor={diasEnStock(ficha.fecha_ingreso)} />
              <Dato etiqueta="Ingreso" valor={fechaLarga(ficha.fecha_ingreso)} />
              <Dato
                etiqueta="Precio de lista"
                valor={
                  ficha.precio != null ? (
                    <span className="num">{formatCLP(ficha.precio)}</span>
                  ) : (
                    "Sin precio cargado"
                  )
                }
              />
              {conCostos && (
                <Dato
                  etiqueta="Costo"
                  valor={
                    ficha.costo != null ? <span className="num">{formatCLP(ficha.costo)}</span> : "—"
                  }
                />
              )}
              <Dato etiqueta="Email vinculado" valor={ficha.email_vinculado} />
              {conCostos && <Dato etiqueta="Proveedor" valor={ficha.proveedor} />}
              {conCostos && <Dato etiqueta="Lote" valor={ficha.lote} />}
            </div>

            {ficha.notas && (
              <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Notas del estado físico
                </p>
                <p className="mt-0.5 text-sm whitespace-pre-line">{ficha.notas}</p>
              </div>
            )}
          </section>

          <section className="glass p-5">
            <EquipoTimeline equipoId={ficha.id} compacto />
          </section>

          <EtiquetasModal
            abierto={etiquetaAbierta}
            equipos={[
              {
                imei: ficha.imei,
                modelo: ficha.modelo,
                gb: ficha.gb,
                color: ficha.color,
                etapa: etapaEtiqueta ?? ESTADO_ETIQUETA[ficha.estado],
              },
            ]}
            onCerrar={() => {
              setEtiquetaAbierta(false);
              setEtapaEtiqueta(null);
              scanRef.current?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
