import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ScanLine, ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useFlashEscaneo } from "@/components/motion";
import { useAuth } from "@/components/AuthContext";
import { useStore } from "@/components/StoreContext";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { fechaLarga, puedeVerCostos } from "@/lib/inventario";
import {
  SLA_BORDE,
  SLA_CLASE,
  equipoTexto,
  nivelSla,
  puedeOperarGarantias,
  textoSla,
} from "@/lib/garantias";
import { cn } from "@/lib/utils";
import {
  MandarTecnicoModal,
  type GarantiaMinima,
} from "@/components/garantias/MandarTecnicoModal";
import { ResolverGarantiaModal } from "@/components/garantias/ResolverGarantiaModal";
import { BuscarVendidos } from "@/components/garantias/BuscarVendidos";

const DESC = "Solicitudes de garantía, SLA de 72 horas y resoluciones por reparación o cambio.";

export const Route = createFileRoute("/garantias")({
  head: () => ({
    meta: [
      { title: "Garantías · riff store OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Garantías · riff store OS" },
      { property: "og:description", content: DESC },
    ],
  }),
  component: GarantiasPage,
});

const campo =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";
const etiqueta = "mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-muted-foreground";

type Venta = {
  equipo_id: string | null;
  modelo: string | null;
  gb: number | null;
  color: string | null;
  estado: string | null;
  venta_id: string | null;
  fecha_venta: string | null;
  tienda_venta: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  dias_desde_venta: number | null;
};

