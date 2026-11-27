import { createFileRoute } from "@tanstack/react-router";

/**
 * App URL de las apps de Shopify. Shopify trae aquí al dueño de la tienda después de instalar
 * (y cada vez que abre la app desde su Shopify). Se valida la firma y se pide la autorización
 * para obtener el acceso a la tienda.
 */
export const Route = createFileRoute("/api/public/shopify/instalar")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const s = await import("@/lib/shopify.server");
        const url = new URL(request.url);
        const shop = url.searchParams.get("shop");
        const tienda = s.tiendaPorShop(shop);
        if (!tienda || !shop) return new Response("Tienda no reconocida", { status: 400 });

        const secret = s.secreto(tienda);
        if (!secret) {
          console.error(`shopify/instalar: falta el secreto de ${tienda}`);
          return new Response("La conexión todavía no está configurada en el sistema", {
            status: 503,
          });
        }
        if (!s.hmacValido(url, secret) || !s.timestampReciente(url)) {
          return new Response("Firma de Shopify no válida", { status: 401 });
        }

        const state = s.nuevoState();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("shopify_conexiones")
          .update({
            oauth_state: state,
            oauth_state_expira: new Date(Date.now() + 15 * 60_000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("tienda", tienda);
        if (error) {
          console.error("shopify/instalar", error);
          return new Response("No se pudo iniciar la conexión", { status: 500 });
        }

        const autorizar = new URL(`https://${shop}/admin/oauth/authorize`);
        autorizar.searchParams.set("client_id", s.clientId(tienda));
        autorizar.searchParams.set("scope", s.SCOPES);
        autorizar.searchParams.set("redirect_uri", s.URL_CALLBACK());
        autorizar.searchParams.set("state", state);
        return Response.redirect(autorizar.toString(), 302);
      },
    },
  },
});
