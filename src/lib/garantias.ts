import type { AppRol } from "@/lib/nav";

export const SLA_HORAS = 72;

export const ROLES_GARANTIAS: AppRol[] = [
  "direccion",
  "jefe_tienda",
  "administracion",
  "operaciones",
  "vendedor",
];

export const puedeOperarGarantias = (rol?: AppRol | null) =>
  !!rol && ROLES_GARANTIAS.includes(rol);

export type NivelSla = "normal" | "ambar" | "rojo" | "vencida";

export const nivelSla = (horas: number): NivelSla => {
  if (horas > SLA_HORAS) return "vencida";
  if (horas >= 48) return "rojo";
  if (horas >= 24) return "ambar";
  return "normal";
};

export const SLA_CLASE: Record<NivelSla, string> = {
  normal: "bg-white/[0.06] text-slate-300 border-white/12",
  ambar: "bg-amber-500/15 text-amber-300 border-amber-400/25",
  rojo: "bg-red-500/15 text-red-300 border-red-400/25",
  vencida: "bg-red-500/30 text-red-200 border-red-400/50",
};

export const SLA_BORDE: Record<NivelSla, string> = {
  normal: "border-white/[0.08]",
  ambar: "border-amber-400/30",
  rojo: "border-red-400/35",
  vencida: "border-red-400/60",
};

export const textoSla = (horas: number) => {
  const nivel = nivelSla(horas);
  if (nivel === "vencida") return `Vencida hace ${horas - SLA_HORAS}h`;
  return `${horas}h de ${SLA_HORAS}h`;
};

export const horasTranscurridas = (fecha?: string | null) =>
  fecha ? Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 3_600_000)) : 0;

export const equipoTexto = (modelo?: string | null, gb?: number | null) =>
  [modelo ?? "Equipo", gb ? `${gb}GB` : null].filter(Boolean).join(" ");
