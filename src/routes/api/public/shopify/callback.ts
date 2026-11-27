import { createFileRoute } from "@tanstack/react-router";

/**
 * Retorno de la autorización de Shopify: valida firma y state, cambia el código por el acceso,
 * lo guarda, hace una primera lectura del stock y vuelve a Configuración.
 */
export const Route = createFileRoute("/api/public/shopify/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const s = await import("@/lib/shopify.server");
        const url = new URL(request.url);
        const shop = url.searchParams.get("shop");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const tienda = s.tiendaPorShop(shop);
        if (!tienda || !shop || !code || !state) {
          return new Response("Respuesta de Shopify incompleta", { status: 400 });
        }

        const secret = s.secreto(tienda);
        if (!secret) return new Response("La conexión no está configurada", { status: 503 });
        if (!s.hmacValido(url, secret) || !s.timestampReciente(url)) {
          return new Response("Firma de Shopify no válida", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: c } = await supabaseAdmin
          .from("shopify_conexiones")
          .select("oauth_state, oauth_state_expira")
          .eq("tienda", tienda)
          .single();
        const vigente =
          c?.oauth_state &&
          c.oauth_state_expira &&
          new Date(c.oauth_state_expira).getTime() > Date.now() &&
          s.mismoState(c.oauth_state, state);
        if (!vigente) {
          return new Response("La conexión expiró. Vuelve a abrir el link de instalación.", {
            status: 400,
          });
        }

        const volver = new URL(s.URL_CONFIGURACION());
        volver.searchParams.set("shopify", tienda);
        try {
          const tokens = await s.canjearCodigo(tienda, shop, code);
          const ahora = new Date().toISOString();
          const { error } = await supabaseAdmin
            .from("shopify_conexiones")
            .update({
              ...tokens,
              estado: "conectada",
              conectada_en: ahora,
              oauth_state: null,
              oauth_state_expira: null,
              ultimo_error: null,
              updated_at: ahora,
            })
            .eq("tienda", tienda);
          if (error) throw new Error(error.message);
        } catch (e) {
          console.error("shopify/callback", e);
          volver.searchParams.set("resultado", "error");
          return Response.redirect(volver.toString(), 302);
        }

        /* Primera lectura: si falla (por ejemplo, por la lista de IP), queda el error en el panel */
        try {
          await s.leerTienda(tienda);
        } catch (e) {
          console.error("shopify/callback: primera lectura", e);
        }

        volver.searchParams.set("resultado", "conectada");
        return Response.redirect(volver.toString(), 302);
      },
    },
  },
});
