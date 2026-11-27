/** Tiendas del sistema que tienen tienda Shopify (el id es el mismo de src/lib/stores.ts). */
export const TIENDAS_SHOPIFY = [
  { id: "iphonizate", nombre: "iPhonizate", shop: "iphononizate.myshopify.com" },
  { id: "black-pink-phone", nombre: "Black Pink Phone", shop: "0mcy8b-1t.myshopify.com" },
  { id: "riffstore", nombre: "Riffstore", shop: "v9aj07-ap.myshopify.com" },
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
