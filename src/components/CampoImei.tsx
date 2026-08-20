import { useState, type RefObject } from "react";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { luhnValido } from "@/lib/imeicheck";
import { cn } from "@/lib/utils";

export const AYUDA_IMEI = "Escanea o escribe el IMEI y presiona Enter";

/** Limpia espacios, guiones, puntos y cualquier basura del portapapeles. */
export const limpiarImei = (valor: string) => valor.replace(/[^\d]/g, "").slice(0, 15);

export const imeiValido = (valor: string) => /^\d{15}$/.test(valor);

/** Largo correcto y dígito verificador correcto (Luhn). */
export const imeiRealmenteValido = (valor: string) => luhnValido(valor);


type Props = {
  valor: string;
  onValor: (valor: string) => void;
  onAgregar: (imei: string) => void;
  placeholder?: string;
  ayuda?: string;
  claseFlash?: string;
  etiquetaBoton?: string;
  deshabilitado?: boolean;
  /** Dispara solo al llegar a 15 dígitos (lector de código de barras sin Enter). */
  autoEnviar?: boolean;
  tamano?: "grande" | "normal";
  inputRef?: RefObject<HTMLInputElement | null>;
};

export function CampoImei({
  valor,
  onValor,
  onAgregar,
  placeholder = "IMEI del equipo",
  ayuda = AYUDA_IMEI,
  claseFlash,
  etiquetaBoton = "Agregar",
  deshabilitado,
  autoEnviar,
  tamano = "grande",
  inputRef,
}: Props) {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const largo = valor.length;
  const ok = imeiValido(valor);

  const intentar = () => {
    if (!valor) {
      setMensaje("Escribe o escanea un IMEI antes de agregar.");
      return;
    }
    if (!ok) {
      setMensaje(
        `El IMEI debe tener 15 dígitos: llevas ${largo}. Faltan ${15 - largo}. No lo completamos solos.`,
      );
      return;
    }
    setMensaje(null);
    onAgregar(valor);
  };

  const alto = tamano === "grande" ? "h-14 text-base" : "h-11 text-sm";

  return (
    <div>
      <div className="flex flex-wrap items-stretch gap-2">
        <label className="relative min-w-0 flex-1">
          <ScanLine className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[var(--accent-store)]" />
          <input
            ref={inputRef}
            value={valor}
            inputMode="numeric"
            autoComplete="off"
            disabled={deshabilitado}
            onChange={(e) => {
              const limpio = limpiarImei(e.target.value);
              const perdio = e.target.value.replace(/\s|-/g, "") !== e.target.value;
              if (perdio) setMensaje("Limpiamos espacios y guiones del IMEI pegado.");
              else if (mensaje) setMensaje(null);
              onValor(limpio);
              if (autoEnviar && limpio.length === 15) {
                setMensaje(null);
                onAgregar(limpio);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                intentar();
              }
            }}
            placeholder={placeholder}
            className={cn(
              claseFlash,
              alto,
              "num w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-12 pr-4 tracking-[0.06em] outline-none transition-all duration-200 placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-muted-foreground focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25 disabled:opacity-50",
            )}
          />
        </label>
        <Button
          type="button"
          onClick={intentar}
          disabled={deshabilitado}
          className={cn("shrink-0", tamano === "grande" ? "h-14 px-5" : "h-11 px-4")}
        >
          {etiquetaBoton}
        </Button>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{ayuda}</span>
        <span
          className={cn(
            "num rounded-full border px-2 py-0.5",
            ok && luhn
              ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300"
              : largo > 0
                ? "border-amber-400/25 bg-amber-500/10 text-amber-300"
                : "border-white/10 bg-white/[0.04]",
          )}
        >
          {largo}/15
          {ok ? (luhn ? " · válido" : " · dígito verificador incorrecto") : ""}
        </span>

      </p>
      {mensaje && <p className="mt-1 text-xs text-amber-300">{mensaje}</p>}
    </div>
  );
}
