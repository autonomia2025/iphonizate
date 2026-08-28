import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { autenticarAgente } from "@/lib/lector.server";
import { ESTADOS_LECTOR } from "@/lib/lector";

const esquema = z.object({
  version: z.string().trim().max(40).nullish(),
  hostname: z.string().trim().max(120).nullish(),
  estado: z.string().trim().max(40),
  detalle: z.string().trim().max(300).nullish(),
  udid: z.string().trim().max(120).nullish(),
});

export const Route = createFileRoute("/api/public/lector/estado")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const agente = await autenticarAgente(request);
        if (!agente) return new Response("Clave de lector inválida", { status: 401 });

        let cuerpo: unknown;
        try {
          cuerpo = await request.json();
        } catch {
          return new Response("Cuerpo inválido", { status: 400 });
        }

        const parseado = esquema.safeParse(cuerpo);
        if (!parseado.success) return new Response("Datos inválidos", { status: 400 });
        const d = parseado.data;

        const estado = (ESTADOS_LECTOR as string[]).includes(d.estado) ? d.estado : "error";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("lector_agentes")
          .update({
            estado,
            detalle_estado: d.detalle ?? null,
            udid_actual: d.udid ?? null,
            version: d.version ?? null,
            hostname: d.hostname ?? null,
            ultimo_latido: new Date().toISOString(),
          })
          .eq("id", agente.id);

        if (error) {
          console.error("lector/estado: no se pudo actualizar", error);
          return new Response("No se pudo actualizar el estado", { status: 500 });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
