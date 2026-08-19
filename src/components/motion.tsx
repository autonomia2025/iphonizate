import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  animate,
} from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  RESORTE,
  RESORTE_RAPIDO,
  SALIDA,
  varsHijo,
  varsPagina,
  varsTarjeta,
} from "@/lib/motion";

/* ---------------------------------------------------------------- Páginas */

/** Entrada de sección: fade + desplazamiento corto, hijos con stagger de 40ms. */
export function TransicionPagina({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={varsPagina} initial="oculto" animate="visible" className={className}>
      {children}
    </motion.div>
  );
}

/** Hijo de una TransicionPagina o Cascada. */
export function Aparece({
  children,
  className,
  tarjeta = false,
  ...rest
}: { children: ReactNode; className?: string; tarjeta?: boolean } & Omit<
  ComponentProps<typeof motion.div>,
  "children" | "className"
>) {
  return (
    <motion.div variants={tarjeta ? varsTarjeta : varsHijo} className={className} {...rest}>
      {children}
    </motion.div>
  );
}

/** Cascada independiente (para listas de alertas, tarjetas, chips). */
export function Cascada({
  children,
  className,
  paso = 0.04,
}: {
  children: ReactNode;
  className?: string;
  paso?: number;
}) {
  return (
    <motion.div
      initial="oculto"
      animate="visible"
      variants={{ oculto: {}, visible: { transition: { staggerChildren: paso } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------- Tarjetas */

/** Tarjeta de vidrio que se eleva al pasar el mouse, con glow del acento. */
export function TarjetaViva({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & Omit<
  ComponentProps<typeof motion.div>,
  "children" | "className"
>) {
  return (
    <motion.div
      variants={varsTarjeta}
      whileHover={{
        y: -4,
        boxShadow:
          "0 34px 70px -30px rgba(0,0,0,0.85), 0 0 30px -12px color-mix(in oklab, var(--accent-store) 55%, transparent)",
      }}
      transition={RESORTE}
      className={cn("glass", className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------- Cifras */

/** Cifra con count-up desde cero al cargar. */
export function Cifra({
  valor,
  formato,
  className,
  degradada = false,
}: {
  valor: number;
  formato: (n: number) => string;
  className?: string;
  degradada?: boolean;
}) {
  const reducido = useReducedMotion();
  const [texto, setTexto] = useState(() => formato(reducido ? valor : 0));
  const previo = useRef(0);

  useEffect(() => {
    if (reducido) {
      setTexto(formato(valor));
      previo.current = valor;
      return;
    }
    const controls = animate(previo.current, valor, {
      duration: 0.5,
      ease: [0.32, 0.72, 0, 1],
      onUpdate: (v) => setTexto(formato(Math.round(v))),
    });
    previo.current = valor;
    return () => controls.stop();
  }, [valor, reducido, formato]);

  return <span className={cn("num", degradada && "cifra-degradada", className)}>{texto}</span>;
}

/* ---------------------------------------------------------------- Progreso */

/** Barra de progreso que se llena desde cero. */
export function BarraProgreso({
  valor,
  className,
  color,
}: {
  valor: number;
  className?: string;
  color?: string;
}) {
  const reducido = useReducedMotion();
  return (
    <div
      className={cn(
        "h-3 w-full overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.04]",
        className,
      )}
    >
      <motion.div
        className="h-full rounded-full"
        initial={{ width: reducido ? `${valor}%` : 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, valor))}%` }}
        transition={{ type: "spring", stiffness: 90, damping: 20 }}
        style={{
          background: `linear-gradient(90deg, color-mix(in oklab, ${
            color ?? "var(--accent-store)"
          } 55%, transparent), ${color ?? "var(--accent-store)"})`,
          boxShadow: `0 0 20px -6px ${color ?? "var(--accent-store)"}`,
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- Botones */

/**
 * Botón que no cambia de tamaño: el texto se contrae y aparece un indicador
 * inline; al guardar con éxito hace morph a un check con spring.
 */
export function BotonAccion({
  cargando = false,
  exito = false,
  children,
  className,
  ...rest
}: {
  cargando?: boolean;
  exito?: boolean;
  children: ReactNode;
} & ComponentProps<"button">) {
  const estado = exito ? "exito" : cargando ? "cargando" : "normal";
  return (
    <button
      {...rest}
      disabled={rest.disabled || cargando}
      className={cn("relative overflow-hidden", className)}
    >
      <AnimatePresence initial={false} mode="wait">
        {estado === "normal" && (
          <motion.span
            key="normal"
            className="flex items-center justify-center gap-2"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92, transition: SALIDA }}
            transition={RESORTE_RAPIDO}
          >
            {children}
          </motion.span>
        )}
        {estado === "cargando" && (
          <motion.span
            key="cargando"
            className="flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8, transition: SALIDA }}
            transition={RESORTE_RAPIDO}
          >
            <Loader2 className="size-4 animate-spin" />
          </motion.span>
        )}
        {estado === "exito" && (
          <motion.span
            key="exito"
            className="flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.5, rotate: -12 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.6, transition: SALIDA }}
            transition={{ type: "spring", stiffness: 600, damping: 18 }}
          >
            <Check className="size-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

/* ---------------------------------------------------------------- Chips */

/** Chip de filtro o servicio: escalado corto y color llenando desde el centro. */
export function Chip({
  activo,
  children,
  className,
  color,
  ...rest
}: { activo: boolean; children: ReactNode; color?: string } & ComponentProps<"button">) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.03 }}
      transition={RESORTE_RAPIDO}
      className={cn(
        "relative overflow-hidden rounded-full border px-3 py-1.5 text-[12px] transition-colors",
        activo
          ? "border-transparent text-background"
          : "border-white/[0.1] text-muted-foreground hover:text-foreground",
        className,
      )}
      {...(rest as ComponentProps<typeof motion.button>)}
    >
      <AnimatePresence initial={false}>
        {activo && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ background: color ?? "var(--accent-store)" }}
            initial={{ scale: 0, opacity: 0.4 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0, transition: SALIDA }}
            transition={RESORTE_RAPIDO}
          />
        )}
      </AnimatePresence>
      <span className="relative">{children}</span>
    </motion.button>
  );
}

/* ---------------------------------------------------------------- Skeletons */

export function SkeletonTarjetasMetrica({ n = 4 }: { n?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="glass p-5">
          <div className="shimmer h-3 w-24" />
          <div className="shimmer mt-4 h-7 w-32" />
          <div className="shimmer mt-4 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonFilas({ filas = 6, columnas = 5 }: { filas?: number; columnas?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3">
          {Array.from({ length: columnas }).map((__, j) => (
            <div
              key={j}
              className="shimmer h-3.5"
              style={{ width: j === 0 ? "22%" : `${Math.max(8, 60 / columnas)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonTarjetas({ n = 3, alto = 9 }: { n?: number; alto?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="glass p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="shimmer h-3.5 w-28" />
            <div className="shimmer h-5 w-16 rounded-full" />
          </div>
          <div className="shimmer mt-4 w-full" style={{ height: `${alto * 4}px` }} />
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Vacíos */

/** Estado vacío con icono en loop lento y mensaje con personalidad. */
export function EstadoVacio({
  icono: Icono,
  titulo,
  mensaje,
  accion,
  className,
}: {
  icono: React.ComponentType<{ className?: string }>;
  titulo: string;
  mensaje?: string;
  accion?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <motion.span
        className="grid size-16 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.04]"
        animate={{ y: [0, -6, 0], rotate: [0, 2.5, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ color: "var(--accent-store)" }}
      >
        <Icono className="size-7" />
      </motion.span>
      <p className="font-display text-[15px] font-semibold">{titulo}</p>
      {mensaje && <p className="max-w-sm text-[13px] text-muted-foreground">{mensaje}</p>}
      {accion && <div className="mt-1">{accion}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Utilidades */

/** Aplica un shake corto cuando `error` cambia a true. */
export function useShake(error: boolean) {
  const [clase, setClase] = useState("");
  useEffect(() => {
    if (!error) return;
    setClase("shake");
    const t = setTimeout(() => setClase(""), 340);
    return () => clearTimeout(t);
  }, [error]);
  return clase;
}

/** Glow del acento que sigue al cursor dentro del contenedor. */
export function useGlowCursor() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 30 });
  const sy = useSpring(y, { stiffness: 260, damping: 30 });
  const fondo = useTransform(
    [sx, sy],
    ([px, py]: number[]) =>
      `radial-gradient(180px circle at ${px}px ${py}px, color-mix(in oklab, var(--accent-store) 16%, transparent), transparent 70%)`,
  );
  return { x, y, fondo };
}

export { AnimatePresence, motion };
