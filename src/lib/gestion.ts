import type { AppRol } from "@/lib/nav";

/* ---------- Precios ---------- */

export const ROLES_PRECIOS: AppRol[] = ["direccion", "jefe_tienda", "administracion"];
export const puedeEditarPrecios = (rol?: AppRol | null) => !!rol && ROLES_PRECIOS.includes(rol);

export const DIAS_PRECIO_VIEJO = 30;

export const diasDesde = (fecha?: string | null) => {
  if (!fecha) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000));
};

export const precioDesactualizado = (updatedAt?: string | null) =>
  diasDesde(updatedAt) > DIAS_PRECIO_VIEJO;

/* ---------- Tareas ---------- */

export const URGENCIAS = [
  { valor: "alta", label: "Alta", punto: "bg-red-400", texto: "text-red-300" },
  { valor: "media", label: "Media", punto: "bg-amber-400", texto: "text-amber-300" },
  { valor: "baja", label: "Baja", punto: "bg-emerald-400", texto: "text-emerald-300" },
] as const;

export type Urgencia = (typeof URGENCIAS)[number]["valor"];

export const URGENCIA_INFO = URGENCIAS.reduce(
  (acc, u) => ({ ...acc, [u.valor]: u }),
  {} as Record<Urgencia, (typeof URGENCIAS)[number]>,
);

export const ORDEN_URGENCIA: Record<string, number> = { alta: 0, media: 1, baja: 2 };

export const TIPOS_TAREA = [
  "Operación",
  "Cobranza",
  "Técnico",
  "Compras",
  "Marketing",
  "Otro",
] as const;

export const ROLES_QUE_CIERRAN_TAREAS: AppRol[] = ["direccion", "jefe_tienda", "administracion"];

export const puedeCerrarTarea = (
  tarea: { asignado_id: string | null; created_by: string | null },
  usuarioId?: string | null,
  rol?: AppRol | null,
) =>
  (!!rol && ROLES_QUE_CIERRAN_TAREAS.includes(rol)) ||
  (!!usuarioId && (tarea.asignado_id === usuarioId || tarea.created_by === usuarioId));

/* ---------- Metas ---------- */

export const ROLES_METAS: AppRol[] = ["direccion", "jefe_tienda"];
export const puedeEditarMetas = (rol?: AppRol | null) => !!rol && ROLES_METAS.includes(rol);

export const periodoActual = () => new Date().toISOString().slice(0, 7);

export const periodoTexto = (periodo: string) => {
  const [a, m] = periodo.split("-").map(Number);
  if (!a || !m) return periodo;
  const t = new Date(a, m - 1, 1).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const rangoPeriodo = (periodo: string) => {
  const [a, m] = periodo.split("-").map(Number);
  const inicio = new Date(a!, m! - 1, 1);
  const fin = new Date(a!, m!, 1);
  return { inicio, fin };
};

/** Días que quedan del período (0 el último día). */
export const diasParaCierre = (periodo: string) => {
  const { fin } = rangoPeriodo(periodo);
  return Math.max(0, Math.ceil((fin.getTime() - Date.now()) / 86_400_000) - 1);
};

export const CIERRE_CERCA = 7;

export const pct = (avance: number, objetivo: number) =>
  objetivo > 0 ? Math.min(100, Math.round((avance / objetivo) * 100)) : 0;
