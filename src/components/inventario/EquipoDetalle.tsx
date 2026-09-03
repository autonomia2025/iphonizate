import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PackageCheck, Pencil, Printer, Trash2, Warehouse } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EtiquetasModal } from "@/components/inventario/EtiquetasModal";
import { EquipoTimeline } from "@/components/inventario/EquipoTimeline";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatCLP } from "@/lib/stores";
import {
  CATEGORIAS,
  CATEGORIA_ETIQUETA,
  ESTADO_CLASE,
  ESTADO_ETIQUETA,
  SERVICIO_ETIQUETA,
  diasEnStock,
  fechaLarga,
  type EquipoEstado,
  type ServicioTipo,
} from "@/lib/inventario";
import { VerificacionEquipo, type VerificacionFila } from "@/components/inventario/VerificacionEquipo";

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
const campo = "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className="mt-0.5 text-sm">{valor ?? "—"}</p>
    </div>
  );
}

type EditForm = {
  modelo: string;
  gb: string;
  color: string;
  bateria: string;
  categoria: string;
  email_vinculado: string;
  proveedor: string;
  lote: string;
  notas: string;
  ubicacion_id: string;
  costo: string;
};

export function EquipoDetalle({ equipo, onCerrar, puedeCostos, onCambio }: {
  equipo: EquipoFila | null;
  onCerrar: () => void;
  puedeCostos: boolean;
  onCambio?: () => void;
}) {
  const id = equipo?.id;
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const queryClient = useQueryClient();
  const [accion, setAccion] = useState<null | "disponible" | "bodega" | "guardar" | "eliminar">(null);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [etiquetaAbierta, setEtiquetaAbierta] = useState(false);
  const [etapaEtiqueta, setEtapaEtiqueta] = useState<string | null>(null);

  const servicios = useQuery({
    queryKey: ["servicios_equipo", id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase.from("v_servicios_equipo").select("id, tipo, costo, estado, created_at, listo_at").eq("equipo_id", id).order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const tiendas = useQuery({
    queryKey: ["tiendas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tiendas").select("id, nombre, es_bodega").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const bodega = (tiendas.data ?? []).find((t) => t.es_bodega);
  const pendientes = (servicios.data ?? []).filter((s) => s.estado !== "listo").length;
  const rolPuedeOperar = !!rol && ["direccion", "jefe_tienda", "administracion", "operaciones"].includes(rol);
  const puedeMarcarDisponible = !!equipo && rolPuedeOperar && ["POR_REVISAR", "EN_TECNICO"].includes(equipo.estado) && !servicios.isLoading && pendientes === 0;
  const rolPuedeTrasladar = !!rol && ["direccion", "jefe_tienda", "administracion", "operaciones", "vendedor"].includes(rol);
  const enBodega = !!bodega && equipo?.ubicacion_id === bodega.id;
  const mismaTienda = equipo?.ubicacion_id === usuario?.tienda_id;
  const puedeDevolverBodega = !!equipo && !!bodega && rolPuedeTrasladar && !!equipo.ubicacion_id && !enBodega && !NO_TRASLADABLES.includes(equipo.estado) && (["direccion", "administracion", "operaciones"].includes(rol ?? "") || mismaTienda);
  const puedeEliminar = !!equipo && rolPuedeOperar && !["VENDIDO", "ENTREGADO", "RESERVADO", "GARANTIA"].includes(equipo.estado);

  useEffect(() => {
    if (!equipo) {
      setEditando(false);
      setForm(null);
      return;
    }
    setForm({
      modelo: equipo.modelo,
      gb: equipo.gb == null ? "" : String(equipo.gb),
      color: equipo.color ?? "",
      bateria: equipo.bateria == null ? "" : String(equipo.bateria),
      categoria: equipo.categoria ?? "seminuevo",
      email_vinculado: equipo.email_vinculado ?? "",
      proveedor: equipo.proveedor ?? "",
      lote: equipo.lote ?? "",
      notas: equipo.notas ?? "",
      ubicacion_id: equipo.ubicacion_id ?? "",
      costo: equipo.costo == null ? "" : String(equipo.costo),
    });
  }, [equipo]);

  const serviciosEtiqueta = useMemo(() => (servicios.data ?? []).filter((s) => s.estado !== "listo").map((s) => SERVICIO_ETIQUETA[s.tipo as ServicioTipo] ?? s.tipo), [servicios.data]);
  const refrescar = () => {
    void servicios.refetch();
    void queryClient.invalidateQueries({ queryKey: ["v_equipo_timeline"] });
    void queryClient.invalidateQueries({ queryKey: ["v_stock"] });
    onCambio?.();
  };

  const guardarCambios = async () => {
    if (!equipo || !form || !form.modelo.trim() || !form.ubicacion_id) {
      toast.error("Completa el modelo y la ubicación");
      return;
    }
    setAccion("guardar");
    const payload = {
      modelo: form.modelo.trim(),
      gb: form.gb ? Number(form.gb) : null,
      color: form.color.trim() || null,
      bateria: form.bateria ? Math.min(100, Number(form.bateria)) : null,
      categoria: form.categoria as "sellado" | "openbox" | "seminuevo" | "reacondicionado",
      email_vinculado: form.email_vinculado.trim() || null,
      proveedor: form.proveedor.trim() || null,
      lote: form.lote.trim() || null,
      notas: form.notas.trim() || null,
      ubicacion_id: form.ubicacion_id,
      ...(puedeCostos ? { costo: form.costo ? Number(form.costo) : 0 } : {}),
    };
    const { error } = await supabase.from("equipos").update(payload).eq("id", equipo.id);
    setAccion(null);
    if (error) {
      toast.error("No se pudo actualizar el equipo", { description: error.message.replace(/^.*?:\s*/, "") });
      return;
    }
    toast.success("Equipo actualizado");
    setEditando(false);
    refrescar();
  };

  const eliminar = async () => {
    if (!equipo || !puedeEliminar) return;
    if (!window.confirm(`¿Eliminar ${equipo.modelo} · IMEI ${equipo.imei}? Solo se puede borrar si no tiene trazabilidad.`)) return;
    setAccion("eliminar");
    const { error } = await supabase.rpc("eliminar_equipo", { _equipo: equipo.id });
    setAccion(null);
    if (error) {
      toast.error("No se pudo eliminar el equipo", { description: error.message.replace(/^.*?:\s*/, "") });
      return;
    }
    toast.success("Equipo eliminado");
    onCerrar();
    onCambio?.();
  };

  const marcarDisponible = async () => {
    if (!equipo) return;
    setAccion("disponible");
    const { error } = await supabase.rpc("marcar_equipo_disponible", { _equipo: equipo.id });
    setAccion(null);
    if (error) { toast.error("No se pudo marcar como disponible", { description: error.message.replace(/^.*?:\s*/, "") }); return; }
    toast.success("Equipo disponible", { description: `${equipo.modelo} · IMEI ${equipo.imei}` });
    refrescar(); setEtapaEtiqueta("Disponible"); setEtiquetaAbierta(true);
  };

  const devolverBodega = async () => {
    if (!equipo || !bodega || !equipo.ubicacion_id) return;
    setAccion("bodega");
    const { error } = await supabase.rpc("trasladar_equipos", { _imeis: [equipo.imei], _origen: equipo.ubicacion_id, _destino: bodega.id });
    setAccion(null);
    if (error) { toast.error("No se pudo devolver a bodega", { description: error.message.replace(/^.*?:\s*/, "") }); return; }
    toast.success(`Equipo devuelto a ${bodega.nombre}`); void queryClient.invalidateQueries({ queryKey: ["v_movimientos"] }); refrescar(); setEtapaEtiqueta(`En ${bodega.nombre}`); setEtiquetaAbierta(true);
  };

  return (
    <Sheet open={!!equipo} onOpenChange={(v) => !v && onCerrar()}>
      <SheetContent className="glass w-full overflow-y-auto border-white/10 bg-white/5 backdrop-blur-2xl sm:max-w-md">
        {equipo && form && (
          <>
            <SheetHeader>
              <SheetTitle className="font-display">{equipo.modelo}</SheetTitle>
              <p className="num text-sm tracking-[0.06em] text-muted-foreground">{equipo.imei}</p>
              <span className={`mt-1 inline-flex w-fit rounded-full border px-2 py-0.5 text-xs ${ESTADO_CLASE[equipo.estado]}`}>{ESTADO_ETIQUETA[equipo.estado]}</span>
            </SheetHeader>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" className="gap-2" onClick={() => setEtiquetaAbierta(true)}><Printer className="size-4" /> Imprimir etiqueta</Button>
              {rolPuedeOperar && <Button size="sm" variant="ghost" className="gap-2" onClick={() => setEditando((v) => !v)}><Pencil className="size-4" /> {editando ? "Cerrar edición" : "Editar equipo"}</Button>}
              {puedeEliminar && <Button size="sm" variant="ghost" className="gap-2 text-red-300 hover:text-red-200" disabled={accion !== null} onClick={() => void eliminar()}><Trash2 className="size-4" /> {accion === "eliminar" ? "Eliminando…" : "Eliminar"}</Button>}
            </div>

            <EtiquetasModal abierto={etiquetaAbierta} equipos={[{ imei: equipo.imei, modelo: equipo.modelo, gb: equipo.gb, color: equipo.color, etapa: etapaEtiqueta ?? ESTADO_ETIQUETA[equipo.estado], servicios: serviciosEtiqueta }]} onCerrar={() => { setEtiquetaAbierta(false); setEtapaEtiqueta(null); }} />

            {editando && (
              <section className="mt-4 rounded-xl border border-[var(--accent-store)]/25 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold">Editar ficha</p>
                <p className="mt-1 text-xs text-muted-foreground">El IMEI no se cambia para conservar la trazabilidad del equipo.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Label>Modelo</Label><Input className="mt-1" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} /></div>
                  <div><Label>GB</Label><Input className="num mt-1" inputMode="numeric" value={form.gb} onChange={(e) => setForm({ ...form, gb: e.target.value.replace(/\D/g, "") })} /></div>
                  <div><Label>Color</Label><Input className="mt-1" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
                  <div><Label>Batería %</Label><Input className="num mt-1" inputMode="numeric" value={form.bateria} onChange={(e) => setForm({ ...form, bateria: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></div>
                  <div><Label>Categoría</Label><select className={`${campo} mt-1`} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>{CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_ETIQUETA[c]}</option>)}</select></div>
                  <div><Label>Ubicación</Label><select className={`${campo} mt-1`} value={form.ubicacion_id} onChange={(e) => setForm({ ...form, ubicacion_id: e.target.value })}>{(tiendas.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
                  <div><Label>Email vinculado</Label><Input className="mt-1" value={form.email_vinculado} onChange={(e) => setForm({ ...form, email_vinculado: e.target.value })} /></div>
                  {puedeCostos && <div><Label>Costo</Label><Input className="num mt-1" inputMode="numeric" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value.replace(/\D/g, "") })} /></div>}
                  <div><Label>Proveedor</Label><Input className="mt-1" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} /></div>
                  <div><Label>Lote</Label><Input className="mt-1" value={form.lote} onChange={(e) => setForm({ ...form, lote: e.target.value })} /></div>
                  <div className="sm:col-span-2"><Label>Notas</Label><Textarea className="mt-1" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>
                </div>
                <div className="mt-4 flex justify-end"><Button disabled={accion !== null} onClick={() => void guardarCambios()}>{accion === "guardar" ? "Guardando…" : "Guardar cambios"}</Button></div>
              </section>
            )}

            {(puedeMarcarDisponible || puedeDevolverBodega) && <div className="mt-4 flex flex-wrap gap-2">{puedeMarcarDisponible && <Button size="sm" className="accent-glow gap-2" disabled={accion !== null} onClick={() => void marcarDisponible()}><PackageCheck className="size-4" />{accion === "disponible" ? "Marcando…" : "Marcar como disponible"}</Button>}{puedeDevolverBodega && <Button size="sm" variant="secondary" className="gap-2" disabled={accion !== null} onClick={() => void devolverBodega()}><Warehouse className="size-4" />{accion === "bodega" ? "Devolviendo…" : "Devolver a bodega"}</Button>}</div>}
            {rolPuedeOperar && ["POR_REVISAR", "EN_TECNICO"].includes(equipo.estado) && pendientes > 0 && <p className="mt-3 text-xs text-amber-300">Tiene {pendientes} arreglo{pendientes === 1 ? "" : "s"} sin terminar.</p>}

            <div className="mt-5 grid grid-cols-2 gap-2"><Dato etiqueta="Capacidad" valor={equipo.gb ? `${equipo.gb} GB` : "—"} /><Dato etiqueta="Color" valor={equipo.color} /><Dato etiqueta="Batería" valor={equipo.bateria != null ? `${equipo.bateria}%` : "—"} /><Dato etiqueta="Categoría" valor={equipo.categoria ? (CATEGORIA_ETIQUETA[equipo.categoria as keyof typeof CATEGORIA_ETIQUETA] ?? equipo.categoria) : "—"} /><Dato etiqueta="Ubicación" valor={equipo.tienda} /><Dato etiqueta="Días en stock" valor={diasEnStock(equipo.fecha_ingreso)} /><Dato etiqueta="Ingreso" valor={fechaLarga(equipo.fecha_ingreso)} />{puedeCostos && <Dato etiqueta="Costo" valor={equipo.costo != null ? <span className="num">{formatCLP(equipo.costo)}</span> : "—"} />}<Dato etiqueta="Email vinculado" valor={equipo.email_vinculado} /><Dato etiqueta="Proveedor" valor={equipo.proveedor} /><Dato etiqueta="Lote" valor={equipo.lote} /></div>
            {equipo.notas && <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Notas del estado físico</p><p className="mt-0.5 text-sm">{equipo.notas}</p></div>}
            <VerificacionEquipo equipo={equipo} />
            <section className="mt-6"><h3 className="text-sm font-semibold">Servicios</h3>{servicios.data && servicios.data.length > 0 ? <ul className="mt-2 space-y-2">{servicios.data.map((s) => <li key={s.id} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm"><span>{SERVICIO_ETIQUETA[s.tipo as ServicioTipo] ?? s.tipo}</span><span className="flex items-center gap-3">{puedeCostos && s.costo != null && <span className="num text-xs text-muted-foreground">{formatCLP(s.costo)}</span>}<span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-muted-foreground">{s.estado}</span></span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">{servicios.isLoading ? "Cargando…" : "Sin servicios registrados."}</p>}</section>
            <EquipoTimeline equipoId={equipo.id} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
