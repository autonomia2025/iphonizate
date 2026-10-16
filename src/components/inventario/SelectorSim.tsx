import { SIM_OPCIONES, type TipoSim } from "@/lib/inventario";
import { cn } from "@/lib/utils";

/** Dos botones: SIM física o eSIM. `value` vacío = todavía no se eligió. */
export function SelectorSim({
  value,
  onChange,
  className,
}: {
  value: TipoSim | "";
  onChange: (v: TipoSim) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Tipo de SIM"
      className={cn("grid grid-cols-2 gap-2", className)}
    >
      {SIM_OPCIONES.map((o) => {
        const activo = value === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onChange(o.valor)}
            className={cn(
              "h-9 rounded-md border px-2 text-sm transition-all duration-200",
              activo
                ? "accent-glow border-[var(--accent-store)]/50 bg-[var(--accent-store-soft)] text-foreground"
                : "border-white/12 bg-white/5 text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
