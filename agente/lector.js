#!/usr/bin/env node
/**
 * Lector de equipos iPhonizate OS — agente para Mac.
 *
 * Node puro, sin dependencias. Se apoya en libimobiledevice:
 *   idevice_id, ideviceinfo, idevicepair, idevicediagnostics
 *
 * Configuración: ~/Library/Application Support/iphonizate-lector/config.json
 *   { "base_url": "https://...", "clave": "lec_...", "nombre": "Mac mostrador" }
 */

"use strict";

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

const VERSION = "1.0.0";

const DIR_CONFIG = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "iphonizate-lector",
);
const RUTA_CONFIG = path.join(DIR_CONFIG, "config.json");
const RUTA_AGENTE = path.join(DIR_CONFIG, "lector.js");

const INTERVALO_SONDEO = 2000;
const INTERVALO_LATIDO = 60_000;
const INTERVALO_ACTUALIZACION = 24 * 60 * 60 * 1000;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function leerConfig() {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(RUTA_CONFIG, "utf8"));
  } catch {
    return { error: `No pude leer ${RUTA_CONFIG} (falta o está dañado).` };
  }
  const base = typeof cfg.base_url === "string" ? cfg.base_url.trim() : "";
  const clave = typeof cfg.clave === "string" ? cfg.clave.trim() : "";
  if (!base) return { error: "La configuración no tiene la dirección del servidor." };
  if (!clave) return { error: "La configuración no tiene la clave de la tienda." };
  if (!clave.startsWith("lec_")) return { error: "La clave de la tienda no tiene el formato esperado." };
  return { cfg: { base_url: base, clave, nombre: cfg.nombre || os.hostname() } };
}

let config = null;
{
  const r = leerConfig();
  if (r.cfg) {
    config = r.cfg;
  } else {
    // No morimos: launchd nos reiniciaría en bucle. Esperamos a que el
    // instalador deje una configuración válida y seguimos.
    log(`${r.error} Corre de nuevo el instalador del lector.`);
    const espera = setInterval(() => {
      const otra = leerConfig();
      if (otra.cfg) {
        log("configuración corregida, reiniciando el lector");
        clearInterval(espera);
        process.exit(0); // launchd lo levanta de nuevo, ya con config válida
      }
    }, 15_000);
  }
}

function correr(cmd, args, timeout = 25_000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        salida: String(stdout || ""),
        error: String((stderr || "") + (err ? ` ${err.message}` : "")).trim(),
      });
    });
  });
}

/* ---------- Parseo de la salida de ideviceinfo ---------- */

function parsearClaveValor(texto) {
  const datos = {};
  for (const linea of texto.split("\n")) {
    const limpia = linea.trim();
    const i = limpia.indexOf(": ");
    if (i <= 0) continue;
    const clave = limpia.slice(0, i).trim();
    const valor = limpia.slice(i + 2).trim();
    if (clave && valor && datos[clave] === undefined) datos[clave] = valor;
  }
  return datos;
}

function primero(datos, claves) {
  for (const c of claves) {
    if (datos[c] !== undefined && datos[c] !== "") return datos[c];
  }
  return null;
}

const ESCALA_GB = [16, 32, 64, 128, 256, 512, 1024, 2048];

function gbComerciales(bytes) {
  const n = Number(bytes);
  if (!n || Number.isNaN(n)) return null;
  const gib = n / 1024 ** 3;
  let mejor = ESCALA_GB[0];
  for (const paso of ESCALA_GB) {
    if (gib <= paso * 1.02) {
      mejor = paso;
      break;
    }
    mejor = paso;
  }
  return mejor;
}

function ciclosDesdeGasGauge(texto) {
  const m = texto.match(/CycleCount<\/key>\s*<integer>(\d+)</i) || texto.match(/CycleCount[^0-9]{0,40}(\d+)/i);
  return m ? Number(m[1]) : null;
}

