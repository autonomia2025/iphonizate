import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Lock, PackageCheck, Warehouse } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { useStore } from "@/components/StoreContext";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { ESTADO_ETIQUETA, type EquipoEstado } from "@/lib/inventario";
import type { MetodoPago } from "@/lib/pos";
import {
  ESTADOS_EN_CAJA,
  METODOS_CAJA,
  aMonto,
  fechaCorta,
  finDia,
  hoyISO,
  inicioDia,
  puedeCerrarCaja,
} from "@/lib/caja";

const DESC = "Cierre diario por tienda: cuadre de dinero y conteo de equipos.";

export const Route = createFileRoute("/caja")({
  head: () => ({
    meta: [
      { title: "Caja · riff store OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Caja · riff store OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CajaPage,
});

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

type Contado = Record<MetodoPago, string>;
const CONTADO_VACIO: Contado = { efectivo: "", transferencia: "", credito: "", partePago: "" };

function CajaPage() {
  const { usuario } = useAuth();
  const { store } = useStore();
  const rol = usuario?.rol ?? null;
  const autorizado = puedeCerrarCaja(rol);

  const [fecha, setFecha] = useState(hoyISO());
  const [fondo, setFondo] = useState("");
  const [contado, setContado] = useState<Contado>(CONTADO_VACIO);
  const [escaneados, setEscaneados] = useState<string[]>([]);
  const [scan, setScan] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const tiendas = useQuery({
    queryKey: ["tiendas-slug"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase.from("tiendas").select("id, nombre, slug, es_bodega");
      if (error) throw error;
      return data ?? [];
    },
  });

  const tienda = useMemo(
    () => (tiendas.data ?? []).find((t) => t.slug === store.id) ?? null,
    [tiendas.data, store.id],
  );
  const bodega = useMemo(() => (tiendas.data ?? []).find((t) => t.es_bodega) ?? null, [tiendas.data]);

  const suTienda = rol !== "jefe_tienda" || !usuario?.tienda_id || tienda?.id === usuario.tienda_id;
  const activo = autorizado && suTienda && !!tienda;

  const desdeISO = inicioDia(fecha).toISOString();
  const hastaISO = finDia(fecha).toISOString();

  const pagos = useQuery({
    queryKey: ["caja-pagos", tienda?.id, fecha],
    enabled: activo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos")
        .select(
          "id, metodo, monto, nombre_pagador, fecha, venta_id, reserva_id, ventas(tienda_id, anulada), reservas(tienda_id)",
        )
        .gte("fecha", desdeISO)
        .lte("fecha", hastaISO)
        .order("fecha", { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((p) => {
        const v = p.ventas as { tienda_id: string; anulada: boolean } | null;
        const r = p.reservas as { tienda_id: string } | null;
        if (v) return v.tienda_id === tienda!.id && !v.anulada;
        if (r) return r.tienda_id === tienda!.id;
        return false;
      });
    },
  });

  const equipos = useQuery({
    queryKey: ["caja-equipos", tienda?.id],
    enabled: activo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipos")
        .select("id, imei, modelo, gb, color, estado")
        .eq("ubicacion_id", tienda!.id)
        .in("estado", ESTADOS_EN_CAJA as unknown as string[])
        .order("modelo", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const cierreDia = useQuery({
    queryKey: ["caja-cierre", tienda?.id, fecha],
    enabled: activo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cierres_caja")
        .select("*")
        .eq("tienda_id", tienda!.id)
        .gte("fecha", desdeISO)
        .lte("fecha", hastaISO)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const historial = useQuery({
    queryKey: ["caja-historial"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cierres_caja")
        .select("*, usuarios(nombre)")
        .order("fecha", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const cerrado = !!cierreDia.data;

  useEffect(() => {
    setEscaneados([]);
    setScan("");
    setConfirmar(false);
    setContado(CONTADO_VACIO);
    setFondo("");
  }, [fecha, tienda?.id]);

  useEffect(() => {
    if (activo && !cerrado) scanRef.current?.focus();
  }, [activo, cerrado]);

  const fondoNum = aMonto(fondo);

  const esperado = useMemo(() => {
    const base: Record<MetodoPago, number> = {
      efectivo: 0,
      transferencia: 0,
      credito: 0,
      partePago: 0,
    };
    (pagos.data ?? []).forEach((p) => {
      const m = p.metodo as MetodoPago;
      base[m] = (base[m] ?? 0) + Number(p.monto);
    });
    base.efectivo += fondoNum;
    return base;
  }, [pagos.data, fondoNum]);

  const transferencias = useMemo(
    () => (pagos.data ?? []).filter((p) => p.metodo === "transferencia"),
    [pagos.data],
  );

  const contadoNum = (m: MetodoPago) =>
    cerrado ? Number(cierreDia.data?.[`contado_${claveCierre(m)}`] ?? 0) : aMonto(contado[m]);
  const esperadoNum = (m: MetodoPago) =>
    cerrado ? Number(cierreDia.data?.[`esperado_${claveCierre(m)}`] ?? 0) : esperado[m];

  const setContadoM = (m: MetodoPago, v: string) =>
    setContado((prev) => ({ ...prev, [m]: v.replace(/[^\d]/g, "") }));

  const marcados = new Set(escaneados);
  const faltantes = useMemo(
    () => (equipos.data ?? []).filter((e) => !marcados.has(e.imei)),
    [equipos.data, escaneados],
  );

  const totalEsperado = METODOS_CAJA.reduce((a, m) => a + esperadoNum(m.valor), 0);
  const totalContado = METODOS_CAJA.reduce((a, m) => a + contadoNum(m.valor), 0);
  const diferenciaTotal = totalContado - totalEsperado;

  const escanear = (valor: string) => {
    const imei = valor.trim();
    if (!imei) return;
    const equipo = (equipos.data ?? []).find((e) => e.imei === imei);
    if (!equipo) {
      toast.error(`El IMEI ${imei} no está en el listado esperado de esta tienda`);
      return;
    }
    if (marcados.has(imei)) {
      toast.info("Ese equipo ya estaba contado");
      return;
    }
    setEscaneados((prev) => [...prev, imei]);
  };

  const volvioABodega = async (imei: string) => {
    if (!tienda || !bodega) return;
    try {
      const { error } = await supabase.rpc("trasladar_equipos", {
        _imeis: [imei],
        _origen: tienda.id,
        _destino: bodega.id,
      });
      if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
      toast.success("Equipo trasladado a bodega");
      void equipos.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo trasladar el equipo");
    }
  };

  const cerrarCaja = async () => {
    if (!tienda) return;
    setCerrando(true);
    try {
      const { error } = await supabase.from("cierres_caja").insert({
        tienda_id: tienda.id,
        usuario_id: usuario?.id ?? null,
        fondo_inicial: fondoNum,
        esperado_efectivo: esperado.efectivo,
        contado_efectivo: aMonto(contado.efectivo),
        esperado_transferencia: esperado.transferencia,
        contado_transferencia: aMonto(contado.transferencia),
        esperado_credito: esperado.credito,
        contado_credito: aMonto(contado.credito),
        esperado_parte_pago: esperado.partePago,
        contado_parte_pago: aMonto(contado.partePago),
        equipos_esperados: (equipos.data ?? []).length,
        equipos_contados: escaneados.length,
        imeis_faltantes: faltantes.map((e) => e.imei),
        fecha: new Date(`${fecha}T20:00:00`).toISOString(),
      });
      if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
      toast.success("Caja cerrada");
      setConfirmar(false);
      void cierreDia.refetch();
      void historial.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cerrar la caja");
    } finally {
      setCerrando(false);
    }
  };

  const hayDescuadre = diferenciaTotal !== 0 || faltantes.length > 0;

  const intentarCerrar = () => {
    if (hayDescuadre) setConfirmar(true);
    else void cerrarCaja();
  };

  if (!autorizado) {
    return (
      <div className="glass mx-auto max-w-lg p-8 text-center">
        <h1 className="font-display text-xl">Caja</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El cierre de caja es solo para dirección, jefes de tienda y administración.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[92rem]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Caja</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cierre de <span style={{ color: store.accent }}>{store.nombre}</span> del día
            seleccionado
          </p>
        </div>
        <div className="glass flex items-end gap-3 p-3">
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Fecha del cierre
            </span>
            <input
              type="date"
              className={`${campo} num`}
              value={fecha}
              max={hoyISO()}
              onChange={(e) => setFecha(e.target.value)}
            />
          </label>
          {cerrado && (
            <span className="mb-1 flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-300">
              <Lock className="size-3.5" /> Cierre guardado
            </span>
          )}
        </div>
      </div>

      {!suTienda && (
        <div className="glass mt-6 p-6 text-sm text-muted-foreground">
          Como jefe de tienda solo puedes cuadrar y cerrar tu propia tienda. Cambia la tienda activa
          para continuar.
        </div>
      )}

      {activo && (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {/* CUADRE A — dinero */}
          <section className="glass p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">Cuadre de dinero</h2>
              <span
                className={`num text-sm font-medium ${
                  diferenciaTotal === 0 ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {diferenciaTotal === 0 ? "Cuadrado" : `${formatCLP(diferenciaTotal)}`}
              </span>
            </div>

            <label className="mt-4 block max-w-56">
              <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                Fondo inicial
              </span>
              <input
                inputMode="numeric"
                className={`${campo} num`}
                value={cerrado ? String(cierreDia.data?.fondo_inicial ?? 0) : fondo}
                disabled={cerrado}
                placeholder="0"
                onChange={(e) => setFondo(e.target.value)}
              />
            </label>

            <div className="mt-5 space-y-2">
              <div className="grid grid-cols-[1fr_7rem_7rem_7rem] gap-2 px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>Método</span>
                <span className="text-right">Esperado</span>
                <span className="text-right">Contado</span>
                <span className="text-right">Diferencia</span>
              </div>
              {METODOS_CAJA.map((m) => {
                const esp = esperadoNum(m.valor);
                const con = contadoNum(m.valor);
                const dif = con - esp;
                return (
                  <div
                    key={m.valor}
                    className="grid grid-cols-[1fr_7rem_7rem_7rem] items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2"
                  >
                    <span className="text-[13px]">{m.label}</span>
                    <span className="num text-right text-sm">{formatCLP(esp)}</span>
                    <input
                      inputMode="numeric"
                      aria-label={`Contado ${m.label}`}
                      className="num h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-right text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60"
                      value={cerrado ? String(con) : contado[m.valor]}
                      disabled={cerrado}
                      placeholder="0"
                      onChange={(e) => setContadoM(m.valor, e.target.value)}
                    />
                    <span
                      className={`num text-right text-sm font-medium ${
                        dif === 0 ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {formatCLP(dif)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Transferencias del día
              </p>
              {transferencias.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  No hubo transferencias este día
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/[0.07]">
                  {transferencias.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate text-[13px]">
                        {t.nombre_pagador?.trim() || "Sin nombre registrado"}
                        {t.reserva_id && (
                          <span className="ml-2 text-[11px] text-muted-foreground">abono</span>
                        )}
                      </span>
                      <span className="num shrink-0 text-sm">{formatCLP(Number(t.monto))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* CUADRE B — equipos */}
          <section className="glass p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">Cuadre de equipos</h2>
              <span className="num text-sm text-muted-foreground">
                contados{" "}
                <span className="font-medium text-foreground">
                  {cerrado ? (cierreDia.data?.equipos_contados ?? 0) : escaneados.length}
                </span>{" "}
                de {cerrado ? (cierreDia.data?.equipos_esperados ?? 0) : (equipos.data ?? []).length}
              </span>
            </div>

            {cerrado ? (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  IMEIs faltantes registrados
                </p>
                {(cierreDia.data?.imeis_faltantes ?? []).length === 0 ? (
                  <p className="mt-2 text-sm text-emerald-300">
                    Todos los equipos fueron contados
                  </p>
                ) : (
                  <ul className="num mt-2 space-y-1 text-sm text-red-300">
                    {(cierreDia.data?.imeis_faltantes ?? []).map((i: string) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <>
                <form
                  className="mt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    escanear(scan);
                    setScan("");
                    scanRef.current?.focus();
                  }}
                >
                  <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                    Escanear equipos contados
                  </span>
                  <input
                    ref={scanRef}
                    autoFocus
                    inputMode="numeric"
                    className={`${campo} num`}
                    value={scan}
                    placeholder="Escanea o escribe el IMEI y presiona Enter"
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, "");
                      setScan(v);
                      if (v.length === 15) {
                        escanear(v);
                        setScan("");
                      }
                    }}
                  />
                </form>

                <div className="mt-5 space-y-2">
                  {(equipos.data ?? []).map((e) => {
                    const ok = marcados.has(e.imei);
                    return (
                      <div
                        key={e.id}
                        className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 transition-colors duration-200 ${
                          ok
                            ? "border-emerald-400/25 bg-emerald-500/10"
                            : "border-red-400/25 bg-red-500/[0.08]"
                        }`}
                      >
                        {ok ? (
                          <Check className="size-4 shrink-0 text-emerald-300" />
                        ) : (
                          <PackageCheck className="size-4 shrink-0 text-red-300" />
                        )}
                        <span className="num text-[13px]">{e.imei}</span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                          {e.modelo}
                          {e.gb ? ` · ${e.gb}GB` : ""}
                          {e.color ? ` · ${e.color}` : ""} ·{" "}
                          {ESTADO_ETIQUETA[e.estado as EquipoEstado]}
                        </span>
                        {!ok && bodega && bodega.id !== tienda?.id && (
                          <button
                            onClick={() => void volvioABodega(e.imei)}
                            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] transition-colors duration-200 hover:bg-white/[0.09]"
                          >
                            <Warehouse className="size-3.5" /> Volvió a bodega
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {(equipos.data ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No hay equipos activos en esta tienda
                    </p>
                  )}
                </div>
              </>
            )}

            {!cerrado && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {hayDescuadre
                    ? "Hay diferencias, se pedirá confirmación."
                    : "Todo cuadra: dinero y equipos."}
                </p>
                <Button onClick={intentarCerrar} disabled={cerrando}>
                  {cerrando ? "Cerrando…" : "Cerrar caja"}
                </Button>
              </div>
            )}
          </section>
        </div>
      )}

      {/* historial */}
      <div className="solid-panel mt-8 overflow-hidden">
        <div className="border-b border-white/8 px-4 py-3">
          <h2 className="font-display text-sm font-semibold">Cierres anteriores</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Tienda</th>
                <th className="px-4 py-3 font-medium">Cerró</th>
                <th className="px-4 py-3 text-right font-medium">Diferencia en dinero</th>
                <th className="px-4 py-3 text-right font-medium">Equipos faltantes</th>
              </tr>
            </thead>
            <tbody>
              {(historial.data ?? []).map((c) => {
                const dif =
                  Number(c.contado_efectivo) +
                  Number(c.contado_transferencia) +
                  Number(c.contado_credito) +
                  Number(c.contado_parte_pago) -
                  (Number(c.esperado_efectivo) +
                    Number(c.esperado_transferencia) +
                    Number(c.esperado_credito) +
                    Number(c.esperado_parte_pago));
                const faltan = (c.imeis_faltantes ?? []).length;
                return (
                  <tr
                    key={c.id}
                    className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                  >
                    <td className="num px-4 py-2.5">{fechaCorta(c.fecha)}</td>
                    <td className="px-4 py-2.5">
                      {(tiendas.data ?? []).find((t) => t.id === c.tienda_id)?.nombre ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {(c.usuarios as { nombre?: string } | null)?.nombre ?? "—"}
                    </td>
                    <td
                      className={`num px-4 py-2.5 text-right font-medium ${
                        dif === 0 ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {formatCLP(dif)}
                    </td>
                    <td
                      className={`num px-4 py-2.5 text-right ${faltan ? "text-red-300" : "text-muted-foreground"}`}
                    >
                      {faltan}
                    </td>
                  </tr>
                );
              })}
              {(historial.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {historial.isLoading ? "Cargando cierres…" : "Aún no hay cierres guardados"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* confirmación de descuadre */}
      {confirmar && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="glass w-full max-w-md p-6">
            <h2 className="font-display text-lg font-semibold">La caja no cuadra</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Revisa el resumen antes de guardar el cierre. Una vez guardado no se puede editar.
            </p>
            <div className="mt-4 space-y-2 text-sm">
              {METODOS_CAJA.map((m) => {
                const dif = contadoNum(m.valor) - esperadoNum(m.valor);
                if (dif === 0) return null;
                return (
                  <div
                    key={m.valor}
                    className="flex items-center justify-between gap-3 rounded-xl border border-red-400/25 bg-red-500/[0.08] px-3 py-2"
                  >
                    <span>{m.label}</span>
                    <span className="num text-red-300">{formatCLP(dif)}</span>
                  </div>
                );
              })}
              {faltantes.length > 0 && (
                <div className="rounded-xl border border-red-400/25 bg-red-500/[0.08] px-3 py-2">
                  <p className="text-red-300">
                    {faltantes.length} {faltantes.length === 1 ? "equipo" : "equipos"} sin contar
                  </p>
                  <ul className="num mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {faltantes.map((e) => (
                      <li key={e.id}>{e.imei}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmar(false)} disabled={cerrando}>
                Volver a revisar
              </Button>
              <Button onClick={() => void cerrarCaja()} disabled={cerrando}>
                {cerrando ? "Cerrando…" : "Cerrar con diferencias"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const claveCierre = (m: MetodoPago) => (m === "partePago" ? "parte_pago" : m);
