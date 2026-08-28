import { createFileRoute } from "@tanstack/react-router";

import { autenticarAgente } from "@/lib/lector.server";

/**
 * Comprueba que una clave de lector sea válida. La usa el instalador antes de
 * escribir config.json, así nunca queda un Mac configurado con una clave mala.
 */
export const Route = createFileRoute("/api/public/lector/verificar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const agente = await autenticarAgente(request);
        if (!agente) {
          return Response.json(
            { ok: false, error: "Clave de lector inválida o revocada" },
            { status: 401, headers: { "cache-control": "no-store" } },
          );
        }
        return Response.json(
          { ok: true, nombre: agente.nombre },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
