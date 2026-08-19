import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, ScanLine, Wrench, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useFlashEscaneo } from "@/components/motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import {
  ESTADO_ETIQUETA,
  SERVICIO_ETIQUETA,
  fechaLarga,
  puedeIngresarEquipos,
  puedeVerCostos,
  type EquipoEstado,
  type ServicioTipo,
} from "@/lib/inventario";

const DESC = "Asignación de equipos a técnicos, seguimiento en taller y reparaciones hechas.";
const NO_TECNICO: EquipoEstado[] = ["VENDIDO", "ENTREGADO", "RESERVADO"];

export const Route = createFileRoute("/tecnico")({
  head: () => ({
    meta: [
      { title: "Técnico · riff store OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Técnico · riff store OS" },
      { property: "og:description", content: DESC },
    ],
  }),
  component: TecnicoPage,
});

const selectClase =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

type Escaneado = {
  id: string;
  imei: string;
  modelo: string;
  color: string | null;
  pendientes: ServicioTipo[];
};

const dias = (fecha?: string | null) =>
  fecha ? Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000)) : 0;

const etiquetaServicio = (tipo: string) =>
  SERVICIO_ETIQUETA[tipo as ServicioTipo] ?? tipo;

function TecnicoPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const puedeOperar = puedeIngresarEquipos(rol);
  const verCostos = puedeVerCostos(rol);
  const queryClient = useQueryClient();

  const [tecnicoSel, setTecnicoSel] = useState("");
  const [nuevoTecnico, setNuevoTecnico] = useState("");
  const [creandoTecnico, setCreandoTecnico] = useState(false);
  const [lista, setLista] = useState<Escaneado[]>([]);
  const [scan, setScan] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const tecnicos = useQuery({
    queryKey: ["tecnicos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tecnicos")
        .select("id, nombre, activo")
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const taller = useQuery({
    queryKey: ["v_taller"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_taller")
        .select("servicio_id, tipo, asignado_at, tecnico_id, tecnico, equipo_id, imei, modelo, gb, color, tienda")
        .order("asignado_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const historial = useQuery({
    queryKey: ["v_tecnico_historial"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_tecnico_historial")
        .select("equipo_id, imei, modelo, gb, tecnico, servicios, dias, salida_at, costo_total")
        .order("salida_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (puedeOperar) scanRef.current?.focus();
  }, [puedeOperar]);

  const nombreTecnico = (id: string) =>
    (tecnicos.data ?? []).find((t) => t.id === id)?.nombre ?? "el técnico";

  const crearTecnico = async () => {
    const nombre = nuevoTecnico.trim();
    if (!nombre) return;
    setCreandoTecnico(true);
    const { data, error } = await supabase
      .from("tecnicos")
      .insert({ nombre })
      .select("id, nombre")
      .maybeSingle();
    setCreandoTecnico(false);
    if (error || !data) {
      toast.error("No se pudo agregar el técnico", { description: error?.message });
      return;
    }
    await tecnicos.refetch();
    setTecnicoSel(data.id);
    setNuevoTecnico("");
    toast.success(`${data.nombre} agregado como técnico`);
    scanRef.current?.focus();
  };

  const flash = useFlashEscaneo();

  const escanear = async (valorCrudo: string) => {
    const imei = valorCrudo.trim();
    setScan("");
    if (!imei) return;
    if (lista.some((e) => e.imei === imei)) {
      flash.error(); toast.warning(`El IMEI ${imei} ya está en la lista`);
      return;
    }

    const { data: equipo, error } = await supabase
      .from("v_stock")
      .select("id, imei, modelo, color, estado")
      .eq("imei", imei)
      .maybeSingle();

    if (error) {
      flash.error(); toast.error("No se pudo verificar el IMEI", { description: error.message });
      return;
    }
    if (!equipo?.id) {
      flash.error(); toast.error("Ese IMEI no está en el sistema");
      return;
    }
    const estado = (equipo.estado ?? "POR_REVISAR") as EquipoEstado;
    if (NO_TECNICO.includes(estado)) {
      flash.error(); toast.error(`No se puede mandar a técnico: está ${ESTADO_ETIQUETA[estado].toLowerCase()}`, {
        description:
          estado === "RESERVADO"
            ? "El equipo está comprometido con un cliente."
            : "El equipo ya salió de la cadena.",
      });
      return;
    }

    const { data: servicios, error: errServ } = await supabase
      .from("servicios_equipo")
      .select("id, tipo, estado, tecnico_id, tecnicos(nombre)")
      .eq("equipo_id", equipo.id);

    if (errServ) {
      flash.error(); toast.error("No se pudieron leer los servicios del equipo", { description: errServ.message });
      return;
    }

    const asignado = (servicios ?? []).find((s) => s.estado === "asignado");
    if (asignado) {
      const quien =
        (asignado.tecnicos as { nombre: string } | null)?.nombre ?? "otro técnico";
      flash.error(); toast.error(`Este equipo ya está asignado a ${quien}`);
      return;
    }

    const pendientes = (servicios ?? [])
      .filter((s) => s.estado === "pendiente")
      .map((s) => s.tipo as ServicioTipo);

    if (pendientes.length === 0) {
      flash.error(); toast.error("Este equipo no necesita reparación");
      return;
    }

    setLista((prev) => [
      {
        id: equipo.id!,
        imei: equipo.imei ?? imei,
        modelo: equipo.modelo ?? "",
        color: equipo.color,
        pendientes,
      },
      ...prev,
    ]);
    flash.ok();
  };

  const asignar = async () => {
    if (!tecnicoSel) {
      toast.error("Elige un técnico");
      return;
    }
    if (lista.length === 0) {
      toast.error("Escanea al menos un equipo");
      return;
    }
    setGuardando(true);
    const { data, error } = await supabase.rpc("asignar_equipos_tecnico", {
      _imeis: lista.map((e) => e.imei),
      _tecnico: tecnicoSel,
    });
    setGuardando(false);
    if (error) {
      toast.error("No se asignaron los equipos", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    const n = data ?? lista.length;
    toast.success(`${n} equipo${n === 1 ? "" : "s"} asignado${n === 1 ? "" : "s"} a ${nombreTecnico(tecnicoSel)}`);
    setLista([]);
    void taller.refetch();
    void queryClient.invalidateQueries({ queryKey: ["v_stock"] });
    scanRef.current?.focus();
  };

  const marcarListo = async (servicioId: string) => {
    const { data, error } = await supabase.rpc("servicio_listo", { _servicio_id: servicioId });
    if (error) {
      toast.error("No se pudo marcar como listo", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    toast.success(
      data === "equipo_listo" ? "Equipo reparado: vuelve a estar disponible" : "Servicio marcado como listo",
    );
    void taller.refetch();
    void historial.refetch();
    void queryClient.invalidateQueries({ queryKey: ["v_stock"] });
  };

  const marcarTodos = async (equipoId: string) => {
    const { error } = await supabase.rpc("equipo_servicios_listos", { _equipo_id: equipoId });
    if (error) {
      toast.error("No se pudieron marcar los servicios", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    toast.success("Equipo reparado: vuelve a estar disponible");
    void taller.refetch();
    void historial.refetch();
    void queryClient.invalidateQueries({ queryKey: ["v_stock"] });
  };

  /* Agrupar taller por técnico → equipo */
  const porTecnico = useMemo(() => {
    const filas = taller.data ?? [];
    const mapa = new Map<
      string,
      {
        tecnico_id: string;
        tecnico: string;
        asignado_at: string | null;
        equipos: Map<
          string,
          {
            equipo_id: string;
            imei: string;
            modelo: string;
            gb: number | null;
            color: string | null;
            tienda: string | null;
            asignado_at: string | null;
            servicios: { servicio_id: string; tipo: string }[];
          }
        >;
      }
    >();

    for (const f of filas) {
      if (!f.tecnico_id || !f.equipo_id || !f.servicio_id) continue;
      let t = mapa.get(f.tecnico_id);
      if (!t) {
        t = { tecnico_id: f.tecnico_id, tecnico: f.tecnico ?? "—", asignado_at: f.asignado_at, equipos: new Map() };
        mapa.set(f.tecnico_id, t);
      }
      if (f.asignado_at && (!t.asignado_at || f.asignado_at < t.asignado_at)) t.asignado_at = f.asignado_at;
      let e = t.equipos.get(f.equipo_id);
      if (!e) {
        e = {
          equipo_id: f.equipo_id,
          imei: f.imei ?? "",
          modelo: f.modelo ?? "",
          gb: f.gb,
          color: f.color,
          tienda: f.tienda,
          asignado_at: f.asignado_at,
          servicios: [],
        };
        t.equipos.set(f.equipo_id, e);
      }
      e.servicios.push({ servicio_id: f.servicio_id, tipo: f.tipo ?? "otro" });
    }

    return [...mapa.values()].map((t) => ({ ...t, equipos: [...t.equipos.values()] }));
  }, [taller.data]);

  return (
    <div className="mx-auto max-w-[86rem]">
      <div>
        <h1 className="font-display text-2xl font-semibold">Técnico</h1>
        <p className="mt-1 text-sm text-muted-foreground">{DESC}</p>
      </div>

      {/* ---------- Zona 1: asignar ---------- */}
      {puedeOperar && (
        <section className="glass mt-6 p-5">
          <h2 className="font-display text-base font-semibold">Asignar equipos a un técnico</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                Técnico
              </label>
              <select
                value={tecnicoSel}
                onChange={(e) => setTecnicoSel(e.target.value)}
                className={selectClase}
              >
                <option value="">Selecciona…</option>
                {(tecnicos.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                Agregar técnico nuevo
              </label>
              <div className="flex gap-2">
                <input
                  value={nuevoTecnico}
                  onChange={(e) => setNuevoTecnico(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void crearTecnico();
                    }
                  }}
                  placeholder="Nombre del técnico"
                  className={selectClase}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void crearTecnico()}
                  disabled={creandoTecnico || !nuevoTecnico.trim()}
                  className="h-11 shrink-0"
                >
                  <Plus className="size-4" /> Agregar
                </Button>
              </div>
            </div>
          </div>

          <label className="relative mt-5 block">
            <ScanLine className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[var(--accent-store)]" />
            <input
              ref={scanRef}
              value={scan}
              inputMode="numeric"
              autoComplete="off"
              onChange={(e) => setScan(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void escanear(scan);
                }
              }}
              placeholder="Escanea los equipos que se lleva el técnico"
              className={cn(flash.clase, "num h-14 w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-12 pr-4 text-base tracking-[0.06em] outline-none transition-all duration-200 placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-muted-foreground focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25")}
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            Compatible con lector de código de barras: escanea varios seguidos sin sacar el foco.
          </p>

          {lista.length > 0 && (
            <ul className="mt-4 space-y-2">
              {lista.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {e.modelo}
                      {e.color ? <span className="text-muted-foreground"> · {e.color}</span> : null}
                    </p>
                    <p className="num text-xs tracking-[0.04em] text-muted-foreground">{e.imei}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {e.pendientes.map((p) => (
                        <span
                          key={p}
                          className="rounded-full border border-amber-400/25 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300"
                        >
                          {etiquetaServicio(p)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Quitar ${e.imei} de la lista`}
                    onClick={() => setLista((prev) => prev.filter((x) => x.id !== e.id))}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/8 hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Button
            onClick={() => void asignar()}
            disabled={guardando || lista.length === 0 || !tecnicoSel}
            className="accent-glow mt-5"
          >
            {guardando
              ? "Asignando…"
              : `Asignar a ${tecnicoSel ? nombreTecnico(tecnicoSel) : "un técnico"} · ${lista.length} equipo${lista.length === 1 ? "" : "s"}`}
          </Button>
        </section>
      )}

      {/* ---------- Zona 2: en taller ---------- */}
      <section className="mt-8">
        <h2 className="font-display text-base font-semibold">En taller</h2>
        {porTecnico.length === 0 ? (
          <p className="glass mt-3 p-6 text-sm text-muted-foreground">
            {taller.isLoading ? "Cargando taller…" : "No hay equipos en manos de técnicos."}
          </p>
        ) : (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {porTecnico.map((t) => {
              const d = dias(t.asignado_at);
              const open = abierto === t.tecnico_id;
              return (
                <article key={t.tecnico_id} className="glass overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAbierto(open ? null : t.tecnico_id)}
                    className="flex w-full items-center justify-between gap-3 p-5 text-left transition-colors duration-200 hover:bg-white/[0.03]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-[var(--accent-store)]/15 text-[var(--accent-store)]">
                        <Wrench className="size-5" />
                      </span>
                      <div>
                        <p className="font-display text-base font-semibold">{t.tecnico}</p>
                        <p className="num text-xs text-muted-foreground">
                          {t.equipos.length} equipo{t.equipos.length === 1 ? "" : "s"} · hace {d} día
                          {d === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    <ChevronDown
                      className={`size-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                    />
                  </button>

                  {open && (
                    <ul className="space-y-2 border-t border-white/8 p-4">
                      {t.equipos.map((e) => {
                        const de = dias(e.asignado_at);
                        const atrasado = de > 3;
                        return (
                          <li
                            key={e.equipo_id}
                            className={`rounded-xl border px-4 py-3 ${
                              atrasado
                                ? "border-amber-400/30 bg-amber-500/10"
                                : "border-white/8 bg-white/[0.03]"
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium">
                                  {e.modelo}
                                  {e.gb ? <span className="num text-muted-foreground"> · {e.gb} GB</span> : null}
                                </p>
                                <p className="num text-xs tracking-[0.04em] text-muted-foreground">{e.imei}</p>
                                <p className="num mt-1 text-xs text-muted-foreground">
                                  {de} día{de === 1 ? "" : "s"} con el técnico
                                  {e.tienda ? ` · ${e.tienda}` : ""}
                                </p>
                              </div>
                              {puedeOperar && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void marcarTodos(e.equipo_id)}
                                >
                                  Marcar todos listos
                                </Button>
                              )}
                            </div>
                            <ul className="mt-3 space-y-1.5">
                              {e.servicios.map((s) => (
                                <li
                                  key={s.servicio_id}
                                  className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2"
                                >
                                  <span className="text-sm">{etiquetaServicio(s.tipo)}</span>
                                  {puedeOperar && (
                                    <button
                                      type="button"
                                      onClick={() => void marcarListo(s.servicio_id)}
                                      className="rounded-lg border border-emerald-400/25 bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300 transition-colors duration-200 hover:bg-emerald-500/25"
                                    >
                                      Marcar listo
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------- Zona 3: historial ---------- */}
      <section className="mt-8">
        <h2 className="font-display text-base font-semibold">Historial de reparaciones</h2>
        <div className="solid-panel mt-3 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Modelo</th>
                  <th className="px-4 py-3 font-medium">IMEI</th>
                  <th className="px-4 py-3 font-medium">Técnico</th>
                  <th className="px-4 py-3 font-medium">Servicios hechos</th>
                  <th className="px-4 py-3 text-right font-medium">Días</th>
                  {verCostos && <th className="px-4 py-3 text-right font-medium">Costo servicios</th>}
                  <th className="px-4 py-3 font-medium">Fecha de salida</th>
                </tr>
              </thead>
              <tbody>
                {(historial.data ?? []).map((h) => (
                  <tr
                    key={`${h.equipo_id}-${h.salida_at}`}
                    className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                  >
                    <td className="px-4 py-2.5">
                      {h.modelo}
                      {h.gb ? <span className="num text-muted-foreground"> · {h.gb} GB</span> : null}
                    </td>
                    <td className="num px-4 py-2.5 tracking-[0.04em] text-muted-foreground">{h.imei}</td>
                    <td className="px-4 py-2.5">{h.tecnico ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {(h.servicios ?? "")
                        .split(", ")
                        .filter(Boolean)
                        .map((s) => etiquetaServicio(s))
                        .join(" · ") || "—"}
                    </td>
                    <td className="num px-4 py-2.5 text-right">{h.dias ?? 0}</td>
                    {verCostos && (
                      <td className="num px-4 py-2.5 text-right">
                        {h.costo_total == null ? "—" : formatCLP(h.costo_total)}
                      </td>
                    )}
                    <td className="num px-4 py-2.5 text-muted-foreground">{fechaLarga(h.salida_at)}</td>
                  </tr>
                ))}
                {(historial.data ?? []).length === 0 && (
                  <tr>
                    <td
                      colSpan={verCostos ? 7 : 6}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      {historial.isLoading
                        ? "Cargando historial…"
                        : "Todavía no hay reparaciones terminadas."}
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