function capacidadDisenio(texto) {
  const m =
    texto.match(/DesignCapacity<\/key>\s*<integer>(\d+)</i) ||
    texto.match(/DesignCapacity[^0-9]{0,40}(\d+)/i);
  return m ? Number(m[1]) : null;
}

function estadoIcloud(texto, datos) {
  const bloqueadoPorClave = primero(datos, [
    "fm-activation-locked",
    "FMiPActivationLocked",
    "ActivationLockStatus",
  ]);
  const marcado = /fm-activation-locked[^\n]*(?:true|1|yes)/i.test(texto);
  const bloqueado =
    marcado ||
    (bloqueadoPorClave ? /^(true|1|yes)$/i.test(String(bloqueadoPorClave)) : false);

  let cuenta = primero(datos, [
    "fm-account-masked",
    "fmm-account-masked",
    "FMiPAccountMasked",
  ]);
  if (cuenta) {
    try {
      const decodificada = Buffer.from(cuenta, "base64").toString("utf8");
      if (/[a-z0-9]/i.test(decodificada)) cuenta = decodificada.replace(/\u0000/g, "").trim();
    } catch {
      /* si no es base64 se deja tal cual */
    }
  }
  return { bloqueado: bloqueado || !!cuenta, cuenta: cuenta || null };
}

/* ---------- Comunicación con el servidor ---------- */

async function enviar(ruta, cuerpo) {
  const url = `${config.base_url.replace(/\/+$/, "")}/api/public/lector/${ruta}`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lector-clave": config.clave,
      },
      body: JSON.stringify(cuerpo),
    });
    const texto = await r.text();
    if (!r.ok) {
      log(`servidor respondió ${r.status}: ${texto.slice(0, 200)}`);
      return null;
    }
    try {
      return JSON.parse(texto);
    } catch {
      return null;
    }
  } catch (e) {
    log("sin conexión con el servidor:", e.message);
    return null;
  }
}

let estadoActual = "sin_equipo";
let detalleActual = null;
let udidActual = null;

function fijarEstado(estado, detalle) {
  estadoActual = estado;
  detalleActual = detalle || null;
  log(`estado: ${estado}${detalle ? ` (${detalle})` : ""}`);
  void latido();
}

async function latido() {
  await enviar("estado", {
    version: VERSION,
    hostname: os.hostname(),
    estado: estadoActual,
    detalle: detalleActual,
    udid: udidActual,
  });
}

/* ---------- Lectura de un equipo ---------- */

