import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Verifica un IMEI: usa la caché de 30 días o consulta a imeicheck. */
export const verificarImei = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { imei: string; forzar?: boolean }) => {
    const imei = String(data?.imei ?? "").replace(/\D/g, "");
    if (!/^\d{15}$/.test(imei)) throw new Error("El IMEI debe tener 15 dígitos");
    return { imei, forzar: !!data?.forzar };
  })
  .handler(async ({ data, context }) => {
    const { ejecutarVerificacion } = await import("@/lib/imeicheck.logica.server");
    return ejecutarVerificacion(context.supabase, data.imei, data.forzar);
  });

/** Verifica un IMEI y guarda los datos en la fila del equipo (si ya existe). */
export const verificarYGuardarImei = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { imei: string; forzar?: boolean; riesgoAceptado?: boolean }) => {
    const imei = String(data?.imei ?? "").replace(/\D/g, "");
    if (!/^\d{15}$/.test(imei)) throw new Error("El IMEI debe tener 15 dígitos");
    return { imei, forzar: !!data?.forzar, riesgoAceptado: !!data?.riesgoAceptado };
  })
  .handler(async ({ data, context }) => {
    const { verificarYGuardar } = await import("@/lib/imeicheck.logica.server");
    return verificarYGuardar(context.supabase, data.imei, data.forzar, data.riesgoAceptado);
  });


/** GET /account — saldo de la cuenta imeicheck. */
export const saldoImeicheck = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { obtenerSaldo } = await import("@/lib/imeicheck.logica.server");
    return obtenerSaldo();
  });

/** GET /services — servicios disponibles para poblar el selector de configuración. */
export const serviciosImeicheck = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { obtenerServicios } = await import("@/lib/imeicheck.logica.server");
    return obtenerServicios();
  });
