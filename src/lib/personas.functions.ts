import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = ["direccion", "jefe_tienda", "administracion", "operaciones", "vendedor"] as const;

/**
 * Agrega una persona: crea su cuenta de acceso (correo interno + PIN) y su ficha en usuarios,
 * con el PIN marcado para cambiarlo al primer ingreso. Si la ficha falla, la cuenta se borra.
 * Dirección agrega a cualquiera; Administración no puede crear Dirección ni Administración.
 */
export const crearPersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      nombre: string;
      usuario: string;
      rol: string;
      tiendaId: string | null;
      pin: string;
    }) =>
      z
        .object({
          nombre: z.string().trim().min(2).max(80),
          usuario: z
            .string()
            .trim()
            .toLowerCase()
            .regex(
              /^[a-z0-9._]{3,30}$/,
              "El usuario debe tener entre 3 y 30 letras o números, sin espacios ni tildes",
            ),
          rol: z.enum(ROLES),
          tiendaId: z.string().uuid().nullable(),
          pin: z.string().regex(/^\d{6}$/, "El PIN debe tener 6 dígitos"),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: yo } = await context.supabase
      .from("usuarios")
      .select("id, rol")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!yo || (yo.rol !== "direccion" && yo.rol !== "administracion")) {
      return {
        ok: false as const,
        mensaje: "Solo Dirección y Administración pueden agregar personas.",
      };
    }
    if (
      yo.rol === "administracion" &&
      (data.rol === "direccion" || data.rol === "administracion")
    ) {
      return {
        ok: false as const,
        mensaje: "Administración no puede crear usuarios de Dirección ni de Administración.",
      };
    }
    if ((data.rol === "vendedor" || data.rol === "jefe_tienda") && !data.tiendaId) {
      return { ok: false as const, mensaje: "Elige la tienda de la persona." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existe } = await supabaseAdmin
      .from("usuarios")
      .select("id")
      .eq("usuario", data.usuario)
      .maybeSingle();
    if (existe)
      return { ok: false as const, mensaje: `Ya existe el usuario ${data.usuario}. Elige otro.` };

    const { data: cuenta, error: errCuenta } = await supabaseAdmin.auth.admin.createUser({
      email: `${data.usuario}@riffstore.local`,
      password: data.pin,
      email_confirm: true,
    });
    if (errCuenta || !cuenta.user) {
      const texto = errCuenta?.message ?? "";
      console.error("crearPersona: cuenta", texto);
      return {
        ok: false as const,
        mensaje: /already|registered|exists/i.test(texto)
          ? `Ya existe una cuenta para ${data.usuario}. Elige otro usuario.`
          : /weak|pwned|leaked|password/i.test(texto)
            ? "Ese PIN es demasiado común: prueba otra combinación."
            : "No se pudo crear la cuenta. Inténtalo otra vez.",
      };
    }

    const { error: errFicha } = await supabaseAdmin.rpc("usuario_crear", {
      _nombre: data.nombre,
      _usuario: data.usuario,
      _rol: data.rol,
      // La función acepta null (personas sin tienda fija); los tipos generados no lo reflejan.
      _tienda: data.tiendaId as string,
      _pin: data.pin,
      _auth: cuenta.user.id,
    });
    if (errFicha) {
      console.error("crearPersona: ficha", errFicha);
      await supabaseAdmin.auth.admin.deleteUser(cuenta.user.id);
      return { ok: false as const, mensaje: errFicha.message.replace(/^.*?:\s*/, "") };
    }

    await supabaseAdmin.from("auditoria").insert({
      accion: "persona_creada",
      detalle: {
        nombre: data.nombre,
        usuario: data.usuario,
        rol: data.rol,
        tienda_id: data.tiendaId,
      },
      usuario_id: yo.id,
      rol: yo.rol,
      tienda_id: data.tiendaId,
    });

    return { ok: true as const, usuario: data.usuario };
  });
