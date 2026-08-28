import { createFileRoute } from "@tanstack/react-router";

import { VERSION_AGENTE } from "@/lib/lector";
import { manifiestoTexto, type Arquitectura } from "@/lib/lector-runtime.server";

export const Route = createFileRoute("/api/public/lector/runtime")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const archParam = url.searchParams.get("arch") ?? "arm64";
        const arch: Arquitectura = archParam === "x86_64" || archParam === "x64" ? "x86_64" : "arm64";
        const mayorMacos = Number(url.searchParams.get("macos") ?? "15") || 15;

        try {
          const texto = await manifiestoTexto({ arch, mayorMacos, version: VERSION_AGENTE });
          return new Response(texto, {
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "cache-control": "no-store",
            },
          });
        } catch (e) {
          return new Response(
            `error ${e instanceof Error ? e.message : "no pude armar el manifiesto"}\n`,
            { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
          );
        }
      },
    },
  },
});
