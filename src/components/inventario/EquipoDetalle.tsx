import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PackageCheck, Warehouse } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatCLP } from "@/lib/stores";
import {
  VerificacionEquipo,
  type VerificacionFila,
} from "@/components/inventario/VerificacionEquipo";
import {
  CATEGORIA_ETIQUETA,
  ESTADO_CLASE,
  ESTADO_ETIQUETA,
  SERVICIO_ETIQUETA,
  diasEnStock,
  fechaLarga,
  type EquipoEstado,
  type ServicioTipo,
} from "@/lib/inventario";


export type EquipoFila = VerificacionFila & {
  id: string;
  imei: string;
  modelo: string;
  gb: number | null;
  color: string | null;
  bateria: number | null;
  categoria: string | null;
  estado: EquipoEstado;
  tienda: string | null;
  ubicacion_id?: string | null;
  fecha_ingreso: string | null;
  costo?: number | null;
  email_vinculado?: string | null;
  proveedor?: string | null;
  lote?: string | null;
  notas?: string | null;
};


const NO_TRASLADABLES: EquipoEstado[] = ["VENDIDO", "ENTREGADO", "RESERVADO"];

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className="mt-0.5 text-sm">{valor ?? "—"}</p>
    </div>
  );
}

export function EquipoDetalle({
  equipo,
  onCerrar,
  puedeCostos,
  onCambio,
}: {
  equipo: EquipoFila | null;
  onCerrar: () => void;
  puedeCostos: boolean;
  onCambio?: () => void;
}) {
  const id = equipo?.id;
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const queryClient = useQueryClient();
  const [accion, setAccion] = useState<null | "disponible" | "bodega">(null);

  const servicios = useQuery({
    queryKey: ["servicios_equipo", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servicios_equipo")
        .select("id, tipo, costo, estado, created_at, listo_at")
        .eq("equipo_id", id!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const historial = useQuery({
    queryKey: ["equipos_historial", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipos_historial")
        .select("id, evento, fecha")
        .eq("equipo_id", id!)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

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
  const pendientes = (servicios.data ?? []).filter((s) => s.estado !== "listo").length;

  const rolPuedeDisponible =
    !!rol && ["direccion", "jefe_tienda", "administracion", "operaciones"].includes(rol);
  const puedeMarcarDisponible =
    !!equipo &&
    rolPuedeDisponible &&
    ["POR_REVISAR", "EN_TECNICO"].includes(equipo.estado) &&
    !servicios.isLoading &&
    pendientes === 0;

  const rolPuedeTrasladar =
    !!rol && ["direccion", "jefe_tienda", "administracion", "operaciones", "vendedor"].includes(rol);
  const enBodega = !!bodega && equipo?.ubicacion_id === bodega.id;
  const mismaTienda = equipo?.ubicacion_id === usuario?.tienda_id;
  const puedeDevolverBodega =
    !!equipo &&
    !!bodega &&
    rolPuedeTrasladar &&
    !!equipo.ubicacion_id &&
    !enBodega &&
    !NO_TRASLADABLES.includes(equipo.estado) &&
    (["direccion", "administracion", "operaciones"].includes(rol ?? "") || mismaTienda);

  const refrescar = () => {
    void servicios.refetch();
    void historial.refetch();
    void queryClient.invalidateQueries({ queryKey: ["v_stock"] });
    onCambio?.();
  };

  const marcarDisponible = async () => {
    if (!equipo) return;
    setAccion("disponible");
    const { error } = await supabase.rpc("marcar_equipo_disponible", { _equipo: equipo.id });
    setAccion(null);
    if (error) {
      toast.error("No se pudo marcar como disponible", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    toast.success("Equipo disponible", { description: `${equipo.modelo} · IMEI ${equipo.imei}` });
    refrescar();
    onCerrar();
  };

  const devolverBodega = async () => {
    if (!equipo || !bodega || !equipo.ubicacion_id) return;
    setAccion("bodega");
    const { error } = await supabase.rpc("trasladar_equipos", {
      _imeis: [equipo.imei],
      _origen: equipo.ubicacion_id,
      _destino: bodega.id,
    });
    setAccion(null);
    if (error) {
      toast.error("No se pudo devolver a bodega", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    toast.success(`Equipo devuelto a ${bodega.nombre}`, { description: `IMEI ${equipo.imei}` });
    void queryClient.invalidateQueries({ queryKey: ["v_movimientos"] });
    refrescar();
    onCerrar();
  };

  return (
    <Sheet open={!!equipo} onOpenChange={(v) => !v && onCerrar()}>
      <SheetContent className="glass w-full overflow-y-auto border-white/10 bg-white/5 backdrop-blur-2xl sm:max-w-md">
        {equipo && (
          <>
            <SheetHeader>
              <SheetTitle className="font-display">{equipo.modelo}</SheetTitle>
              <p className="num text-sm tracking-[0.06em] text-muted-foreground">{equipo.imei}</p>
              <span
                className={`mt-1 inline-flex w-fit rounded-full border px-2 py-0.5 text-xs ${ESTADO_CLASE[equipo.estado]}`}
              >
                {ESTADO_ETIQUETA[equipo.estado]}
              </span>
            </SheetHeader>

            {(puedeMarcarDisponible || puedeDevolverBodega) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {puedeMarcarDisponible && (
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
                {puedeDevolverBodega && (
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
              </div>
            )}
            {rolPuedeDisponible &&
              ["POR_REVISAR", "EN_TECNICO"].includes(equipo.estado) &&
              pendientes > 0 && (
                <p className="mt-3 text-xs text-amber-300">
                  Tiene {pendientes} arreglo{pendientes === 1 ? "" : "s"} sin terminar: márcalos listos
                  en Técnico y el equipo pasa a disponible.
                </p>
              )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Dato etiqueta="Capacidad" valor={equipo.gb ? `${equipo.gb} GB` : "—"} />
              <Dato etiqueta="Color" valor={equipo.color} />
              <Dato
                etiqueta="Batería"
                valor={equipo.bateria != null ? `${equipo.bateria}%` : "—"}
              />
              <Dato
                etiqueta="Categoría"
                valor={
                  equipo.categoria
                    ? (CATEGORIA_ETIQUETA[
                        equipo.categoria as keyof typeof CATEGORIA_ETIQUETA
                      ] ?? equipo.categoria)
                    : "—"
                }
              />
              <Dato etiqueta="Ubicación" valor={equipo.tienda} />
              <Dato etiqueta="Días en stock" valor={diasEnStock(equipo.fecha_ingreso)} />
              <Dato etiqueta="Ingreso" valor={fechaLarga(equipo.fecha_ingreso)} />
              {puedeCostos && (
                <Dato
                  etiqueta="Costo"
                  valor={
                    equipo.costo != null ? (
                      <span className="num">{formatCLP(equipo.costo)}</span>
                    ) : (
                      "—"
                    )
                  }
                />
              )}
              <Dato etiqueta="Email vinculado" valor={equipo.email_vinculado} />
              <Dato etiqueta="Proveedor" valor={equipo.proveedor} />
              <Dato etiqueta="Lote" valor={equipo.lote} />
            </div>

            {equipo.notas && (
              <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Notas del estado físico
                </p>
                <p className="mt-0.5 text-sm">{equipo.notas}</p>
              </div>
            )}

            <VerificacionEquipo equipo={equipo} onActualizado={refrescar} />


            <section className="mt-6">
              <h3 className="text-sm font-semibold">Servicios</h3>
              {servicios.data && servicios.data.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {servicios.data.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm"
                    >
                      <span>{SERVICIO_ETIQUETA[s.tipo as ServicioTipo] ?? s.tipo}</span>
                      <span className="flex items-center gap-3">
                        {puedeCostos && s.costo != null && (
                          <span className="num text-xs text-muted-foreground">
                            {formatCLP(s.costo)}
                          </span>
                        )}
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-muted-foreground">
                          {s.estado}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {servicios.isLoading ? "Cargando…" : "Sin servicios registrados."}
                </p>
              )}
            </section>

            <section className="mt-6 pb-6">
              <h3 className="text-sm font-semibold">Historial</h3>
              {historial.data && historial.data.length > 0 ? (
                <ol className="mt-2 space-y-2">
                  {historial.data.map((h) => (
                    <li key={h.id} className="border-l border-white/10 pl-3 text-sm">
                      <p>{h.evento}</p>
                      <p className="num text-xs text-muted-foreground">{fechaLarga(h.fecha)}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {historial.isLoading ? "Cargando…" : "Sin movimientos registrados."}
                </p>
              )}
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
