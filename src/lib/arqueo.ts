import type { AppRol } from "@/lib/nav";

/* Arqueo de bodega: conteo físico de los disponibles de Oficina Central. */

export const ROLES_ARQUEO: AppRol[] = ["direccion", "administracion"];
export const puedeArquear = (rol?: AppRol | null) => !!rol && ROLES_ARQUEO.includes(rol);

export type EstadoArqueo = "abierto" | "pausado" | "terminado" | "cancelado";

export const ESTADO_ARQUEO_ETIQUETA: Record<EstadoArqueo, string> = {
  abierto: "En curso",
  pausado: "En pausa",
  terminado: "Terminado",
  cancelado: "Cancelado",
};

export const ESTADO_ARQUEO_CLASE: Record<EstadoArqueo, string> = {
  abierto: "bg-emerald-500/15 text-emerald-300 border-emerald-400/25",
  pausado: "bg-amber-500/15 text-amber-300 border-amber-400/25",
  terminado: "bg-white/5 text-muted-foreground border-white/8",
  cancelado: "bg-red-500/15 text-red-300 border-red-400/25",
};

export type ResultadoEscaneo =
  | {
      resultado: "ok";
      equipo_id: string;
      imei: string;
      modelo: string;
      gb: number | null;
      color: string | null;
    }
  | {
      resultado: "ya_escaneado";
      imei: string;
      modelo: string;
      por: string | null;
      fecha: string;
      mismo_arqueo: boolean;
    }
  | {
      resultado: "pendiente";
      equipo_id: string;
      imei: string;
      modelo: string;
      gb: number | null;
      color: string | null;
      desde: string | null;
    }
  | {
      resultado: "no_en_lista";
      motivo: "no_existe" | "fuera";
      imei: string;
      modelo?: string;
      estado?: string;
      tienda?: string | null;
    };

export type ResumenCierre = {
  esperados: number;
  escaneados: number;
  contados_en_otro: number;
  salieron: number;
  faltantes: number;
  otros_abiertos: number;
};

export const textoEquipo = (e: {
  modelo?: string | null;
  gb?: number | null;
  color?: string | null;
}) => [e.modelo ?? "Equipo", e.gb ? `${e.gb} GB` : null, e.color].filter(Boolean).join(" · ");

export const horaCorta = (fecha?: string | null) =>
  fecha ? new Date(fecha).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "";