async function leerEquipo(udid) {
  fijarEstado("leyendo", null);

  const emparejar = await correr("idevicepair", ["-u", udid, "validate"]);
  if (!emparejar.ok) {
    const intento = await correr("idevicepair", ["-u", udid, "pair"], 40_000);
    if (!intento.ok) {
      fijarEstado("esperando_confianza", "Desbloquea el iPhone y toca Confiar");
      return false;
    }
  }

  const general = await correr("ideviceinfo", ["-u", udid]);
  if (!general.ok) {
    fijarEstado("esperando_confianza", "Desbloquea el iPhone y toca Confiar");
    return false;
  }
  const disco = await correr("ideviceinfo", ["-u", udid, "-q", "com.apple.disk_usage"]);
  const bateria = await correr("idevicediagnostics", ["-u", udid, "diagnostics", "GasGauge"]);

  const datos = parsearClaveValor(general.salida);
  const datosDisco = parsearClaveValor(disco.salida);
  const icloud = estadoIcloud(general.salida, datos);
  const activacion = primero(datos, ["ActivationState"]);

  const lectura = {
    udid,
    imei: primero(datos, ["InternationalMobileEquipmentIdentity", "IMEI"]),
    imei2: primero(datos, ["InternationalMobileEquipmentIdentity2", "IMEI2"]),
    meid: primero(datos, ["MobileEquipmentIdentifier", "MEID"]),
    serie: primero(datos, ["SerialNumber"]),
    serie_placa: primero(datos, ["MLBSerialNumber"]),
    product_type: primero(datos, ["ProductType"]),
    model_number: primero(datos, ["ModelNumber", "RegionalModelNumber"]),
    gb: gbComerciales(primero(datosDisco, ["TotalDiskCapacity", "TotalDataCapacity"])),
    ios_version: primero(datos, ["ProductVersion"]),
    region: primero(datos, ["RegionInfo"]),
    activado: activacion ? /activated/i.test(activacion) : null,
    operador: primero(datos, [
      "CarrierBundleName",
      "CarrierName",
      "BasebandCarrier",
      "kCarrierName",
    ]),
    wifi_mac: primero(datos, ["WiFiAddress"]),
    bluetooth_mac: primero(datos, ["BluetoothAddress"]),
    color_codigo: primero(datos, ["DeviceColor", "DeviceEnclosureColor"]),
    bateria_ciclos: ciclosDesdeGasGauge(bateria.salida),
    bateria_capacidad_disenio: capacidadDisenio(bateria.salida),
    icloud_bloqueado: icloud.bloqueado,
    icloud_cuenta_enmascarada: icloud.cuenta,
    crudo: {
      version_agente: VERSION,
      ideviceinfo: general.salida,
      disk_usage: disco.salida,
      gas_gauge: bateria.salida,
    },
  };

  if (!lectura.imei) {
    fijarEstado("error", "El equipo no entregó el IMEI");
    return false;
  }

  const r = await enviar("lectura", lectura);
  if (!r) {
    fijarEstado("error", "No pudimos enviar la lectura");
    return false;
  }
  fijarEstado("listo", `${lectura.imei}`);
  return true;
}

/* ---------- Autoactualización con verificación SHA-256 ---------- */

async function revisarActualizacion() {
  const url = `${config.base_url.replace(/\/+$/, "")}/api/public/lector/version`;
  try {
    const r = await fetch(url);
    if (!r.ok) return;
    const info = await r.json();
    if (!info.version || info.version === VERSION) return;
    log(`hay una versión nueva: ${info.version}`);

    const descarga = await fetch(
      `${config.base_url.replace(/\/+$/, "")}/api/public/lector/agente.js`,
    );
    if (!descarga.ok) return;
    const cuerpo = Buffer.from(await descarga.arrayBuffer());
    const suma = crypto.createHash("sha256").update(cuerpo).digest("hex");
    if (suma !== info.sha256) {
      log("¡El archivo descargado no coincide con el checksum! No se instala nada.");
      return;
    }
    fs.writeFileSync(RUTA_AGENTE, cuerpo);
    log("actualización instalada, reiniciando");
    process.exit(0); // launchd lo vuelve a levantar con la versión nueva
  } catch (e) {
    log("no pude revisar actualizaciones:", e.message);
  }
}

/* ---------- Bucle principal ---------- */

async function ciclo() {
  const lista = await correr("idevice_id", ["-l"], 8000);
  const udids = lista.salida
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (udids.length === 0) {
    if (udidActual !== null || estadoActual === "listo") {
      udidActual = null;
      fijarEstado("sin_equipo", null);
    }
    return;
  }

  const udid = udids[0];
  if (udid === udidActual) return;
  udidActual = udid;
  await leerEquipo(udid);
}

log(`lector iPhonizate OS v${VERSION} · ${os.hostname()}`);
void latido();
void revisarActualizacion();

let corriendo = false;
setInterval(() => {
  if (corriendo) return;
  corriendo = true;
  ciclo()
    .catch((e) => log("error en el ciclo:", e.message))
    .finally(() => {
      corriendo = false;
    });
}, INTERVALO_SONDEO);

setInterval(() => void latido(), INTERVALO_LATIDO);
setInterval(() => void revisarActualizacion(), INTERVALO_ACTUALIZACION);
