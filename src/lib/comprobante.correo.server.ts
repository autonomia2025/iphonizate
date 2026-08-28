/**
 * Envío del comprobante al correo del cliente mediante el correo administrado
 * del sistema (dominio de envío notify.iphonizate.app).
 */

import { EmailAPIError } from "@lovable.dev/email-js";

import type { DatosComprobante } from "@/lib/comprobante.server";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

export type ResultadoEnvio = {
  estado: "enviado" | "error" | "suprimido";
  motivo: string | null;
};

export async function enviarComprobante(args: {
  correo: string;
  numero: string;
  url: string;
  datos: DatosComprobante;
}): Promise<ResultadoEnvio> {
  const { correo, numero, url, datos } = args;

  try {
    const r = await sendTemplateEmail("comprobante-venta", correo, {
      idempotencyKey: `comprobante-venta-${datos.ventaId}`,
      templateData: {
        numero,
        fecha: datos.fecha,
        tienda: datos.tienda.nombre,
        cliente: datos.cliente?.nombre ?? null,
        total: datos.total,
        recargo: datos.recargo,
        lineas: datos.lineas.map((l) => ({
          descripcion: l.descripcion,
          detalle: l.detalle,
          monto: l.monto,
        })),
        pagos: datos.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
        url,
      },
    });

    if (!r.sent) {
      return {
        estado: "suprimido",
        motivo: "El correo del cliente está bloqueado por rebote o baja voluntaria",
      };
    }
    return { estado: "enviado", motivo: null };
  } catch (error) {
    if (error instanceof EmailAPIError) {
      if (error.code === "domain_not_verified") {
        return {
          estado: "error",
          motivo: "El dominio de correo todavía se está verificando",
        };
      }
      if (error.code === "emails_disabled") {
        return { estado: "error", motivo: "El envío de correos está desactivado" };
      }
      if (error.status === 429) {
        return {
          estado: "error",
          motivo: "Demasiados correos seguidos, intenta en unos minutos",
        };
      }
      return { estado: "error", motivo: error.message };
    }
    return {
      estado: "error",
      motivo: error instanceof Error ? error.message : "No se pudo enviar el correo",
    };
  }
}
