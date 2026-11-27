/** Tiendas del sistema que tienen tienda Shopify (el id es el mismo de src/lib/stores.ts). */
const LINK = "https://admin.shopify.com/oauth/install_custom_app?no_redirect=true";

/**
 * Links de instalación generados en el Dev Dashboard (Distribution → Custom distribution).
 * Se pueden reemplazar desde Configuración → Shopify si Shopify entrega uno nuevo.
 */
export const TIENDAS_SHOPIFY = [
  {
    id: "iphonizate",
    nombre: "iPhonizate",
    shop: "iphononizate.myshopify.com",
    link: `${LINK}&client_id=ec05d298e686f9a47daa3823cfd6cccc&signature=eyJleHBpcmVzX2F0IjoxNzk2MzQ0MDAwLCJwZXJtYW5lbnRfZG9tYWluIjoiaXBob25vbml6YXRlLm15c2hvcGlmeS5jb20iLCJjbGllbnRfaWQiOiJlYzA1ZDI5OGU2ODZmOWE0N2RhYTM4MjNjZmQ2Y2NjYyIsInB1cnBvc2UiOiJjdXN0b21fYXBwIiwibWVyY2hhbnRfb3JnYW5pemF0aW9uX2lkIjoyMTEzNDgxMDZ9--af164778ede2efb9a54dc79ce7dbb6bbdc2cb631`,
  },
  {
    id: "black-pink-phone",
    nombre: "Black Pink Phone",
    shop: "0mcy8b-1t.myshopify.com",
    link: `${LINK}&client_id=68864dfbd2694bc88d52e7ed0665b1dd&signature=eyJleHBpcmVzX2F0IjoxNzk2MzQ0MDQyLCJwZXJtYW5lbnRfZG9tYWluIjoiMG1jeThiLTF0Lm15c2hvcGlmeS5jb20iLCJjbGllbnRfaWQiOiI2ODg2NGRmYmQyNjk0YmM4OGQ1MmU3ZWQwNjY1YjFkZCIsInB1cnBvc2UiOiJjdXN0b21fYXBwIiwibWVyY2hhbnRfb3JnYW5pemF0aW9uX2lkIjoyNDU3ODM5MTN9--b0b386a95fb789ef9cdf6129cd1b8cdcb05e3f04`,
  },
  {
    id: "riffstore",
    nombre: "Riffstore",
    shop: "v9aj07-ap.myshopify.com",
    link: `${LINK}&client_id=44e69cb4746d3c4ec31e991d94de3651&signature=eyJleHBpcmVzX2F0IjoxNzk2MzQ0MDc1LCJwZXJtYW5lbnRfZG9tYWluIjoidjlhajA3LWFwLm15c2hvcGlmeS5jb20iLCJjbGllbnRfaWQiOiI0NGU2OWNiNDc0NmQzYzRlYzMxZTk5MWQ5NGRlMzY1MSIsInB1cnBvc2UiOiJjdXN0b21fYXBwIiwibWVyY2hhbnRfb3JnYW5pemF0aW9uX2lkIjoxNzczMTcyOTd9--bfc128c794d4ace6a5efe8643c24e6544647ce73`,
  },
] as const;

export type TiendaShopify = (typeof TIENDAS_SHOPIFY)[number]["id"];

export const esTiendaShopify = (t: string): t is TiendaShopify =>
  TIENDAS_SHOPIFY.some((s) => s.id === t);

/**
 * El link que genera Shopify al elegir "Custom distribution". Se acepta solo si apunta a Shopify,
 * para que el botón "Conectar Shopify" no pueda llevar a otra página.
 */
export function linkInstalacionValido(link: string) {
  try {
    const u = new URL(link.trim());
    return (
      u.protocol === "https:" &&
      (u.hostname === "admin.shopify.com" || u.hostname.endsWith(".myshopify.com"))
    );
  } catch {
    return false;
  }
}

/** Fecha en que vence un link de instalación (viene dentro de la firma), o null si no se sabe. */
export function venceLink(link: string | null): Date | null {
  try {
    const firma = link ? new URL(link).searchParams.get("signature") : null;
    const datos = firma?.split("--")[0];
    if (!datos) return null;
    const json = JSON.parse(atob(datos.replace(/-/g, "+").replace(/_/g, "/"))) as {
      expires_at?: number;
    };
    return json.expires_at ? new Date(json.expires_at * 1000) : null;
  } catch {
    return null;
  }
}

export type ConexionShopify = {
  tienda: TiendaShopify;
  nombre: string;
  shop: string;
  link_instalacion: string | null;
  estado: "pendiente" | "conectada" | "desconectada";
  conectada_en: string | null;
  ultima_lectura: string | null;
  ultimo_error: string | null;
  secreto_configurado: boolean;
  variantes: number;
  stock: number;
};
