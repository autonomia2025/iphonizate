// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// Variables sin prefijo VITE_ (solo servidor): se cargan en process.env para
// que las rutas de servidor puedan leerlas. Nunca se exponen al cliente.
const serverEnv = loadEnv(process.env["NODE_ENV"] ?? "development", process.cwd(), "");
Object.assign(process.env, serverEnv);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // pdf-lib y react-email dependen de tslib (CommonJS): si el bundle del
    // servidor los deja externos, el comprobante falla al generarse.
    ssr: {
      noExternal: ["pdf-lib", "tslib", "@react-email/render", "@react-email/components"],
    },
    optimizeDeps: {
      include: ["pdf-lib", "tslib"],
    },
    resolve: {
      alias: {
        // El paquete publicado de pdf-lib mezcla CommonJS con tslib y en el
        // build de producción rompe con "Cannot destructure property
        // '__extends'". El bundle ESM del propio paquete ya trae tslib dentro.
        "pdf-lib": path.resolve(process.cwd(), "node_modules/pdf-lib/dist/pdf-lib.esm.js"),
      },
    },
  },
});
