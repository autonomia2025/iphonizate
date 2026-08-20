/**
 * Tipos y lectura defensiva de las respuestas de imeicheck.net.
 *
 * Reglas de la API que este módulo asume:
 * - Cuando `status` es "successful", `properties` es un OBJETO.
 * - Cuando `status` es "unsuccessful", `properties` llega como ARRAY VACÍO [].
 *   Por eso nunca se lee `properties` sin revisar antes `status`.
 * - Varias llaves llevan barra (properties["apple/region"]): SIEMPRE se leen con
 *   notación de corchetes, nunca con punto.
 * - Las llaves verificadas vienen del servicio 12 (Sandbox, datos simulados). Live
 *   podría usar otros nombres, así que cada dato acepta varias llaves alternativas.
 * - La API no devuelve capacidad (GB) ni color: esos campos siguen siendo manuales.
 */

export type PropiedadesImei = {
  modelo: string | null;
  deviceName: string | null;
  serial: string | null;
  imei2: string | null;
  meid: string | null;
  imagen: string | null;
  fmiOn: boolean;
  gsmaBlacklisted: boolean;
  simLock: boolean;
  replaced: boolean;
  loaner: boolean;
  demoUnit: boolean;
  warrantyStatus: string | null;
  purchaseCountry: string | null;
  estPurchaseDate: number | null;
  usaBlockStatus: string | null;
};

export type MotivoFallaVerificacion =
  | "sin_resultado"
  | "imei_invalido"
  | "servicio_invalido"
  | "sin_saldo"
  | "clave_invalida"
  | "sin_configuracion"
  | "sin_respuesta"
  | "api_caida";

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
      motivo: MotivoFallaVerificacion;
      mensaje: string;
      status?: string;
    };

/** Mensajes en español por motivo. El detalle técnico queda solo en el servidor. */
export const MENSAJE_MOTIVO: Record<MotivoFallaVerificacion, string> = {
  sin_resultado: "No se encontró información para este IMEI.",
  imei_invalido: "Ese IMEI no es válido. Revisa que los 15 dígitos estén correctos.",
  servicio_invalido: "El servicio configurado no existe. Revisa la configuración.",
  sin_saldo: "Sin saldo para verificar. Recarga en imeicheck.net.",
  clave_invalida: "La clave de la API no es válida.",
  sin_configuracion: "Falta configurar la clave de la API de verificación.",
  sin_respuesta: "No se pudo conectar con el servicio de verificación.",
  api_caida: "No se pudo conectar con el servicio de verificación.",
};

export const TITULO_MOTIVO: Record<MotivoFallaVerificacion, string> = {
  sin_resultado: "Sin información",
  imei_invalido: "IMEI inválido",
  servicio_invalido: "Servicio mal configurado",
  sin_saldo: "Sin saldo",
  clave_invalida: "Clave inválida",
  sin_configuracion: "Falta configuración",
  sin_respuesta: "Sin conexión",
  api_caida: "Sin conexión",
};

