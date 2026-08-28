import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


export const crearAgenteLector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { nombre: string; tiendaId: string }) =>
    z
      .object({ nombre: z.string().trim().min(2).max(80), tiendaId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: yo } = await context.supabase
      .from("usuarios")
      .select("id, rol")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!yo || yo.rol !== "direccion") {
      return { ok: false as const, mensaje: "Solo Dirección puede registrar un Mac lector." };
    }

    const { generarClave, hashClave } = await import("@/lib/lector.server");
    const clave = generarClave();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: fila, error } = await supabaseAdmin
      .from("lector_agentes")
      .insert({
        nombre: data.nombre.trim(),
        tienda_id: data.tiendaId,
        clave_hash: hashClave(clave),
        created_by: yo.id,
      })
      .select("id, nombre")
      .single();

    if (error) {
      console.error("crearAgenteLector", error);
      return { ok: false as const, mensaje: "No pudimos registrar el Mac. Inténtalo otra vez." };
    }

    /* La clave se muestra una sola vez: no se guarda en claro en ninguna parte */
    return { ok: true as const, id: fila.id, nombre: fila.nombre, clave };
  });

export const regenerarClaveLector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: yo } = await context.supabase
      .from("usuarios")
      .select("id, rol")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!yo || yo.rol !== "direccion") {
      return { ok: false as const, mensaje: "Solo Dirección puede cambiar la clave de un Mac." };
    }

    const { generarClave, hashClave } = await import("@/lib/lector.server");
    const clave = generarClave();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("lector_agentes")
      .update({ clave_hash: hashClave(clave), activo: true })
      .eq("id", data.id);

    if (error) {
      console.error("regenerarClaveLector", error);
      return { ok: false as const, mensaje: "No pudimos generar la clave nueva." };
    }
    return { ok: true as const, clave };
  });

export const revocarAgenteLector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: yo } = await context.supabase
      .from("usuarios")
      .select("id, rol")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!yo || yo.rol !== "direccion") {
      return { ok: false as const, mensaje: "Solo Dirección puede revocar un Mac." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("lector_agentes")
      .update({ activo: false })
      .eq("id", data.id);

    if (error) {
      console.error("revocarAgenteLector", error);
      return { ok: false as const, mensaje: "No pudimos revocar el Mac." };
    }
    return { ok: true as const };
  });
