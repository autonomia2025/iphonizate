import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, CircleX, Pause, XCircle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CampoImei } from "@/components/CampoImei";
import { EstadoVacio, useFlashEscaneo } from "@/components/motion";
import { useEquiposEnVivo } from "@/components/inventario/useEquiposEnVivo";
import { ESTADO_ETIQUETA, textoSim, type EquipoEstado } from "@/lib/inventario";
import { fechaLarga } from "@/lib/inventario";
import { horaCorta, textoEquipo, type ResultadoEscaneo, type ResumenCierre } from "@/lib/arqueo";
import { cn } from "@/lib/utils";

type Aviso = { tipo: "ok" | "ya" | "no"; titulo: string; detalle: string };

const AVISO_CLASE: Record<Aviso["tipo"], string> = {
  ok: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  ya: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  no: "border-red-400/40 bg-red-500/15 text-red-100",
};

const sinPrefijo = (m: string) => m.replace(/^.*?:\s*/, "");

/** Pantalla de conteo: cada IMEI escaneado sale de la lista. Al terminar, queda vacía. */
export function ArqueoActivo({
  arqueoId,
  onSalir,
  onTerminado,
}: {
  arqueoId: string;
  onSalir: () => void;
  onTerminado: (resumen: ResumenCierre) => void;
}) {
  const queryClient = useQueryClient();
  const [scan, setScan] = useState("");
  const [aviso, setAviso] = useState<Aviso | null>(null);
  /* Escaneados que todavía no vuelven del servidor: salen de la lista al instante */
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [accion, setAccion] = useState<null | "pausar" | "terminar" | "cancelar">(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const flash = useFlashEscaneo();

  const arqueos = useQuery({
    queryKey: ["arqueos"],
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("arqueos_listar", { _limite: 100 });
      if (error) throw error;
      return data ?? [];
    },
  });
  const info = (arqueos.data ?? []).find((a) => a.id === arqueoId) ?? null;

  /* Lo que falta: se refresca solo, así lo escaneado en otro arqueo o lo vendido/movido sale */
  const lista = useQuery({
    queryKey: ["arqueo-lista", arqueoId],
    refetchInterval: 4_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("arqueo_lista", { _arqueo: arqueoId });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEquiposEnVivo(() => {
    void lista.refetch();
  });

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  /* Cuando la lista del servidor ya no trae un equipo oculto, deja de hacer falta ocultarlo */
  useEffect(() => {
    if (!lista.data || ocultos.size === 0) return;
    const enLista = new Set(lista.data.map((e) => e.equipo_id));
    setOcultos((prev) => {
      const siguiente = new Set([...prev].filter((id) => enLista.has(id)));
      return siguiente.size === prev.size ? prev : siguiente;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista.data]);

  const visibles = useMemo(
    () => (lista.data ?? []).filter((e) => !ocultos.has(e.equipo_id)),
    [lista.data, ocultos],
  );

  const refrescar = () => {
    void lista.refetch();
    void queryClient.invalidateQueries({ queryKey: ["arqueos"] });
  };

  const escanear = async (valor: string) => {
    const imei = valor.trim();
    setScan("");
    scanRef.current?.focus();
    if (!imei) return;

    const enLista = visibles.find((e) => e.imei === imei);
    if (enLista) {
      setOcultos((prev) => new Set(prev).add(enLista.equipo_id));
      flash.ok();
      setAviso({ tipo: "ok", titulo: "Contado", detalle: `${textoEquipo(enLista)} · ${imei}` });
    }

    const { data, error } = await supabase.rpc("arqueo_escanear", {
      _arqueo: arqueoId,
      _imei: imei,
    });
    if (error) {
      if (enLista)
        setOcultos((prev) => {
          const s = new Set(prev);
          s.delete(enLista.equipo_id);
          return s;
        });
      flash.error();
      setAviso({ tipo: "no", titulo: "No se pudo registrar", detalle: sinPrefijo(error.message) });
      return;
    }

    const r = data as unknown as ResultadoEscaneo;
    if (r.resultado === "ok") {
      if (!enLista) {
        flash.ok();
        setAviso({ tipo: "ok", titulo: "Contado", detalle: `${textoEquipo(r)} · ${imei}` });
      }
      refrescar();
      return;
    }

    if (enLista)
      setOcultos((prev) => {
        const s = new Set(prev);
        s.delete(enLista.equipo_id);
        return s;
      });
    flash.error();

    if (r.resultado === "ya_escaneado") {
      setAviso({
        tipo: "ya",
        titulo: "Ya escaneado",
        detalle: `${r.modelo} · ${imei} · ${
          r.mismo_arqueo ? "en este arqueo" : `en el arqueo de ${r.por ?? "otra persona"}`
        } a las ${horaCorta(r.fecha)}`,
      });
      void lista.refetch();
      return;
    }

    let detalle = `${imei}: ese IMEI no está en el sistema.`;
    if (r.motivo === "fuera") {
      const estado = (r.estado ?? "") as EquipoEstado;
      const enBodega = r.estado === "DISPONIBLE" && r.tienda === info?.tienda;
      detalle = enBodega
        ? `${r.modelo} · ${imei}: llegó a la bodega después de iniciar este arqueo.`
        : `${r.modelo} · ${imei}: está ${(ESTADO_ETIQUETA[estado] ?? r.estado ?? "").toLowerCase()}${
            r.tienda ? ` en ${r.tienda}` : ""
          }.`;
    }
    setAviso({ tipo: "no", titulo: "No está en la lista", detalle });
  };

  const pausar = async () => {
    setAccion("pausar");
    const { error } = await supabase.rpc("arqueo_pausar", { _arqueo: arqueoId });
    setAccion(null);
    if (error) {
      toast.error("No se pudo pausar", { description: sinPrefijo(error.message) });
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["arqueos"] });
    toast.success("Arqueo en pausa", { description: "Lo retomas desde la lista, donde quedó." });
    onSalir();
  };

  const terminar = async () => {
    const quedan = visibles.length;
    const texto =
      quedan === 0
        ? "¿Terminar el arqueo?"
        : `Quedan ${quedan} equipo${quedan === 1 ? "" : "s"} sin escanear: pasarán a Pendientes.\n\n¿Terminar el arqueo?`;
    if (!window.confirm(texto)) return;
    setAccion("terminar");
    const { data, error } = await supabase.rpc("arqueo_terminar", { _arqueo: arqueoId });
    setAccion(null);
    if (error) {
      toast.error("No se pudo terminar el arqueo", { description: sinPrefijo(error.message) });
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["arqueos"] });
    void queryClient.invalidateQueries({ queryKey: ["arqueo-pendientes"] });
    onTerminado(data as unknown as ResumenCierre);
  };

  const cancelar = async () => {
    const n = info?.escaneados ?? 0;
    if (
      !window.confirm(
        `¿Cancelar este arqueo?\n\nSe descartan sus ${n} escaneo${n === 1 ? "" : "s"} y el stock no cambia. No se puede deshacer.`,
      )
    )
      return;
    setAccion("cancelar");
    const { error } = await supabase.rpc("arqueo_cancelar", { _arqueo: arqueoId });
    setAccion(null);
    if (error) {
      toast.error("No se pudo cancelar el arqueo", { description: sinPrefijo(error.message) });
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["arqueos"] });
    toast.success("Arqueo cancelado", {
      description: "Sus escaneos se descartaron; el stock no cambió.",
    });
    onSalir();
  };

  const cerrado = info && (info.estado === "terminado" || info.estado === "cancelado");
  const otrosAbiertos = (arqueos.data ?? []).filter(
    (a) => a.id !== arqueoId && (a.estado === "abierto" || a.estado === "pausado"),
  );

  return (
    <div className="space-y-5">
      <section className="glass p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Arqueo · {info?.tienda ?? "bodega"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Iniciado {fechaLarga(info?.abierto_at)} por {info?.abierto_por ?? "—"}
            </p>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Quedan
              </p>
              <p className="num font-display text-3xl font-semibold leading-tight">
                {visibles.length}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Escaneados aquí
              </p>
              <p className="num font-display text-3xl font-semibold leading-tight">
                {info?.escaneados ?? 0}
                <span className="text-base text-muted-foreground"> / {info?.esperados ?? 0}</span>
              </p>
            </div>
          </div>
        </div>

        {otrosAbiertos.length > 0 && (
          <p className="mt-3 rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
            Hay{" "}
            {otrosAbiertos.length === 1
              ? "otro arqueo abierto"
              : `${otrosAbiertos.length} arqueos abiertos más`}{" "}
            ({otrosAbiertos.map((a) => a.abierto_por ?? "—").join(", ")}): lo que se escanee allá
            también sale de esta lista.
          </p>
        )}

        {cerrado ? (
          <p className="mt-4 text-sm text-amber-300">Este arqueo ya está {info?.estado}.</p>
        ) : (
          <div className="mt-4">
            <CampoImei
              valor={scan}
              onValor={setScan}
              onAgregar={(imei) => void escanear(imei)}
              claseFlash={flash.clase}
              inputRef={scanRef}
              etiquetaBoton="Contar"
              placeholder="Escanea el IMEI de cada equipo de la bodega"
            />
          </div>
        )}

        {aviso && (
          <div
            role="status"
            className={cn(
              "mt-3 flex items-start gap-3 rounded-xl border px-4 py-3",
              AVISO_CLASE[aviso.tipo],
            )}
          >
            {aviso.tipo === "ok" ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            ) : aviso.tipo === "ya" ? (
              <CircleAlert className="mt-0.5 size-5 shrink-0" />
            ) : (
              <CircleX className="mt-0.5 size-5 shrink-0" />
            )}
            <div>
              <p className="text-sm font-semibold">{aviso.titulo}</p>
              <p className="num text-sm opacity-90">{aviso.detalle}</p>
            </div>
          </div>
        )}

        {!cerrado && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="gap-2"
                disabled={accion !== null}
                onClick={() => void pausar()}
              >
                <Pause className="size-4" /> {accion === "pausar" ? "Pausando…" : "Pausar"}
              </Button>
              <Button
                variant="ghost"
                className="gap-2 text-red-300 hover:text-red-200"
                disabled={accion !== null}
                onClick={() => void cancelar()}
              >
                <XCircle className="size-4" />{" "}
                {accion === "cancelar" ? "Cancelando…" : "Cancelar arqueo"}
              </Button>
            </div>
            <Button
              className="accent-glow"
              disabled={accion !== null}
              onClick={() => void terminar()}
            >
              {accion === "terminar" ? "Terminando…" : "Terminar arqueo"}
            </Button>
          </div>
        )}
        {cerrado && (
          <div className="mt-4">
            <Button variant="secondary" onClick={onSalir}>
              Volver
            </Button>
          </div>
        )}
      </section>

      <section className="solid-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Por escanear
          </span>
          <span className="num text-xs text-muted-foreground">{visibles.length} equipos</span>
        </div>
        {lista.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Cargando la bodega…</p>
        ) : visibles.length === 0 ? (
          <EstadoVacio
            icono={CheckCircle2}
            titulo="Todo contado"
            mensaje="No queda nada por escanear. Ya puedes terminar el arqueo."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Modelo</th>
                  <th className="px-4 py-3 text-right font-medium">GB</th>
                  <th className="px-4 py-3 font-medium">Color</th>
                  <th className="px-4 py-3 font-medium">SIM</th>
                  <th className="px-4 py-3 font-medium">IMEI</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((e) => (
                  <tr
                    key={e.equipo_id}
                    className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                  >
                    <td className="px-4 py-2.5">{e.modelo}</td>
                    <td className="num px-4 py-2.5 text-right">{e.gb ?? "—"}</td>
                    <td className="px-4 py-2.5">{e.color ?? "—"}</td>
                    <td className="px-4 py-2.5">{textoSim(e.sim) ?? "—"}</td>
                    <td className="num px-4 py-2.5 tracking-[0.04em] text-muted-foreground">
                      {e.imei}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
