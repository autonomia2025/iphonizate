/**
 * Cliente HTTP de imeicheck.net. Solo servidor: la clave nunca sale al navegador.
 *
 * Nota sobre la documentación oficial: el ejemplo en PHP usa http_build_query
 * con Content-Type json, lo que es inconsistente. Acá el cuerpo va con
 * JSON.stringify, que es lo que la API realmente espera.
 */

const BASE = "https://api.imeicheck.net/v1";

import { MENSAJE_MOTIVO, type MotivoFallaVerificacion } from "@/lib/imeicheck";

export type MotivoFalla = MotivoFallaVerificacion;

export class ErrorImeicheck extends Error {
  motivo: MotivoFalla;
  constructor(motivo: MotivoFalla, mensaje?: string) {
    super(mensaje ?? MENSAJE_MOTIVO[motivo]);
    this.motivo = motivo;
  }
}

const clave = () => {
  const valor = process.env["IMEICHECK_API_KEY"];
  if (!valor) {
    throw new ErrorImeicheck("sin_configuracion");
  }
  return valor;
};

/** Texto crudo del error, SOLO para los registros del servidor. */
const detalleTecnico = (cuerpo: unknown, status: number) => {
  let texto = "";
  try {
    texto = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  } catch {
    texto = String(cuerpo);
  }
  return `HTTP ${status} ${texto}`;
};

/** Clasifica el error de validación que devuelve la API (400/422 con "errors"). */
const motivoDeValidacion = (cuerpo: unknown): MotivoFalla | null => {
  if (!cuerpo || typeof cuerpo !== "object") return null;
  const c = cuerpo as Record<string, unknown>;
  const bolsa = JSON.stringify(c["errors"] ?? c["error"] ?? c["message"] ?? c).toLowerCase();
  if (/deviceid|imei/.test(bolsa)) return "imei_invalido";
  if (/serviceid|service/.test(bolsa)) return "servicio_invalido";
  if (/balance|fund|credit|saldo/.test(bolsa)) return "sin_saldo";
  return null;
};

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${clave()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    if (e instanceof ErrorImeicheck) throw e;
    console.error("[imeicheck] sin respuesta", ruta, e);
    throw new ErrorImeicheck("sin_respuesta");
  }

  const texto = await respuesta.text();
  let cuerpo: unknown = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = texto || null;
  }

  if (!respuesta.ok) {
    /* El detalle crudo queda solo acá; al usuario le llega el mensaje en español. */
    console.error("[imeicheck] error", ruta, detalleTecnico(cuerpo, respuesta.status));

    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new ErrorImeicheck("clave_invalida");
    }
    if (respuesta.status === 402) throw new ErrorImeicheck("sin_saldo");
    if (respuesta.status === 400 || respuesta.status === 422) {
      throw new ErrorImeicheck(motivoDeValidacion(cuerpo) ?? "imei_invalido");
    }
    if (respuesta.status >= 500) throw new ErrorImeicheck("sin_respuesta");
    throw new ErrorImeicheck(motivoDeValidacion(cuerpo) ?? "api_caida");
  }

  return (cuerpo ?? {}) as T;
}


export type RespuestaCheck = {
  id?: string;
  status?: string;
  properties?: unknown;
  amount?: number | string;
  price?: number | string;
  [k: string]: unknown;
};

/** POST /checks — verifica un IMEI con el serviceId configurado. */
export const consultarImei = (serviceId: number, imei: string) =>
  pedir<RespuestaCheck>("/checks", {
    method: "POST",
    body: JSON.stringify({ serviceId, deviceId: imei }),
  });

export type CuentaImeicheck = { balance?: number | string; [k: string]: unknown };

/** GET /account — saldo de la cuenta. */
export const consultarCuenta = () => pedir<CuentaImeicheck>("/account");

export type ServicioImeicheck = {
  id?: number | string;
  title?: string;
  name?: string;
  price?: number | string;
  [k: string]: unknown;
};

/** GET /services — servicios disponibles con sus IDs y precios. */
export const consultarServicios = () => pedir<ServicioImeicheck[] | { data?: ServicioImeicheck[] }>("/services");

/**
 * POST /orders — verificación por lote (varios deviceIds en una sola llamada).
 * Queda preparado para la importación de Excel; todavía no se usa desde la interfaz.
 */
export const crearOrdenLote = (serviceId: number, deviceIds: string[]) =>
  pedir<Record<string, unknown>>("/orders", {
    method: "POST",
    body: JSON.stringify({ serviceId, deviceIds }),
  });

export const numero = (valor: unknown): number => {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor === "string") {
    const n = Number(valor.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};
