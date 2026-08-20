import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BadgeCheck, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { verificarYGuardarImei } from "@/lib/imeicheck.functions";
import { MENSAJE_MOTIVO, luhnValido } from "@/lib/imeicheck";
import { fechaLarga } from "@/lib/inventario";

/** Campos de verificación guardados en la fila del equipo. */
export type VerificacionFila = {
  imei: string;
  serie?: string | null;
  imei2?: string | null;
  icloud_activo?: boolean | null;
  lista_negra?: boolean | null;
  bloqueo_operador?: boolean | null;
  reemplazado_apple?: boolean | null;
  garantia_estado?: string | null;
  pais_compra?: string | null;
  fecha_compra_estimada?: string | null;
  bloqueo_usa?: string | null;
  verificado_at?: string | null;
};

const siNo = (valor?: boolean | null) => (valor ? "Sí" : valor === false ? "No" : "—");

function Dato({ etiqueta, valor, alerta }: { etiqueta: string; valor: React.ReactNode; alerta?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        alerta ? "border-red-400/35 bg-red-500/10" : "border-white/8 bg-white/[0.03]"
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className={`mt-0.5 text-sm ${alerta ? "text-red-200" : ""}`}>{valor ?? "—"}</p>
    </div>
  );
}

export function VerificacionEquipo({
  equipo,
  onActualizado,
}: {
  equipo: VerificacionFila;
  onActualizado?: () => void;
}) {
  const verificar = useServerFn(verificarYGuardarImei);
  const [cargando, setCargando] = useState(false);

  const verificado = !!equipo.verificado_at;
  const luhn = luhnValido(equipo.imei);

  const lanzar = async () => {
    if (cargando) return;
    setCargando(true);
    try {
      const r = await verificar({ data: { imei: equipo.imei, forzar: verificado } });
      if (!r.ok) {
        toast.error("No se pudo verificar", { description: r.mensaje });
        return;
      }
      if (r.guardado === false) {
        toast.warning("Se verificó, pero no pudimos guardarlo en la ficha del equipo.");
        return;
      }
      toast.success("Verificación actualizada", { description: `IMEI ${equipo.imei}` });
      onActualizado?.();
    } catch {
      toast.error("No se pudo verificar", { description: MENSAJE_MOTIVO.sin_respuesta });
    } finally {
      setCargando(false);
    }
  };

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Verificación de IMEI</h3>
        <Button
          size="sm"
          variant={verificado ? "ghost" : "secondary"}
          className="gap-2"
          disabled={cargando || !luhn}
          onClick={() => void lanzar()}
        >
          {cargando ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
          {cargando ? "Verificando…" : verificado ? "Volver a verificar" : "Verificar IMEI"}
        </Button>
      </div>

      {!luhn && (
        <p className="mt-2 text-xs text-amber-300">
          El IMEI guardado no pasa el dígito verificador, así que no se puede verificar.
        </p>
      )}

      {!verificado ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Sin verificar. Consulta el IMEI para saber si tiene iCloud activo, lista negra o bloqueo de
          operador.
        </p>
      ) : (
        <>
          {(equipo.icloud_activo || equipo.lista_negra) && (
            <p className="mt-2 flex items-center gap-2 rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              <ShieldAlert className="size-4 shrink-0" />
              {equipo.icloud_activo && equipo.lista_negra
                ? "iCloud activado y IMEI en lista negra."
                : equipo.icloud_activo
                  ? "iCloud activado: no se puede revender hasta desvincularlo."
                  : "IMEI en lista negra: reportado como perdido o robado."}
            </p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Dato etiqueta="iCloud activo" valor={siNo(equipo.icloud_activo)} alerta={!!equipo.icloud_activo} />
            <Dato etiqueta="Lista negra" valor={siNo(equipo.lista_negra)} alerta={!!equipo.lista_negra} />
            <Dato etiqueta="Bloqueo de operador" valor={siNo(equipo.bloqueo_operador)} />
            <Dato etiqueta="Reemplazado por Apple" valor={siNo(equipo.reemplazado_apple)} />
            <Dato etiqueta="Serie" valor={equipo.serie || "—"} />
            <Dato etiqueta="Segundo IMEI" valor={equipo.imei2 || "—"} />
            <Dato etiqueta="Garantía" valor={equipo.garantia_estado || "—"} />
            <Dato etiqueta="País o región" valor={equipo.pais_compra || "—"} />
            <Dato
              etiqueta="Compra estimada"
              valor={
                equipo.fecha_compra_estimada
                  ? new Date(equipo.fecha_compra_estimada).toLocaleDateString("es-CL", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })
                  : "—"
              }
            />
            <Dato etiqueta="Bloqueo en USA" valor={equipo.bloqueo_usa || "—"} />
          </div>
          <p className="num mt-2 text-xs text-muted-foreground">
            Verificado el {fechaLarga(equipo.verificado_at)}
          </p>
        </>
      )}
    </section>
  );
}

/** Distintivo rojo para la tabla: iCloud activo o lista negra. */
export const tieneAlertaImei = (e: {
  icloud_activo?: boolean | null;
  lista_negra?: boolean | null;
}) => !!e.icloud_activo || !!e.lista_negra;
