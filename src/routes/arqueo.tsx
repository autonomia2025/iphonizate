import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, History, PackageX, Play, ScanBarcode, SearchCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "@/components/motion";
import { ArqueoActivo } from "@/components/arqueo/ArqueoActivo";
import { HistorialEquipoModal, type EquipoMinimo } from "@/components/arqueo/HistorialEquipoModal";
import { ResolverPendienteModal } from "@/components/arqueo/ResolverPendienteModal";
import { fechaLarga, textoSim } from "@/lib/inventario";
import {
  ESTADO_ARQUEO_CLASE,
  ESTADO_ARQUEO_ETIQUETA,
  puedeArquear,
  textoEquipo,
  type EstadoArqueo,
  type ResumenCierre,
} from "@/lib/arqueo";
import { cn } from "@/lib/utils";

const DESC =
  "Conteo físico de los equipos disponibles de Oficina Central, escaneando IMEI uno por uno.";

export const Route = createFileRoute("/arqueo")({
  head: () => ({
    meta: [
      { title: "Arqueo de bodega · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Arqueo de bodega · iPhonizate OS" },
      { property: "og:description", content: DESC },
    ],
  }),
  component: ArqueoPage,
});

type Pestana = "arqueos" | "pendientes" | "perdidos";

const sinPrefijo = (m: string) => m.replace(/^.*?:\s*/, "");

function ArqueoPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const queryClient = useQueryClient();
  const permitido = puedeArquear(rol);

  const [activo, setActivo] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>("arqueos");
  const [resumen, setResumen] = useState<ResumenCierre | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [resolviendo, setResolviendo] = useState<EquipoMinimo | null>(null);
  const [viendo, setViendo] = useState<EquipoMinimo | null>(null);

  const arqueos = useQuery({
    queryKey: ["arqueos"],
    enabled: permitido,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("arqueos_listar", { _limite: 100 });
      if (error) throw error;
      return data ?? [];
    },
  });

  const pendientes = useQuery({
    queryKey: ["arqueo-pendientes"],
    enabled: permitido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("arqueo_pendientes_lista");
      if (error) throw error;
      return data ?? [];
    },
  });

  const perdidos = useQuery({
    queryKey: ["arqueo-perdidos"],
    enabled: permitido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("perdidos_lista");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!permitido) {
    return (
      <div className="mx-auto max-w-[86rem]">
        <h1 className="font-display text-2xl font-semibold">Arqueo de bodega</h1>
        <p className="glass mt-6 p-5 text-sm text-muted-foreground">
          Solo dirección y administración pueden hacer arqueos.
        </p>
      </div>
    );
  }

  const abiertos = (arqueos.data ?? []).filter(
    (a) => a.estado === "abierto" || a.estado === "pausado",
  );
  const historial = (arqueos.data ?? []).filter(
    (a) => a.estado === "terminado" || a.estado === "cancelado",
  );

  const iniciar = async () => {
    setIniciando(true);
    const { data, error } = await supabase.rpc("arqueo_abrir");
    setIniciando(false);
    if (error || !data) {
      toast.error("No se pudo iniciar el arqueo", {
        description: sinPrefijo(error?.message ?? ""),
      });
      return;
    }
    setResumen(null);
    void queryClient.invalidateQueries({ queryKey: ["arqueos"] });
    setActivo(data);
  };

  const cancelar = async (id: string, escaneados: number) => {
    if (
      !window.confirm(
        `¿Cancelar este arqueo?\n\nSe descartan sus ${escaneados} escaneo${escaneados === 1 ? "" : "s"} y el stock no cambia. No se puede deshacer.`,
      )
    )
      return;
    setOcupado(id);
    const { error } = await supabase.rpc("arqueo_cancelar", { _arqueo: id });
    setOcupado(null);
    if (error) {
      toast.error("No se pudo cancelar el arqueo", { description: sinPrefijo(error.message) });
      return;
    }
    toast.success("Arqueo cancelado", {
      description: "Sus escaneos se descartaron; el stock no cambió.",
    });
    void arqueos.refetch();
  };

  const marcarPerdido = async (pendienteId: string) => {
    setOcupado(pendienteId);
    const { error } = await supabase.rpc("arqueo_marcar_perdido", {
      _pendiente: pendienteId,
      _nota: nota.trim(),
    });
    setOcupado(null);
    if (error) {
      toast.error("No se pudo marcar como perdido", { description: sinPrefijo(error.message) });
      return;
    }
    toast.success("Equipo marcado como perdido", { description: "Salió del stock." });
    setMarcando(null);
    setNota("");
    void pendientes.refetch();
    void perdidos.refetch();
    void queryClient.invalidateQueries({ queryKey: ["v_stock"] });
  };

  const aparecio = async (equipoId: string, texto: string) => {
    if (!window.confirm(`¿Apareció ${texto}?\n\nVuelve a quedar disponible.`)) return;
    setOcupado(equipoId);
    const { error } = await supabase.rpc("equipo_aparecio", { _equipo: equipoId });
    setOcupado(null);
    if (error) {
      toast.error("No se pudo marcar", { description: sinPrefijo(error.message) });
      return;
    }
    toast.success("Equipo disponible de nuevo", { description: texto });
    void perdidos.refetch();
    void queryClient.invalidateQueries({ queryKey: ["v_stock"] });
  };

  const pestanas: { id: Pestana; label: string; n?: number | undefined }[] = [
    { id: "arqueos", label: "Arqueos", n: abiertos.length || undefined },
    { id: "pendientes", label: "Pendientes", n: pendientes.data?.length },
    { id: "perdidos", label: "Perdidos", n: perdidos.data?.length },
  ];

  return (
    <div className="mx-auto max-w-[86rem]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Arqueo de bodega</h1>
          <p className="mt-1 text-sm text-muted-foreground">{DESC}</p>
        </div>
        {!activo && (
          <Button className="accent-glow gap-2" disabled={iniciando} onClick={() => void iniciar()}>
            <ScanBarcode className="size-4" /> {iniciando ? "Cargando bodega…" : "Iniciar arqueo"}
          </Button>
        )}
      </div>

      {activo ? (
        <div className="mt-6">
          <ArqueoActivo
            arqueoId={activo}
            onSalir={() => {
              setActivo(null);
              void arqueos.refetch();
            }}
            onTerminado={(r) => {
              setActivo(null);
              setResumen(r);
              setPestana(r.faltantes > 0 ? "pendientes" : "arqueos");
              void arqueos.refetch();
              void pendientes.refetch();
              if (r.otros_abiertos > 0) {
                toast.warning(
                  r.otros_abiertos === 1
                    ? "Queda otro arqueo abierto"
                    : `Quedan ${r.otros_abiertos} arqueos abiertos`,
                  {
                    description:
                      "Termínalo o cancélalo para que el conteo de la bodega quede cerrado.",
                  },
                );
              }
            }}
          />
        </div>
      ) : (
        <>
          {resumen && (
            <section className="glass mt-6 p-5">
              <p className="font-display text-base font-semibold">Arqueo terminado</p>
              <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <span>
                  Esperados <b className="num">{resumen.esperados}</b>
                </span>
                <span>
                  Escaneados <b className="num">{resumen.escaneados}</b>
                </span>
                {resumen.contados_en_otro > 0 && (
                  <span>
                    Contados en otro arqueo <b className="num">{resumen.contados_en_otro}</b>
                  </span>
                )}
                {resumen.salieron > 0 && (
                  <span>
                    Vendidos o movidos durante el arqueo <b className="num">{resumen.salieron}</b>
                  </span>
                )}
                <span className={resumen.faltantes > 0 ? "text-amber-300" : "text-emerald-300"}>
                  Faltaron <b className="num">{resumen.faltantes}</b>
                </span>
              </div>
              {resumen.otros_abiertos > 0 && (
                <p className="mt-3 text-sm text-sky-200">
                  Ojo:{" "}
                  {resumen.otros_abiertos === 1
                    ? "queda otro arqueo abierto"
                    : `quedan ${resumen.otros_abiertos} arqueos abiertos`}
                  .
                </p>
              )}
            </section>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {pestanas.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPestana(p.id)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm transition-all duration-200",
                  pestana === p.id
                    ? "accent-glow border-[var(--accent-store)]/50 bg-[var(--accent-store-soft)] text-foreground"
                    : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
                {p.n ? <span className="num ml-1.5 text-xs opacity-80">{p.n}</span> : null}
              </button>
            ))}
          </div>

          {pestana === "arqueos" && (
            <div className="mt-4 space-y-5">
              {abiertos.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {abiertos.map((a) => (
                    <article key={a.id} className="glass p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{a.abierto_por ?? "—"}</p>
                          <p className="num text-xs text-muted-foreground">
                            {fechaLarga(a.abierto_at)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-xs",
                            ESTADO_ARQUEO_CLASE[a.estado as EstadoArqueo],
                          )}
                        >
                          {ESTADO_ARQUEO_ETIQUETA[a.estado as EstadoArqueo] ?? a.estado}
                        </span>
                      </div>
                      <p className="num mt-3 text-sm">
                        Quedan <b>{a.quedan ?? 0}</b> · escaneados {a.escaneados ?? 0} de{" "}
                        {a.esperados}
                      </p>
                      <div className="mt-4 flex gap-2">
                        <Button className="flex-1 gap-2" onClick={() => setActivo(a.id)}>
                          <Play className="size-4" /> Retomar
                        </Button>
                        <Button
                          variant="ghost"
                          className="text-red-300 hover:text-red-200"
                          disabled={ocupado === a.id}
                          onClick={() => void cancelar(a.id, a.escaneados ?? 0)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <section className="solid-panel overflow-hidden">
                <div className="border-b border-white/8 px-4 py-2.5 text-xs uppercase tracking-wide text-muted-foreground">
                  Arqueos anteriores
                </div>
                {historial.length === 0 ? (
                  <EstadoVacio
                    icono={ClipboardList}
                    titulo={
                      arqueos.isError
                        ? "No se pudieron cargar los arqueos"
                        : "Todavía no hay arqueos"
                    }
                    mensaje={
                      arqueos.isError
                        ? "Si es la primera vez, falta aplicar la migración del arqueo en la base."
                        : "Inicia uno para contar los disponibles de la bodega."
                    }
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[56rem] text-sm">
                      <thead>
                        <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-4 py-3 font-medium">Inicio</th>
                          <th className="px-4 py-3 font-medium">Hecho por</th>
                          <th className="px-4 py-3 font-medium">Estado</th>
                          <th className="px-4 py-3 text-right font-medium">Esperados</th>
                          <th className="px-4 py-3 text-right font-medium">Escaneados</th>
                          <th className="px-4 py-3 text-right font-medium">En otro arqueo</th>
                          <th className="px-4 py-3 text-right font-medium">Salieron</th>
                          <th className="px-4 py-3 text-right font-medium">Faltaron</th>
                          <th className="px-4 py-3 font-medium">Cierre</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historial.map((a) => (
                          <tr
                            key={a.id}
                            className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                          >
                            <td className="num px-4 py-2.5 text-muted-foreground">
                              {fechaLarga(a.abierto_at)}
                            </td>
                            <td className="px-4 py-2.5">{a.abierto_por ?? "—"}</td>
                            <td className="px-4 py-2.5">
                              <span
                                className={cn(
                                  "rounded-full border px-2 py-0.5 text-xs",
                                  ESTADO_ARQUEO_CLASE[a.estado as EstadoArqueo],
                                )}
                              >
                                {ESTADO_ARQUEO_ETIQUETA[a.estado as EstadoArqueo] ?? a.estado}
                              </span>
                            </td>
                            <td className="num px-4 py-2.5 text-right">{a.esperados}</td>
                            <td className="num px-4 py-2.5 text-right">{a.escaneados ?? 0}</td>
                            <td className="num px-4 py-2.5 text-right">
                              {a.estado === "terminado" ? (a.contados_en_otro ?? 0) : "—"}
                            </td>
                            <td className="num px-4 py-2.5 text-right">
                              {a.estado === "terminado" ? (a.salieron ?? 0) : "—"}
                            </td>
                            <td
                              className={cn(
                                "num px-4 py-2.5 text-right",
                                (a.faltantes ?? 0) > 0 && "text-amber-300",
                              )}
                            >
                              {a.estado === "terminado" ? (a.faltantes ?? 0) : "—"}
                            </td>
                            <td className="num px-4 py-2.5 text-muted-foreground">
                              {fechaLarga(a.cerrado_at)}
                              {a.cerrado_por ? ` · ${a.cerrado_por}` : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {pestana === "pendientes" && (
            <section className="solid-panel mt-4 overflow-hidden">
              <div className="border-b border-white/8 px-4 py-2.5 text-xs text-muted-foreground">
                Equipos que faltaron en un arqueo. Están fuera del stock y no se pueden vender, reservar
                ni mover hasta resolverlos.
              </div>
              {(pendientes.data ?? []).length === 0 ? (
                <EstadoVacio
                  icono={SearchCheck}
                  titulo="Sin pendientes"
                  mensaje="No falta ningún equipo de los arqueos terminados."
                />
              ) : (
                <ul>
                  {(pendientes.data ?? []).map((p) => {
                    const equipo = { id: p.equipo_id, imei: p.imei, modelo: p.modelo, gb: p.gb, color: p.color };
                    return (
                      <li key={p.equipo_id} className="border-b border-white/5 px-4 py-3 last:border-0">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm">
                              {textoEquipo(p)}
                              {textoSim(p.sim) ? (
                                <span className="text-muted-foreground"> · {textoSim(p.sim)}</span>
                              ) : null}
                            </p>
                            <p className="num text-xs tracking-[0.04em] text-muted-foreground">
                              {p.imei} · faltó el {p.desde ? fechaLarga(p.desde) : "—"}
                              {p.ubicacion ? ` · ${p.ubicacion}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "num rounded-full border px-2 py-0.5 text-xs",
                                (p.dias ?? 0) >= 7
                                  ? "border-red-400/40 bg-red-500/15 text-red-200"
                                  : "border-orange-400/40 bg-orange-500/15 text-orange-200",
                              )}
                            >
                              {p.dias ?? 0} día{p.dias === 1 ? "" : "s"} pendiente
                            </span>
                            <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setViendo(equipo)}>
                              <History className="size-3.5" /> Ver historial
                            </Button>
                            <Button size="sm" onClick={() => setResolviendo(equipo)}>
                              Resolver
                            </Button>
                            {marcando !== p.pendiente_id && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-red-300"
                                onClick={() => {
                                  setMarcando(p.pendiente_id);
                                  setNota("");
                                }}
                              >
                                <PackageX className="size-3.5" /> Marcar como perdido
                              </Button>
                            )}
                          </div>
                        </div>
                        {marcando === p.pendiente_id && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <input
                              autoFocus
                              value={nota}
                              onChange={(e) => setNota(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void marcarPerdido(p.pendiente_id);
                                if (e.key === "Escape") setMarcando(null);
                              }}
                              placeholder="Nota (opcional): dónde se buscó, quién lo vio por última vez…"
                              className="h-9 min-w-0 flex-1 rounded-md border border-white/12 bg-white/5 px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)] focus:ring-2 focus:ring-[var(--accent-store)]/30"
                            />
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={ocupado === p.pendiente_id}
                              onClick={() => void marcarPerdido(p.pendiente_id)}
                            >
                              {ocupado === p.pendiente_id ? "Guardando…" : "Confirmar perdido"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setMarcando(null)}>
                              Cancelar
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {pestana === "perdidos" && (
            <section className="solid-panel mt-4 overflow-hidden">
              <div className="border-b border-white/8 px-4 py-2.5 text-xs text-muted-foreground">
                Equipos fuera del stock por estar perdidos. No se descuentan de la ganancia.
              </div>
              {(perdidos.data ?? []).length === 0 ? (
                <EstadoVacio icono={SearchCheck} titulo="Sin equipos perdidos" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[48rem] text-sm">
                    <thead>
                      <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Equipo</th>
                        <th className="px-4 py-3 font-medium">Marcado</th>
                        <th className="px-4 py-3 font-medium">Nota</th>
                        <th className="px-4 py-3 text-right font-medium">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(perdidos.data ?? []).map((p) => (
                        <tr
                          key={p.equipo_id}
                          className="border-b border-white/5 align-top transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                        >
                          <td className="px-4 py-2.5">
                            {textoEquipo(p)}
                            <span className="num block text-xs tracking-[0.04em] text-muted-foreground">
                              {p.imei}
                            </span>
                          </td>
                          <td className="num px-4 py-2.5 text-muted-foreground">
                            {fechaLarga(p.marcado_at)}
                            {p.marcado_por ? (
                              <span className="block text-xs">{p.marcado_por}</span>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{p.nota ?? "—"}</td>
                          <td className="space-x-2 whitespace-nowrap px-4 py-2.5 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1.5"
                              onClick={() =>
                                setViendo({ id: p.equipo_id, imei: p.imei, modelo: p.modelo, gb: p.gb, color: p.color })
                              }
                            >
                              <History className="size-3.5" /> Ver historial
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={ocupado === p.equipo_id}
                              onClick={() =>
                                void aparecio(p.equipo_id, `${textoEquipo(p)} · ${p.imei}`)
                              }
                            >
                              Apareció
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {resolviendo && (
        <ResolverPendienteModal
          equipo={resolviendo}
          onCerrar={() => setResolviendo(null)}
          onResuelto={() => {
            void pendientes.refetch();
            void perdidos.refetch();
          }}
        />
      )}
      {viendo && <HistorialEquipoModal equipo={viendo} onCerrar={() => setViendo(null)} />}
    </div>
  );
}
