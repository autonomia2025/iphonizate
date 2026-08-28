/**
 * Lector de equipos por USB — piezas compartidas entre servidor e interfaz.
 * Sin dependencias del navegador ni del servidor: se puede importar en ambos.
 */

export const VERSION_AGENTE = "1.0.0";

export type EstadoLector =
  | "sin_contacto"
  | "sin_equipo"
  | "esperando_confianza"
  | "leyendo"
  | "listo"
  | "error";

export const ESTADO_LECTOR_ETIQUETA: Record<EstadoLector, string> = {
  sin_contacto: "Sin lector conectado",
  sin_equipo: "Esperando iPhone",
  esperando_confianza: "Desbloquea el iPhone y toca Confiar",
  leyendo: "Leyendo el equipo…",
  listo: "Lectura lista",
  error: "El lector tuvo un problema",
};

export const ESTADOS_LECTOR: EstadoLector[] = [
  "sin_contacto",
  "sin_equipo",
  "esperando_confianza",
  "leyendo",
  "listo",
  "error",
];

/** Un agente sin latido reciente se considera desconectado. */
export const LATIDO_VIGENTE_MS = 3 * 60_000;

export const agenteVivo = (ultimoLatido?: string | null) =>
  !!ultimoLatido && Date.now() - new Date(ultimoLatido).getTime() < LATIDO_VIGENTE_MS;

/** Una lectura más vieja que esto no se ofrece para autocompletar. */
export const LECTURA_FRESCA_MS = 10 * 60_000;

export const lecturaFresca = (fecha?: string | null) =>
  !!fecha && Date.now() - new Date(fecha).getTime() < LECTURA_FRESCA_MS;

/* ---------- Batería ---------- */

export const CICLOS_AMBAR = 800;
export const CICLOS_ROJO = 1200;

export type NivelCiclos = "ok" | "ambar" | "rojo";

export const nivelCiclos = (ciclos?: number | null): NivelCiclos | null => {
  if (ciclos == null) return null;
  if (ciclos > CICLOS_ROJO) return "rojo";
  if (ciclos > CICLOS_AMBAR) return "ambar";
  return "ok";
};

export const textoCiclos = (ciclos?: number | null) => {
  const nivel = nivelCiclos(ciclos);
  if (!nivel) return null;
  if (nivel === "rojo") return `${ciclos} ciclos de batería: muy alta, considera cambio de batería`;
  if (nivel === "ambar") return `${ciclos} ciclos de batería: alta, revísala antes de vender`;
  return `${ciclos} ciclos de batería`;
};

/* ---------- Capacidades ---------- */

export const ESCALA_GB = [16, 32, 64, 128, 256, 512, 1024, 2048];

export const gbComerciales = (bytes?: number | null) => {
  if (!bytes) return null;
  const gib = bytes / 1024 ** 3;
  for (const paso of ESCALA_GB) {
    if (gib <= paso * 1.02) return paso;
  }
  return ESCALA_GB[ESCALA_GB.length - 1] ?? null;
};

export const COLOR_SIN_IDENTIFICAR = "Color sin identificar";

/* ---------- Tipos de fila ---------- */

export type Lectura = {
  id: string;
  agente_id: string;
  tienda_id: string;
  udid: string | null;
  imei: string | null;
  imei2: string | null;
  meid: string | null;
  serie: string | null;
  serie_placa: string | null;
  product_type: string | null;
  modelo: string | null;
  model_number: string | null;
  gb: number | null;
  ios_version: string | null;
  region: string | null;
  activado: boolean | null;
  operador: string | null;
  wifi_mac: string | null;
  bluetooth_mac: string | null;
  color_codigo: string | null;
  color_comercial: string | null;
  bateria_ciclos: number | null;
  bateria_capacidad_disenio: number | null;
  icloud_bloqueado: boolean | null;
  icloud_cuenta_enmascarada: string | null;
  fecha: string;
};

export type AgenteLector = {
  id: string;
  nombre: string;
  tienda_id: string;
  version: string | null;
  hostname: string | null;
  estado: string;
  detalle_estado: string | null;
  ultimo_latido: string | null;
  ultima_lectura: string | null;
  activo: boolean;
};

/** Enmascara una cuenta de iCloud por si el agente la entregó completa. */
export const enmascararCuenta = (cuenta?: string | null) => {
  if (!cuenta) return null;
  const [usuario, dominio] = cuenta.split("@");
  if (!dominio || !usuario) return cuenta;
  const visible = usuario.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(2, usuario.length - 2))}@${dominio}`;
};
