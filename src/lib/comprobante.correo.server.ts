/**
 * Envío del comprobante al correo del cliente.
 *
 * Queda pendiente hasta que el dominio de envío (iphonizate.app) esté
 * configurado y verificado. Mientras tanto la venta y el PDF funcionan igual:
 * el comprobante queda guardado y descargable desde el sistema.
 */

import type { DatosComprobante } from "@/lib/comprobante.server";

export type ResultadoEnvio = {
  estado: "enviado" | "error" | "suprimido";
  motivo: string | null;
};

export async function enviarComprobante(_args: {
  correo: string;
  numero: string;
  url: string;
  datos: DatosComprobante;
}): Promise<ResultadoEnvio> {
  return {
    estado: "error",
    motivo: "El dominio de correo todavía no está configurado",
  };
}
