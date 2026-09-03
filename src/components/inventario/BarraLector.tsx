import { AnimatePresence, motion } from "framer-motion";
import { BatteryWarning, Cable, CheckCircle2, Loader2, Lock, ShieldAlert, Usb } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BotonInstalarLector } from "@/components/lector/InstruccionesLector";
import { RESORTE_RAPIDO, SALIDA } from "@/lib/motion";
import {
  COLOR_SIN_IDENTIFICAR,
  ESTADO_LECTOR_ETIQUETA,
  enmascararCuenta,
  nivelCiclos,
  textoCiclos,
  type EstadoLector,
  type Lectura,
} from "@/lib/lector";

type Props = {
  estado: EstadoLector;
  nombreAgente?: string | null;
  tiendaAgente?: string | null;
  detalle?: string | null;
  lectura: Lectura | null;
  onAplicar: () => void;
  aplicada: boolean;
  ultimoLatido?: string | null;
};

const AYUDA: Partial<Record<EstadoLector, string>> = {
  sin_equipo:
    "Conecta el iPhone al Mac lector con cable, desbloquéalo y toca “Confiar” si te lo pide.",
  esperando_confianza: "Desbloquea el iPhone y toca “Confiar en este computador”.",
  error: "Desconecta y vuelve a conectar el cable. Si sigue igual, avisa a la oficina.",
};

/** “hace 5 min”, “hace 2 h”, “hace 3 días”. */
function hace(fecha?: string | null) {
  if (!fecha) return null;
  const min = Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} día${Math.round(h / 24) === 1 ? "" : "s"}`;
}

const COLOR_ESTADO: Record<EstadoLector, string> = {
  sin_contacto: "border-white/10 bg-white/[0.03] text-muted-foreground",
  sin_equipo: "border-sky-400/25 bg-sky-500/10 text-sky-100",
  esperando_confianza: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  leyendo: "border-[var(--accent-store)]/40 bg-[var(--accent-store-soft)] text-foreground",
  listo: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  error_runtime: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  error: "border-red-400/30 bg-red-500/10 text-red-200",
};

function IconoEstado({ estado }: { estado: EstadoLector }) {
  if (estado === "leyendo") return <Loader2 className="size-4 animate-spin" />;
  if (estado === "listo") return <CheckCircle2 className="size-4" />;
  if (estado === "esperando_confianza") return <Lock className="size-4" />;
  if (estado === "sin_equipo") return <Cable className="size-4" />;
  if (estado === "error" || estado === "error_runtime") return <ShieldAlert className="size-4" />;
  return <Usb className="size-4" />;
}


export function BarraLector({
  estado,
  nombreAgente,
  tiendaAgente,
  detalle,
  lectura,
  onAplicar,
  aplicada,
  ultimoLatido,
}: Props) {
  const ciclos = lectura?.bateria_ciclos ?? null;
  const nivel = nivelCiclos(ciclos);
  const icloud = !!lectura?.icloud_bloqueado;
  const desde = hace(lectura?.fecha);
  const ayuda = AYUDA[estado];

  return (
    <div
      className={`rounded-2xl border p-3 text-xs transition-all duration-200 ${COLOR_ESTADO[estado]}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <IconoEstado estado={estado} />
        <span className="font-medium">{ESTADO_LECTOR_ETIQUETA[estado]}</span>
        {nombreAgente && (
          <span className="opacity-70">
            · {nombreAgente}
            {tiendaAgente ? ` (${tiendaAgente})` : ""}
          </span>
        )}
        {detalle && estado !== "listo" && <span className="opacity-70">· {detalle}</span>}

        {lectura && (
          <div className="ml-auto flex items-center gap-2">
            {desde && <span className="opacity-70">leído {desde}</span>}
            {aplicada ? (
              <span className="flex items-center gap-1 opacity-80">
                <CheckCircle2 className="size-3.5" /> datos aplicados
              </span>
            ) : (
              <Button type="button" size="sm" variant="secondary" onClick={onAplicar}>
                Usar esta lectura
              </Button>
            )}
          </div>
        )}
      </div>

      {ayuda && <p className="mt-2 opacity-80">{ayuda}</p>}

      {(estado === "sin_contacto" || estado === "error_runtime") && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 opacity-80">
            {estado === "error_runtime"
              ? "El lector está corriendo pero le faltan las herramientas para leer el iPhone. Vuelve a correr el instalador (no pide contraseña)."
              : nombreAgente
                ? `El Mac lector “${nombreAgente}” no está respondiendo${
                    hace(ultimoLatido) ? ` (último contacto ${hace(ultimoLatido)})` : ""
                  }. Revisa que esté encendido o escribe los datos a mano.`
                : "No hay ningún Mac lector corriendo. Puedes escribir los datos a mano igual."}
          </p>
          <BotonInstalarLector />
        </div>
      )}


      <AnimatePresence initial={false}>
        {lectura && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: SALIDA }}
            transition={RESORTE_RAPIDO}
            className="mt-3 space-y-2"
          >
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
              <Dato etiqueta="IMEI" valor={lectura.imei} mono />
              {lectura.imei2 && <Dato etiqueta="IMEI 2" valor={lectura.imei2} mono />}
              <Dato etiqueta="Modelo" valor={lectura.modelo ?? lectura.product_type} />
              <Dato etiqueta="Capacidad" valor={lectura.gb ? `${lectura.gb} GB` : null} />
              <Dato
                etiqueta="Color"
                valor={lectura.color_comercial ?? (lectura.color_codigo ? COLOR_SIN_IDENTIFICAR : null)}
              />
              <Dato etiqueta="Serie" valor={lectura.serie} mono />
              <Dato etiqueta="iOS" valor={lectura.ios_version} />
              <Dato etiqueta="Región" valor={lectura.region} />
              <Dato etiqueta="Operador" valor={lectura.operador} />
            </div>

            {nivel && nivel !== "ok" && (
              <p
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${
                  nivel === "rojo"
                    ? "bg-red-500/15 text-red-200"
                    : "bg-amber-500/15 text-amber-100"
                }`}
              >
                <BatteryWarning className="size-3.5 shrink-0" />
                {textoCiclos(ciclos)}
              </p>
            )}
            {nivel === "ok" && <p className="opacity-70">{textoCiclos(ciclos)}</p>}

            {icloud && (
              <p className="flex items-center gap-1.5 rounded-lg bg-red-500/15 px-2 py-1.5 text-red-200">
                <Lock className="size-3.5 shrink-0" />
                iCloud bloqueado
                {lectura.icloud_cuenta_enmascarada
                  ? ` · cuenta ${enmascararCuenta(lectura.icloud_cuenta_enmascarada)}`
                  : ""}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  mono,
}: {
  etiqueta: string;
  valor?: string | number | null;
  mono?: boolean;
}) {
  if (valor === null || valor === undefined || valor === "") return null;
  return (
    <p className="flex min-w-0 justify-between gap-2">
      <span className="opacity-60">{etiqueta}</span>
      <span className={`truncate ${mono ? "num" : ""}`}>{valor}</span>
    </p>
  );
}