function GarantiasPage() {
  const { usuario } = useAuth();
  const { store } = useStore();
  const rol = usuario?.rol ?? null;
  const puedeOperar = puedeOperarGarantias(rol);
  const verCostos = puedeVerCostos(rol);

  const [scan, setScan] = useState("");
  const [imei, setImei] = useState("");
  const [venta, setVenta] = useState<Venta | null>(null);
  const [sinVenta, setSinVenta] = useState(false);
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [falla, setFalla] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aTecnico, setATecnico] = useState<GarantiaMinima | null>(null);
  const [aResolver, setAResolver] = useState<GarantiaMinima | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const tiendas = useQuery({
    queryKey: ["tiendas-slug"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tiendas").select("id, nombre, slug");
      if (error) throw error;
      return data ?? [];
    },
  });

  const tiendaActiva = useMemo(
    () => (tiendas.data ?? []).find((t) => t.slug === store.id) ?? null,
    [tiendas.data, store.id],
  );

  const garantias = useQuery({
    queryKey: ["v_garantias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_garantias")
        .select(
          "id, imei, equipo_id, modelo, gb, color, equipo_estado, cliente_nombre, cliente_telefono, falla, notas, estado, resolucion, imei_entregado, diferencia, tienda_id, tienda, recibio, fecha, fecha_cierre, horas, servicios_pendientes, costo_arreglo",
        )
        .order("fecha", { ascending: false })
        .limit(400);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (puedeOperar) scanRef.current?.focus();
  }, [puedeOperar]);

  const abiertas = useMemo(
    () =>
      (garantias.data ?? [])
        .filter((g) => g.estado === "abierta")
        .sort((a, b) => (b.horas ?? 0) - (a.horas ?? 0)),
    [garantias.data],
  );

  const resueltas = useMemo(
    () => (garantias.data ?? []).filter((g) => g.estado !== "abierta"),
    [garantias.data],
  );

  const limpiar = () => {
    setImei("");
    setVenta(null);
    setSinVenta(false);
    setCliente("");
    setTelefono("");
    setFalla("");
    setNotas("");
    setScan("");
    scanRef.current?.focus();
  };

  const flash = useFlashEscaneo();

  const escanear = async (valor: string) => {
    const codigo = valor.trim();
    setScan("");
    if (!codigo) return;
    if (!/^\d{15}$/.test(codigo)) {
      flash.error(); toast.error("El IMEI debe tener 15 dígitos");
      return;
    }
    const { data, error } = await supabase.rpc("garantia_buscar_imei", { _imei: codigo });
    if (error) {
      flash.error(); toast.error("No se pudo buscar el IMEI", { description: error.message });
      return;
    }
    const fila = (Array.isArray(data) ? data[0] : data) as Venta | undefined;
    setImei(codigo);
    setVenta(fila ?? null);
    const hayVenta = !!fila?.venta_id;
    setSinVenta(!hayVenta);
    setCliente(fila?.cliente_nombre ?? "");
    setTelefono(fila?.cliente_telefono ?? "");
    if (!hayVenta) {
      flash.error(); toast.warning("Ese IMEI no tiene venta registrada", {
        description: "Puedes ingresar la garantía igual, quedará sin venta asociada.",
      });
    }
    flash.ok();
  };

  const ingresar = async () => {
    if (!imei) {
      toast.error("Escanea el IMEI del equipo");
      return;
    }
    if (!tiendaActiva?.id) {
      toast.error("No se pudo identificar la tienda activa");
      return;
    }
    if (!cliente.trim()) {
      toast.error("Falta el nombre del cliente");
      return;
    }
    if (!falla.trim()) {
      toast.error("Describe la falla del equipo");
      return;
    }
    setGuardando(true);
    const { error } = await supabase.rpc("crear_garantia", {
      _imei: imei,
      _cliente_nombre: cliente.trim(),
      _cliente_telefono: telefono.trim() || "",
      _falla: falla.trim(),
      _notas: notas.trim() || "",
      _tienda: tiendaActiva.id,
    });
    setGuardando(false);
    if (error) {
      toast.error("No se pudo ingresar la garantía", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    toast.success("Garantía ingresada", { description: `${cliente.trim()} · SLA 72 horas` });
    limpiar();
    await garantias.refetch();
  };

  return (
    <div className="mx-auto max-w-[86rem] space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Garantías</h1>
        <p className="mt-1 text-sm text-muted-foreground">{DESC}</p>
      </div>

      {/* Zona 1 */}
      <section className="glass p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold">Ingresar garantía</h2>
          <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-muted-foreground">
            Entra a {tiendaActiva?.nombre ?? store.nombre}
          </span>
        </div>

        {!puedeOperar ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Tu rol no puede ingresar garantías.
          </p>
        ) : (
          <>
            <div className="relative mt-4">
              <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={scanRef}
                value={scan}
                onChange={(e) => setScan(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void escanear(scan);
                }}
                placeholder="Escanea el IMEI del equipo que trae el cliente"
                className={cn(campo, "num pl-9", flash.clase)}
              />
            </div>

            <BuscarVendidos
              imeiActivo={imei}
              onSeleccionar={(f) => {
                setImei(f.imei);
                setVenta(f);
                setSinVenta(!f.venta_id);
                setCliente(f.cliente_nombre ?? "");
                setTelefono(f.cliente_telefono ?? "");
              }}
            />

            {imei && (
              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                <div
                  className={cn(
                    "rounded-xl border p-4",
                    sinVenta
                      ? "border-amber-400/30 bg-amber-500/[0.07]"
                      : "border-white/[0.06] bg-white/[0.03]",
                  )}
                >
                  <p className="num text-[12px] text-muted-foreground">{imei}</p>
                  <p className="mt-1 text-sm font-medium">
                    {equipoTexto(venta?.modelo, venta?.gb)}
                    {venta?.color ? ` · ${venta.color}` : ""}
                  </p>
                  {sinVenta ? (
                    <p className="mt-2 flex items-start gap-2 text-[12px] text-amber-300">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      Sin venta registrada para este IMEI. Se ingresará igual, sin venta asociada.
                    </p>
                  ) : (
                    <dl className="mt-3 space-y-1.5 text-[12px]">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Vendido</dt>
                        <dd className="num">{fechaLarga(venta?.fecha_venta)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Tienda</dt>
                        <dd>{venta?.tienda_venta ?? "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Cliente</dt>
                        <dd>{venta?.cliente_nombre ?? "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Hace</dt>
                        <dd className="num">{venta?.dias_desde_venta ?? 0} días</dd>
                      </div>
                    </dl>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={etiqueta}>Cliente</label>
                    <input
                      value={cliente}
                      onChange={(e) => setCliente(e.target.value)}
                      className={campo}
                    />
                  </div>
                  <div>
                    <label className={etiqueta}>Teléfono</label>
                    <input
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      className={`${campo} num`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={etiqueta}>Falla</label>
                    <input
                      value={falla}
                      onChange={(e) => setFalla(e.target.value)}
                      placeholder="No carga, pantalla con líneas, batería dura poco…"
                      className={campo}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={etiqueta}>Notas</label>
                    <textarea
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      rows={2}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
                    />
                  </div>
                  <div className="flex justify-end gap-3 sm:col-span-2">
                    <Button variant="ghost" onClick={limpiar}>
                      Limpiar
                    </Button>
                    <Button
                      className="accent-glow"
                      onClick={() => void ingresar()}
                      disabled={guardando}
                    >
                      {guardando ? "Guardando…" : "Ingresar garantía"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Zona 2 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold">Garantías abiertas</h2>
          <span className="num rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-muted-foreground">
            {abiertas.length} en curso · SLA 72h
          </span>
        </div>

        {abiertas.length === 0 ? (
          <p className="glass p-5 text-sm text-muted-foreground">
            No hay garantías abiertas ahora mismo.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {abiertas.map((g) => {
              const horas = g.horas ?? 0;
              const nivel = nivelSla(horas);
              return (
                <article
                  key={g.id as string}
                  className={cn("glass border p-4", SLA_BORDE[nivel])}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {equipoTexto(g.modelo, g.gb)}
                      </p>
                      <p className="num text-[12px] text-muted-foreground">{g.imei}</p>
                    </div>
                    <span
                      className={cn(
                        "num shrink-0 rounded-full border px-2 py-0.5 text-[11px]",
                        SLA_CLASE[nivel],
                      )}
                    >
                      {textoSla(horas)}
                    </span>
                  </div>

                  <p className="mt-3 text-[13px]">{g.cliente_nombre}</p>
                  <p className="num text-[12px] text-muted-foreground">
                    {g.cliente_telefono ?? "sin teléfono"} · {g.tienda ?? "—"}
                  </p>

                  <p className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 text-[12px] text-muted-foreground">
                    {g.falla}
                  </p>

                  {(g.servicios_pendientes ?? 0) > 0 && (
                    <p className="num mt-2 text-[12px] text-amber-300">
                      {g.servicios_pendientes} arreglo(s) en curso
                      {verCostos && g.costo_arreglo != null
                        ? ` · ${formatCLP(Number(g.costo_arreglo))}`
                        : ""}
                    </p>
                  )}

                  {puedeOperar && (
                    <div className="mt-4 flex gap-2">
                      <Button
                        variant="ghost"
                        className="flex-1"
                        onClick={() =>
                          setATecnico({
                            id: g.id as string,
                            imei: g.imei as string,
                            modelo: g.modelo ?? null,
                            gb: g.gb ?? null,
                          })
                        }
                      >
                        <Wrench className="mr-1.5 size-4" />
                        Mandar a técnico
                      </Button>
                      <Button
                        className="accent-glow flex-1"
                        onClick={() =>
                          setAResolver({
                            id: g.id as string,
                            imei: g.imei as string,
                            modelo: g.modelo ?? null,
                            gb: g.gb ?? null,
                          })
                        }
                      >
                        <ShieldCheck className="mr-1.5 size-4" />
                        Resolver
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Zona 3 */}
      <section className="solid-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold">Historial de garantías resueltas</h2>
          <span className="num text-[12px] text-muted-foreground">{resueltas.length} casos</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[58rem] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Ingreso</th>
                <th className="px-3 py-2.5 font-medium">Equipo</th>
                <th className="px-3 py-2.5 font-medium">Cliente</th>
                <th className="px-3 py-2.5 font-medium">Falla</th>
                <th className="px-3 py-2.5 font-medium">Resolución</th>
                <th className="px-3 py-2.5 text-right font-medium">Días</th>
                <th className={cn("px-3 py-2.5 font-medium", verCostos ? "" : "pr-5")}>SLA</th>
                {verCostos && <th className="px-5 py-2.5 text-right font-medium">Arreglo</th>}
              </tr>
            </thead>
            <tbody>
              {resueltas.length === 0 && (
                <tr>
                  <td
                    className="px-5 py-6 text-center text-muted-foreground"
                    colSpan={verCostos ? 8 : 7}
                  >
                    Todavía no hay garantías resueltas.
                  </td>
                </tr>
              )}
              {resueltas.map((g) => {
                const horas = g.horas ?? 0;
                const cumplio = horas <= 72;
                return (
                  <tr
                    key={g.id as string}
                    className="border-t border-white/[0.05] transition-colors hover:bg-surface-alt"
                  >
                    <td className="num px-5 py-2.5 text-muted-foreground">
                      {fechaLarga(g.fecha)}
                    </td>
                    <td className="px-3 py-2.5">
                      {equipoTexto(g.modelo, g.gb)}
                      <span className="num block text-[11px] text-muted-foreground">{g.imei}</span>
                    </td>
                    <td className="px-3 py-2.5">{g.cliente_nombre}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{g.falla}</td>
                    <td className="px-3 py-2.5">
                      {g.estado === "resuelta" && g.resolucion === "cambio" ? (
                        <span>
                          Cambio
                          <span className="num block text-[11px] text-muted-foreground">
                            entregó {g.imei_entregado} · dif {formatCLP(Number(g.diferencia ?? 0))}
                          </span>
                        </span>
                      ) : (
                        <span>Reparado</span>
                      )}
                    </td>
                    <td className="num px-3 py-2.5 text-right">
                      {Math.max(0, Math.round(horas / 24))}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "num rounded-full border px-2 py-0.5 text-[11px]",
                          cumplio
                            ? "border-emerald-400/25 bg-emerald-500/15 text-emerald-300"
                            : "border-red-400/25 bg-red-500/15 text-red-300",
                        )}
                      >
                        {cumplio ? `${horas}h · cumplió` : `${horas}h · fuera de SLA`}
                      </span>
                    </td>
                    {verCostos && (
                      <td className="num px-5 py-2.5 text-right">
                        {formatCLP(Number(g.costo_arreglo ?? 0))}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {aTecnico && (
        <MandarTecnicoModal
          garantia={aTecnico}
          puedeCostos={verCostos}
          onCerrar={() => setATecnico(null)}
          onHecho={() => void garantias.refetch()}
        />
      )}
      {aResolver && (
        <ResolverGarantiaModal
          garantia={aResolver}
          onCerrar={() => setAResolver(null)}
          onHecho={() => void garantias.refetch()}
        />
      )}
    </div>
  );
}
