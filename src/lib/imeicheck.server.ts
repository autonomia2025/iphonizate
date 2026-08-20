/**
 * Cliente HTTP de imeicheck.net. Solo servidor: la clave nunca sale al navegador.
 *
 * Nota sobre la documentación oficial: el ejemplo en PHP usa http_build_query
 * con Content-Type json, lo que es inconsistente. Acá el cuerpo va con
 * JSON.stringify, que es lo que la API realmente espera.
 */

const BASE = "https://api.imeicheck.net/v1";

export type MotivoFalla = "sin_saldo" | "clave_invalida" | "sin_configuracion" | "api_caida";

export class ErrorImeicheck extends Error {
  motivo: MotivoFalla;
  constructor(motivo: MotivoFalla, mensaje: string) {
    super(mensaje);
    this.motivo = motivo;
  }
}

const clave = () => {
  const valor = process.env["IMEICHECK_API_KEY"];
  if (!valor) {
    throw new ErrorImeicheck(
      "sin_configuracion",
      "Falta la clave de imeicheck en el servidor. Configúrala para poder verificar IMEI.",
    );
  }
  return valor;
};

const mensajeDeRespuesta = (cuerpo: unknown, status: number) => {
  if (cuerpo && typeof cuerpo === "object") {
    const c = cuerpo as Record<string, unknown>;
    const m = c["message"] ?? c["error"] ?? c["errors"];
    if (typeof m === "string") return m;
    if (m) return JSON.stringify(m);
  }
  return `La API respondió con error ${status}`;
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
    throw new ErrorImeicheck(
      "api_caida",
      "No pudimos contactar a imeicheck. Completa los datos a mano y sigue.",
    );
  }

  const texto = await respuesta.text();
  let cuerpo: unknown = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = null;
  }

  if (!respuesta.ok) {
    const mensaje = mensajeDeRespuesta(cuerpo, respuesta.status);
    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new ErrorImeicheck(
        "clave_invalida",
        "La clave de imeicheck no es válida o fue revocada. Hay que actualizarla.",
      );
    }
    if (respuesta.status === 402 || /balance|fund|credit|saldo/i.test(mensaje)) {
      throw new ErrorImeicheck(
        "sin_saldo",
        "Se acabó el saldo de la cuenta imeicheck. Recárgala para seguir verificando.",
      );
    }
    throw new ErrorImeicheck("api_caida", mensaje);
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
