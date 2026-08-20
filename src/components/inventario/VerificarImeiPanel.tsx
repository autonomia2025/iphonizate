import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, BadgeCheck, Info, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { verificarImei } from "@/lib/imeicheck.functions";
import {
  MENSAJE_MOTIVO,
  TITULO_MOTIVO,
  alertasDeVerificacion,
  fechaCompra,
  fechaCorta,
  luhnValido,
  type Alerta,
  type ResultadoVerificacion,
} from "@/lib/imeicheck";

type Props = {
  imei: string;
  onUsarModelo: (modelo: string) => void;
  /** Riesgos que exigen confirmación explícita (iCloud activo o lista negra). */
  onRiesgos: (claves: string[]) => void;
  aceptoRiesgo: boolean;
  onAceptoRiesgo: (valor: boolean) => void;
  /** Avisa si hay una verificación exitosa vigente para este IMEI. */
  onVerificado?: (verificado: boolean) => void;
};

const ESTILO_ALERTA: Record<Alerta["nivel"], string> = {
  rojo: "border-red-400/40 bg-red-500/12 text-red-100",
  ambar: "border-amber-400/40 bg-amber-500/12 text-amber-100",
  info: "border-sky-400/30 bg-sky-500/10 text-sky-100",
};

export function VerificarImeiPanel({
  imei,
  onUsarModelo,
  onRiesgos,
  aceptoRiesgo,
  onAceptoRiesgo,
  onVerificado,
}: Props) {
  const verificar = useServerFn(verificarImei);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoVerificacion | null>(null);
  const [imeiVerificado, setImeiVerificado] = useState("");

  const largoOk = /^\d{15}$/.test(imei);
  const imeiOk = largoOk && luhnValido(imei);

  /* Si cambia el IMEI, el resultado anterior deja de ser válido */
  useEffect(() => {
    if (imeiVerificado && imei !== imeiVerificado) {
      setResultado(null);
      setImeiVerificado("");
      onRiesgos([]);
      onAceptoRiesgo(false);
      onVerificado?.(false);
    }
  }, [imei, imeiVerificado, onRiesgos, onAceptoRiesgo, onVerificado]);

  const lanzar = async (forzar = false) => {
    if (!imeiOk || cargando) return;
    setCargando(true);
    try {
      const r = await verificar({ data: { imei, forzar } });
      setResultado(r);
      setImeiVerificado(imei);
      onAceptoRiesgo(false);
      onVerificado?.(r.ok);
      onRiesgos(
        r.ok
          ? alertasDeVerificacion(r.propiedades)
              .filter((a) => a.bloqueante)
              .map((a) => a.clave)
          : [],
      );
    } catch {
      setResultado({
        ok: false,
        motivo: "sin_respuesta",
        mensaje: MENSAJE_MOTIVO.sin_respuesta,
      });
      onRiesgos([]);
      onVerificado?.(false);
    } finally {
      setCargando(false);
    }
  };

  const alertas = resultado?.ok ? alertasDeVerificacion(resultado.propiedades) : [];
  const bloqueantes = alertas.filter((a) => a.bloqueante);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Verificación del IMEI</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Consulta modelo, iCloud, lista negra y garantía. La capacidad y el color siempre se
            escriben a mano.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {resultado?.ok && (
            <Button type="button" variant="ghost" onClick={() => void lanzar(true)} disabled={cargando}>
              Volver a consultar
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => void lanzar(false)}
            disabled={!imeiOk || cargando}
            className="gap-2"
          >
            {cargando ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
            {cargando ? "Verificando…" : "Verificar IMEI"}
          </Button>
        </div>
      </div>

      {!largoOk && (
        <p className="mt-3 text-xs text-muted-foreground">
          Completa los 15 dígitos del IMEI para poder verificarlo.
        </p>
      )}
      {largoOk && !imeiOk && (
        <p className="mt-3 text-xs text-amber-300">
          Ese IMEI no pasa el dígito verificador: está mal copiado. Corrígelo antes de gastar una
          consulta.
        </p>
      )}

      {resultado && !resultado.ok && (
        <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" />
            {TITULO_MOTIVO[resultado.motivo]}
          </p>
          <p className="mt-1 text-xs text-amber-100/85">{resultado.mensaje}</p>
          <p className="mt-1 text-xs text-amber-100/70">
            Puedes ingresar el equipo igual: completa los campos a mano y guarda.
          </p>
        </div>
      )}

      {resultado?.ok && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {resultado.origen === "cache"
              ? `Ya verificado el ${fechaCorta(resultado.fecha)}: se reusó esa consulta sin gastar otra.`
              : `Verificado ahora · servicio ${resultado.serviceId}`}
          </p>

          {alertas.map((a) => (
            <div key={a.clave} className={`rounded-xl border p-3 ${ESTILO_ALERTA[a.nivel]}`}>
              <p className="flex items-center gap-2 text-sm font-semibold">
                {a.nivel === "info" ? <Info className="size-4" /> : <ShieldAlert className="size-4" />}
                {a.titulo}
              </p>
              <p className="mt-1 text-xs opacity-90">{a.texto}</p>
            </div>
          ))}

          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Modelo detectado
                </p>
                <p className="mt-0.5 text-sm font-medium">
                  {resultado.propiedades.modelo ?? "Sin dato"}
                </p>
              </div>
              {resultado.propiedades.modelo && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onUsarModelo(resultado.propiedades.modelo!)}
                >
                  Usar este dato
                </Button>
              )}
            </div>

            <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
              {[
                ["Nombre del dispositivo", resultado.propiedades.deviceName],
                ["Serie", resultado.propiedades.serial],
                ["Segundo IMEI", resultado.propiedades.imei2],
                ["Garantía", resultado.propiedades.warrantyStatus],
                ["País o región", resultado.propiedades.purchaseCountry],
                ["Compra estimada", fechaCompra(resultado.propiedades.estPurchaseDate)],
                ["Bloqueo en USA", resultado.propiedades.usaBlockStatus],
              ].map(([etiqueta, valor]) => (
                <div key={etiqueta as string}>
                  <dt className="text-muted-foreground">{etiqueta}</dt>
                  <dd className="num mt-0.5 text-foreground">{(valor as string) || "—"}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-3 text-xs text-muted-foreground">
              Todos estos datos quedan guardados en la ficha del equipo al guardarlo.
            </p>
          </div>

          {bloqueantes.length > 0 && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100">
              <input
                type="checkbox"
                checked={aceptoRiesgo}
                onChange={(e) => onAceptoRiesgo(e.target.checked)}
                className="mt-0.5 size-4 accent-red-400"
              />
              <span>
                Entiendo el riesgo e ingreso el equipo igual.
                <span className="mt-0.5 block text-xs text-red-100/75">
                  Queda registrado en la auditoría con tu nombre.
                </span>
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
