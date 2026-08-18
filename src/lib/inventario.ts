import type { AppRol } from "@/lib/nav";

export type EquipoEstado =
  | "POR_REVISAR"
  | "EN_TECNICO"
  | "DISPONIBLE"
  | "RESERVADO"
  | "VENDIDO"
  | "ENTREGADO"
  | "GARANTIA";

export const ESTADOS: EquipoEstado[] = [
  "DISPONIBLE",
  "POR_REVISAR",
  "EN_TECNICO",
  "RESERVADO",
  "GARANTIA",
  "VENDIDO",
  "ENTREGADO",
];

export const ESTADOS_ACTIVOS: EquipoEstado[] = [
  "POR_REVISAR",
  "EN_TECNICO",
  "DISPONIBLE",
  "RESERVADO",
  "GARANTIA",
];

export const ESTADO_ETIQUETA: Record<EquipoEstado, string> = {
  POR_REVISAR: "Por revisar",
  EN_TECNICO: "En técnico",
  DISPONIBLE: "Disponible",
  RESERVADO: "Reservado",
  VENDIDO: "Vendido",
  ENTREGADO: "Entregado",
  GARANTIA: "Garantía",
};

/* Badges de estado */
export const ESTADO_CLASE: Record<EquipoEstado, string> = {
  DISPONIBLE: "bg-emerald-500/15 text-emerald-300 border-emerald-400/25",
  EN_TECNICO: "bg-amber-500/15 text-amber-300 border-amber-400/25",
  POR_REVISAR: "bg-white/8 text-slate-300 border-white/12",
  RESERVADO: "bg-sky-500/15 text-sky-300 border-sky-400/25",
  GARANTIA: "bg-red-500/15 text-red-300 border-red-400/25",
  VENDIDO: "bg-white/5 text-muted-foreground border-white/8",
  ENTREGADO: "bg-white/5 text-muted-foreground border-white/8",
};

export const CATEGORIAS = ["sellado", "openbox", "seminuevo", "reacondicionado"] as const;
export const CATEGORIA_ETIQUETA: Record<(typeof CATEGORIAS)[number], string> = {
  sellado: "Sellado",
  openbox: "Openbox",
  seminuevo: "Seminuevo",
  reacondicionado: "Reacondicionado",
};

export const GB_OPCIONES = [64, 128, 256, 512, 1024] as const;

export const SERVICIOS = [
  { tipo: "bateria", label: "Batería" },
  { tipo: "pantalla", label: "Pantalla" },
  { tipo: "chasis", label: "Chasis/cuerpo" },
  { tipo: "camara", label: "Cámara" },
  { tipo: "parlante", label: "Parlante" },
  { tipo: "faceid", label: "Face ID" },
  { tipo: "puerto_carga", label: "Puerto de carga" },
  { tipo: "limpieza", label: "Limpieza" },
  { tipo: "homologacion", label: "Homologación" },
  { tipo: "otro", label: "Otro" },
] as const;

export type ServicioTipo = (typeof SERVICIOS)[number]["tipo"];

export const SERVICIO_ETIQUETA = SERVICIOS.reduce(
  (acc, s) => ({ ...acc, [s.tipo]: s.label }),
  {} as Record<ServicioTipo, string>,
);

export const ROLES_CON_COSTOS: AppRol[] = ["direccion", "jefe_tienda", "administracion"];
export const ROLES_QUE_INGRESAN: AppRol[] = [
  "direccion",
  "jefe_tienda",
  "administracion",
  "operaciones",
];

export const puedeVerCostos = (rol?: AppRol | null) => !!rol && ROLES_CON_COSTOS.includes(rol);
export const puedeIngresarEquipos = (rol?: AppRol | null) =>
  !!rol && ROLES_QUE_INGRESAN.includes(rol);

export const diasEnStock = (fecha?: string | null) => {
  if (!fecha) return 0;
  const ms = Date.now() - new Date(fecha).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
};

export const fechaLarga = (fecha?: string | null) =>
  fecha
    ? new Date(fecha).toLocaleString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
