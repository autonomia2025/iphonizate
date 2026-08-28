import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Genera el comprobante PDF de una venta, lo guarda en el sistema y (si hay
 * correo) se lo manda al cliente. Solo lo puede pedir quien ve esa venta.
 */
export const emitirComprobante = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ventaId: string; correo?: string | null }) => {
    if (!input?.ventaId) throw new Error("Falta la venta");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: visible, error } = await context.supabase
      .from("ventas")
      .select("id")
      .eq("id", data.ventaId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!visible) throw new Error("No tienes acceso a esta venta");

    const { generarYGuardar } = await import("@/lib/comprobante.server");
    const { numero, url, datos } = await generarYGuardar(data.ventaId);

    const correo = (data.correo ?? datos.cliente?.correo ?? "").trim();
    let envio: "enviado" | "sin_correo" | "error" | "suprimido" = "sin_correo";
    let motivo: string | null = null;

    if (correo) {
      const { enviarComprobante } = await import("@/lib/comprobante.correo.server");
      const r = await enviarComprobante({ correo, numero, url, datos });
      envio = r.estado;
      motivo = r.motivo;

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("ventas")
        .update({
          comprobante_email: correo,
          comprobante_email_estado: envio,
          comprobante_email_at: new Date().toISOString(),
        })
        .eq("id", data.ventaId);
    }

    return { numero, url, correo: correo || null, envio, motivo };
  });

/** Enlace de descarga fresco para una venta que ya tiene comprobante. */
export const enlaceComprobante = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ventaId: string }) => {
    if (!input?.ventaId) throw new Error("Falta la venta");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: venta, error } = await context.supabase
      .from("ventas")
      .select("id, comprobante_ruta")
      .eq("id", data.ventaId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!venta) throw new Error("No tienes acceso a esta venta");

    if (!venta.comprobante_ruta) {
      const { generarYGuardar } = await import("@/lib/comprobante.server");
      const { url } = await generarYGuardar(data.ventaId);
      return { url };
    }
    const { enlaceFirmado } = await import("@/lib/comprobante.server");
    return { url: await enlaceFirmado(venta.comprobante_ruta) };
  });
