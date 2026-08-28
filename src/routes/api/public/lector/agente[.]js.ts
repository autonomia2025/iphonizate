import { createFileRoute } from "@tanstack/react-router";

import fuenteAgente from "../../../../../agente/lector.js?raw";

export const Route = createFileRoute("/api/public/lector/agente.js")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(fuenteAgente, {
          headers: {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
