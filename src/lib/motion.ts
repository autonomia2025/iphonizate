/**
 * Curvas y tiempos del sistema de movimiento.
 * Spring physics, nunca easing lineal. Nada supera los 500ms.
 */
import type { Transition, Variants } from "framer-motion";

/** Micro-interacciones: 150ms percibidos. */
export const RESORTE_RAPIDO: Transition = { type: "spring", stiffness: 700, damping: 34, mass: 0.5 };

/** Transiciones de elemento: 250ms percibidos. */
export const RESORTE: Transition = { type: "spring", stiffness: 420, damping: 32, mass: 0.7 };

/** Entradas de página: 400ms percibidos. */
export const RESORTE_SUAVE: Transition = { type: "spring", stiffness: 240, damping: 28, mass: 0.9 };

/** Salidas: siempre más rápidas (180ms). */
export const SALIDA: Transition = { duration: 0.18, ease: [0.32, 0.72, 0, 1] };

export const varsPagina: Variants = {
  oculto: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { ...RESORTE_SUAVE, staggerChildren: 0.04, delayChildren: 0.02 },
  },
};

export const varsHijo: Variants = {
  oculto: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: RESORTE },
};

/** Cascada de tarjetas: entrada con leve escalado. */
export const varsTarjeta: Variants = {
  oculto: { opacity: 0, y: 14, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: RESORTE },
};

/** Filas de tabla: stagger muy corto (20ms) para que no se sienta lento. */
export const varsListaFilas: Variants = {
  oculto: {},
  visible: { transition: { staggerChildren: 0.02 } },
};

export const varsFila: Variants = {
  oculto: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: RESORTE_RAPIDO },
  salida: { opacity: 0, transition: SALIDA },
};