const texto = (valor: unknown): string | null => {
  if (typeof valor === "string") {
    const limpio = valor.trim();
    return limpio === "" || /^unknown$/i.test(limpio) ? null : limpio;
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
  if (typeof valor === "string" && /^\d+(\.\d+)?$/.test(valor.trim()))
    return Math.trunc(Number(valor.trim()));
  return null;
};

/**
 * Llaves aceptadas por dato, en orden de preferencia. Al pasar a Live basta con
 * sumar el nombre nuevo acá para que el mapeo siga funcionando.
 */
export const LLAVES: Record<keyof PropiedadesImei, string[]> = {
  modelo: ["modelDesc", "apple/modelName", "model", "modelName", "deviceName"],
  deviceName: ["deviceName", "apple/deviceName"],
  serial: ["serial", "serialNumber", "apple/serial"],
  imei2: ["imei2", "secondImei"],
  meid: ["meid"],
  imagen: ["image", "imageUrl"],
  fmiOn: ["fmiOn", "findMyIphone", "icloudLock", "fmi"],
  gsmaBlacklisted: ["gsmaBlacklisted", "blacklisted", "blacklistStatus"],
  simLock: ["simLock", "simLockStatus", "carrierLock"],
  replaced: ["replaced", "replacedDevice"],
  loaner: ["loaner", "loanerDevice"],
  demoUnit: ["demoUnit", "demo"],
  warrantyStatus: ["warrantyStatus", "warranty", "coverage", "apple/warrantyStatus"],
  purchaseCountry: ["apple/region", "purchaseCountry", "country", "region"],
  estPurchaseDate: ["estPurchaseDate", "purchaseDate", "apple/estPurchaseDate"],
  usaBlockStatus: ["usaBlockStatus", "usaBlock", "blockStatus"],
};

const primera = (p: Record<string, unknown>, llaves: string[]): unknown => {
  for (const llave of llaves) {
    if (llave in p && p[llave] !== null && p[llave] !== "") return p[llave];
  }
  return undefined;
};

/** Llaves que llegaron y el mapeo no contempla. Se registran en el servidor. */
export function llavesDesconocidas(bruto: unknown): string[] {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return [];
  const conocidas = new Set(Object.values(LLAVES).flat().concat(["imei", "deviceId", "id"]));
  return Object.keys(bruto as Record<string, unknown>).filter((k) => !conocidas.has(k));
}

/** Solo acepta objetos: si `properties` viene como array vacío devuelve null. */
export function leerPropiedades(bruto: unknown): PropiedadesImei | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const p = bruto as Record<string, unknown>;
  return {
    modelo: texto(primera(p, LLAVES.modelo)),
    deviceName: texto(primera(p, LLAVES.deviceName)),
    serial: texto(primera(p, LLAVES.serial)),
    imei2: texto(primera(p, LLAVES.imei2)),
    meid: texto(primera(p, LLAVES.meid)),
    imagen: texto(primera(p, LLAVES.imagen)),
    fmiOn: bool(primera(p, LLAVES.fmiOn)),
    gsmaBlacklisted: bool(primera(p, LLAVES.gsmaBlacklisted)),
    simLock: bool(primera(p, LLAVES.simLock)),
    replaced: bool(primera(p, LLAVES.replaced)),
    loaner: bool(primera(p, LLAVES.loaner)),
    demoUnit: bool(primera(p, LLAVES.demoUnit)),
    warrantyStatus: texto(primera(p, LLAVES.warrantyStatus)),
    purchaseCountry: texto(primera(p, LLAVES.purchaseCountry)),
    estPurchaseDate: entero(primera(p, LLAVES.estPurchaseDate)),
    usaBlockStatus: texto(primera(p, LLAVES.usaBlockStatus)),
  };
}

/** Campos normalizados que la RPC guarda en la fila del equipo. */
export type DatosVerificacionEquipo = {
  serie: string | null;
  imei2: string | null;
  icloud_activo: boolean;
  lista_negra: boolean;
  bloqueo_operador: boolean;
  reemplazado_apple: boolean;
  garantia_estado: string | null;
  pais_compra: string | null;
  /** Timestamp Unix en segundos; la RPC lo convierte a timestamptz. */
  fecha_compra_estimada: number | null;
  bloqueo_usa: string | null;
};

export const datosParaEquipo = (p: PropiedadesImei): DatosVerificacionEquipo => ({
  serie: p.serial,
  imei2: p.imei2,
  icloud_activo: p.fmiOn,
  lista_negra: p.gsmaBlacklisted,
  bloqueo_operador: p.simLock,
  reemplazado_apple: p.replaced,
  garantia_estado: p.warrantyStatus,
  pais_compra: p.purchaseCountry,
  fecha_compra_estimada: p.estPurchaseDate,
  bloqueo_usa: p.usaBlockStatus,
});

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
  if (p.loaner) {
    alertas.push({
      nivel: "info",
      bloqueante: false,
      clave: "loaner",
      titulo: "Equipo de préstamo",
      texto: "Apple lo registra como equipo de préstamo.",
    });
  }
  if (p.demoUnit) {
    alertas.push({
      nivel: "info",
      bloqueante: false,
      clave: "demoUnit",
      titulo: "Unidad de demostración",
      texto: "Equipo de exhibición: no fue vendido al público.",
    });
  }
  return alertas;
}

/**
 * Dígito verificador del IMEI (algoritmo de Luhn). Un IMEI que no pasa Luhn no
 * existe, así que no vale la pena gastar una consulta en él.
 */
export function luhnValido(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let suma = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(imei[14 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
  }
  return suma % 10 === 0;
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
