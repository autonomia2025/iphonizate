import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";

import fuenteAgente from "../../../../../agente/lector.js?raw";
import { VERSION_AGENTE } from "@/lib/lector";

export const Route = createFileRoute("/api/public/lector/version")({
  server: {
    handlers: {
      GET: async () => {
        const sha256 = createHash("sha256").update(fuenteAgente, "utf8").digest("hex");
        return Response.json(
          { version: VERSION_AGENTE, sha256, archivo: "agente.js" },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
