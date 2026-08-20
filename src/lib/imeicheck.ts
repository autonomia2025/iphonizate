/**
 * Tipos y lectura defensiva de las respuestas de imeicheck.net.
 *
 * Reglas de la API que este módulo asume:
 * - Cuando `status` es "successful", `properties` es un OBJETO.
 * - Cuando `status` es "unsuccessful", `properties` llega como ARRAY VACÍO [].
 *   Por eso nunca se lee `properties` sin revisar antes `status`.
 * - La llave del modelo tiene barra: properties["apple/modelName"].
 * - La API no devuelve capacidad (GB) ni color: esos campos siguen siendo manuales.
 */

export type PropiedadesImei = {
  modelo: string | null;
  deviceName: string | null;
  serial: string | null;
  imei2: string | null;
  fmiOn: boolean;
  gsmaBlacklisted: boolean;
  simLock: boolean;
  replaced: boolean;
  warrantyStatus: string | null;
  purchaseCountry: string | null;
  estPurchaseDate: number | null;
  usaBlockStatus: string | null;
};

export type ResultadoVerificacion =
  | {
      ok: true;
      status: "successful";
      propiedades: PropiedadesImei;
      /** "cache" cuando se reusó una verificación de menos de 30 días. */
      origen: "api" | "cache";
      fecha: string;
      serviceId: number;
      costo: number;
    }
  | {
      ok: false;
      /** La API respondió pero no pudo verificar el IMEI. */
      motivo: "sin_resultado" | "sin_saldo" | "clave_invalida" | "sin_configuracion" | "api_caida";
      mensaje: string;
      status?: string;
    };

const texto = (valor: unknown): string | null => {
  if (typeof valor === "string") {
    const limpio = valor.trim();
    return limpio === "" ? null : limpio;
  }
  if (typeof valor === "number") return String(valor);
  return null;
};

const bool = (valor: unknown): boolean => {
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "string") return /^(true|yes|on|1)$/i.test(valor.trim());
  if (typeof valor === "number") return valor === 1;
  return false;
};

const entero = (valor: unknown): number | null => {
  if (typeof valor === "number" && Number.isFinite(valor)) return Math.trunc(valor);
  if (typeof valor === "string" && /^\d+$/.test(valor.trim())) return Number(valor.trim());
  return null;
};

/** Solo acepta objetos: si `properties` viene como array vacío devuelve null. */
export function leerPropiedades(bruto: unknown): PropiedadesImei | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const p = bruto as Record<string, unknown>;
  return {
    modelo: texto(p["apple/modelName"]) ?? texto(p["modelName"]),
    deviceName: texto(p["deviceName"]),
    serial: texto(p["serial"]),
    imei2: texto(p["imei2"]),
    fmiOn: bool(p["fmiOn"]),
    gsmaBlacklisted: bool(p["gsmaBlacklisted"]),
    simLock: bool(p["simLock"]),
    replaced: bool(p["replaced"]),
    warrantyStatus: texto(p["warrantyStatus"]),
    purchaseCountry: texto(p["purchaseCountry"]),
    estPurchaseDate: entero(p["estPurchaseDate"]),
    usaBlockStatus: texto(p["usaBlockStatus"]),
  };
}

export type Alerta = {
  nivel: "rojo" | "ambar" | "info";
  /** Riesgo que obliga a confirmar explícitamente antes de ingresar el equipo. */
  bloqueante: boolean;
  clave: string;
  titulo: string;
  texto: string;
};

export function alertasDeVerificacion(p: PropiedadesImei): Alerta[] {
  const alertas: Alerta[] = [];
  if (p.fmiOn) {
    alertas.push({
      nivel: "rojo",
      bloqueante: true,
      clave: "fmiOn",
      titulo: "iCloud activado",
      texto:
        "Este equipo tiene iCloud activado. No se puede revender hasta que el dueño anterior lo desvincule.",
    });
  }
  if (p.gsmaBlacklisted) {
    alertas.push({
      nivel: "rojo",
      bloqueante: true,
      clave: "gsmaBlacklisted",
      titulo: "IMEI en lista negra",
      texto: "IMEI reportado como perdido o robado. No funcionará en las redes.",
    });
  }
  if (p.simLock) {
    alertas.push({
      nivel: "ambar",
      bloqueante: false,
      clave: "simLock",
      titulo: "Bloqueado por operador",
      texto: "Bloqueado por operador.",
    });
  }
  if (p.replaced) {
    alertas.push({
      nivel: "info",
      bloqueante: false,
      clave: "replaced",
      titulo: "Equipo reemplazado",
      texto: "Equipo reemplazado por Apple.",
    });
  }
  return alertas;
}

export const fechaCompra = (timestamp: number | null) =>
  timestamp
    ? new Date(timestamp * 1000).toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : null;

export const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });

/** Formato del saldo de la cuenta imeicheck, que viene en dólares. */
export const formatoUSD = (monto: number) =>
  `US$${monto.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const SALDO_BAJO = 5;
