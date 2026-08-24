import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saldoImeicheck, serviciosImeicheck } from "@/lib/imeicheck.functions";
import { SALDO_BAJO, fechaCorta, formatoUSD } from "@/lib/imeicheck";

const DESC = "Configuración de la verificación de IMEI: servicio, ambiente y saldo de la cuenta.";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Configuración · iPhonizate OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfiguracionPage,
});

const selectClase =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

function ConfiguracionPage() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.rol === "direccion";

  const leerSaldo = useServerFn(saldoImeicheck);
  const leerServicios = useServerFn(serviciosImeicheck);

  const [serviceId, setServiceId] = useState("");
  const [ambiente, setAmbiente] = useState("sandbox");
  const [guardando, setGuardando] = useState(false);

  const config = useQuery({
    queryKey: ["imeicheck-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imeicheck_config")
        .select("service_id, ambiente, updated_at")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const saldo = useQuery({ queryKey: ["imeicheck-saldo"], queryFn: () => leerSaldo({}) });
  const servicios = useQuery({
    queryKey: ["imeicheck-servicios"],
    queryFn: () => leerServicios({}),
  });

  const consumo = useQuery({
    queryKey: ["imeicheck-consumo"],
    queryFn: async () => {
      const desde = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("imei_verificaciones")
        .select("status, costo, fecha")
        .gte("fecha", desde);
      if (error) throw error;
      const filas = data ?? [];
      return {
        total: filas.length,
        exitosas: filas.filter((f) => f.status === "successful").length,
        costo: filas.reduce((a, f) => a + Number(f.costo ?? 0), 0),
      };
    },
  });

  useEffect(() => {
    if (!config.data) return;
    setServiceId(String(config.data.service_id ?? ""));
    setAmbiente(String(config.data.ambiente ?? "sandbox"));
  }, [config.data]);

  const guardar = async () => {
    if (!puedeEditar) return;
    setGuardando(true);
    const { error } = await supabase
      .from("imeicheck_config")
      .update({ service_id: Number(serviceId), ambiente })
      .eq("id", 1);
    setGuardando(false);
    if (error) {
      toast.error("No pudimos guardar la configuración", {
        description: /permission|row-level/i.test(error.message)
          ? "Solo Dirección puede cambiar esta configuración."
          : "Revisa los datos e inténtalo otra vez.",
      });
      return;
    }
    toast.success("Configuración guardada");
    void config.refetch();
  };

  const listaServicios = servicios.data?.ok ? servicios.data.servicios : [];
  const saldoBajo = saldo.data?.ok && saldo.data.saldo < SALDO_BAJO;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl">Configuración</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verificación de IMEI: qué servicio se usa, en qué ambiente y cuánto saldo queda.
        </p>
      </header>

      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <Wallet className="size-4 text-[var(--accent-store)]" />
              Saldo de la cuenta imeicheck
            </p>
            {saldo.isPending ? (
              <p className="mt-2 text-sm text-muted-foreground">Consultando…</p>
            ) : saldo.data?.ok ? (
              <p className="num mt-2 font-display text-3xl">{formatoUSD(saldo.data.saldo)}</p>
            ) : (
              <p className="mt-2 text-sm text-amber-200">
                {saldo.data?.mensaje ?? "No pudimos leer el saldo."}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            className="gap-2"
            onClick={() => void saldo.refetch()}
            disabled={saldo.isFetching}
          >
            {saldo.isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Actualizar
          </Button>
        </div>

        {saldoBajo && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/35 bg-amber-500/12 p-3 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 size-4" />
            <span>
              El saldo está bajo. Recarga la cuenta para que las verificaciones no se corten en medio
              de un ingreso.
            </span>
          </div>
        )}

        {consumo.data && (
          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              ["Verificaciones (30 días)", String(consumo.data.total)],
              ["Con resultado", String(consumo.data.exitosas)],
              ["Gasto registrado", formatoUSD(consumo.data.costo)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="num mt-1 font-display text-xl">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="glass rounded-2xl p-5">
        <p className="text-sm font-medium">Servicio de verificación</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sandbox es gratis y devuelve datos de prueba. Producción consume saldo real por cada
          consulta.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="servicio">Servicio</Label>
            {listaServicios.length > 0 ? (
              <select
                id="servicio"
                className={`${selectClase} mt-1`}
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                disabled={!puedeEditar}
              >
                {listaServicios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} · {formatoUSD(s.precio)}
                  </option>
                ))}
                {!listaServicios.some((s) => String(s.id) === serviceId) && serviceId && (
                  <option value={serviceId}>Servicio {serviceId} (actual)</option>
                )}
              </select>
            ) : (
              <input
                id="servicio"
                inputMode="numeric"
                className={`${selectClase} num mt-1`}
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={!puedeEditar}
              />
            )}
            {servicios.data && !servicios.data.ok && (
              <p className="mt-1 text-xs text-amber-200">{servicios.data.mensaje}</p>
            )}
          </div>

          <div>
            <Label htmlFor="ambiente">Ambiente</Label>
            <select
              id="ambiente"
              className={`${selectClase} mt-1`}
              value={ambiente}
              onChange={(e) => setAmbiente(e.target.value)}
              disabled={!puedeEditar}
            >
              <option value="sandbox">Sandbox (pruebas, sin costo)</option>
              <option value="produccion">Producción (consume saldo)</option>
            </select>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {config.data?.updated_at
              ? `Última actualización: ${fechaCorta(String(config.data.updated_at))}`
              : "Sin cambios registrados."}
          </p>
          {puedeEditar ? (
            <Button onClick={() => void guardar()} disabled={guardando || !serviceId}>
              {guardando ? "Guardando…" : "Guardar configuración"}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Solo Dirección puede cambiar esto.</p>
          )}
        </div>
      </section>
    </div>
  );
}
