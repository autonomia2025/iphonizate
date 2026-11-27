/**
 * Conexión con las tiendas Shopify. Solo corre en el servidor: aquí se usan los Client secret
 * (variables SHOPIFY_SECRET_*) y los tokens de acceso, que nunca llegan al navegador.
 *
 * Cada tienda tiene su propia app en el Dev Dashboard (org AutonomIA), con distribución
 * personalizada a su tienda. La configuración de esas apps vive en el repo iphonizate-shopify.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { TIENDAS_SHOPIFY, type TiendaShopify } from "@/lib/shopify";

export const API_VERSION = "2026-10";
export const SCOPES =
  "read_products,read_inventory,write_inventory,read_locations,read_orders,read_customers";

const APP_URL = () =>
  (process.env["SHOPIFY_APP_URL"] ?? "https://iphonizate.app").replace(/\/$/, "");
export const URL_CALLBACK = () => `${APP_URL()}/api/public/shopify/callback`;
export const URL_CONFIGURACION = () => `${APP_URL()}/configuracion`;

type ConfigTienda = { clientId: string; secretEnv: string };

/* client_id de cada app (son públicos: viajan en la URL de autorización) */
const APPS: Record<TiendaShopify, ConfigTienda> = {
  iphonizate: {
    clientId: "ec05d298e686f9a47daa3823cfd6cccc",
    secretEnv: "SHOPIFY_SECRET_IPHONIZATE",
  },
  "black-pink-phone": {
    clientId: "68864dfbd2694bc88d52e7ed0665b1dd",
    secretEnv: "SHOPIFY_SECRET_BLACK_PINK_PHONE",
  },
  riffstore: {
    clientId: "44e69cb4746d3c4ec31e991d94de3651",
    secretEnv: "SHOPIFY_SECRET_RIFFSTORE",
  },
};

export const clientId = (t: TiendaShopify) => APPS[t].clientId;
export const secreto = (t: TiendaShopify) => process.env[APPS[t].secretEnv]?.trim() || null;

const SHOP_VALIDO = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/** La tienda del sistema que corresponde a un dominio myshopify, o null si no es una de las nuestras. */
export function tiendaPorShop(shop: string | null): TiendaShopify | null {
  if (!shop || !SHOP_VALIDO.test(shop)) return null;
  return TIENDAS_SHOPIFY.find((t) => t.shop === shop)?.id ?? null;
}

const igual = (a: string, b: string) => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

/**
 * Verifica la firma hmac que Shopify agrega a las URLs de instalación y de retorno.
 * Se aceptan las dos formas de armar el mensaje (valores tal cual y codificados como URL),
 * porque Shopify codifica los valores que traen caracteres especiales (como "host").
 */
export function hmacValido(url: URL, secret: string): boolean {
  const hmac = url.searchParams.get("hmac");
  if (!hmac || !/^[0-9a-f]{64}$/i.test(hmac)) return false;
  const pares = [...url.searchParams.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const crudo = pares.map(([k, v]) => `${k}=${v}`).join("&");
  const codificado = new URLSearchParams(pares).toString();
  const firma = (m: string) => createHmac("sha256", secret).update(m).digest("hex");
  return igual(firma(crudo), hmac.toLowerCase()) || igual(firma(codificado), hmac.toLowerCase());
}

/** El timestamp de Shopify no puede tener más de un día (evita reusar links viejos). */
export function timestampReciente(url: URL) {
  const ts = Number(url.searchParams.get("timestamp"));
  return Number.isFinite(ts) && Math.abs(Date.now() / 1000 - ts) < 24 * 3600;
}

export const nuevoState = () => randomBytes(24).toString("hex");
export const mismoState = igual;

type RespuestaToken = {
  access_token: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
};

const enSegundos = (s: number | undefined) =>
  s ? new Date(Date.now() + s * 1000).toISOString() : null;

const filaToken = (r: RespuestaToken) => ({
  access_token: r.access_token,
  access_expira: enSegundos(r.expires_in),
  refresh_token: r.refresh_token ?? null,
  refresh_expira: enSegundos(r.refresh_token_expires_in),
  ...(r.scope ? { scopes: r.scope } : {}),
});

async function pedirToken(shop: string, cuerpo: Record<string, string | number>) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new ErrorShopify(
      res.status,
      `Shopify no entregó el acceso (${res.status}) ${texto.slice(0, 200)}`,
    );
  }
  return (await res.json()) as RespuestaToken;
}

export class ErrorShopify extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Cambia el código de la instalación por un token sin vencimiento largo (expiring=1, con refresh). */
export async function canjearCodigo(tienda: TiendaShopify, shop: string, code: string) {
  const secret = secreto(tienda);
  if (!secret) throw new Error(`Falta el secreto ${APPS[tienda].secretEnv}`);
  const r = await pedirToken(shop, {
    client_id: clientId(tienda),
    client_secret: secret,
    code,
    expiring: 1,
  });
  return filaToken(r);
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function marcar(tienda: TiendaShopify, cambios: Record<string, unknown>) {
  const db = await admin();
  await db
    .from("shopify_conexiones")
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq("tienda", tienda);
}

const MENSAJE_RECONECTAR = "Shopify ya no reconoce el acceso: hay que volver a conectar la tienda.";

/** Token vigente: si el de acceso venció (dura 1 hora), lo renueva con el refresh token. */
async function tokenVigente(tienda: TiendaShopify) {
  const db = await admin();
  const { data: c, error } = await db
    .from("shopify_conexiones")
    .select("shop, estado, access_token, access_expira, refresh_token, refresh_expira")
    .eq("tienda", tienda)
    .single();
  if (error || !c) throw new Error("No se encontró la conexión de la tienda");
  if (c.estado !== "conectada" || !c.access_token) throw new Error("La tienda no está conectada");

  const vence = c.access_expira ? new Date(c.access_expira).getTime() : Infinity;
  if (vence - Date.now() > 60_000) return { shop: c.shop, token: c.access_token };

  const secret = secreto(tienda);
  if (!secret) throw new Error(`Falta el secreto ${APPS[tienda].secretEnv}`);
  if (!c.refresh_token || (c.refresh_expira && new Date(c.refresh_expira).getTime() < Date.now())) {
    await marcar(tienda, { estado: "desconectada", ultimo_error: MENSAJE_RECONECTAR });
    throw new Error(MENSAJE_RECONECTAR);
  }
  try {
    const r = await pedirToken(c.shop, {
      client_id: clientId(tienda),
      client_secret: secret,
      grant_type: "refresh_token",
      refresh_token: c.refresh_token,
    });
    const fila = filaToken(r);
    await marcar(tienda, fila);
    return { shop: c.shop, token: fila.access_token };
  } catch (e) {
    if (e instanceof ErrorShopify && (e.status === 400 || e.status === 401)) {
      await marcar(tienda, { estado: "desconectada", ultimo_error: MENSAJE_RECONECTAR });
      throw new Error(MENSAJE_RECONECTAR);
    }
    throw e;
  }
}

async function graphql<T>(
  tienda: TiendaShopify,
  query: string,
  variables: Record<string, unknown>,
) {
  const { shop, token } = await tokenVigente(tienda);
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401) {
    await marcar(tienda, { estado: "desconectada", ultimo_error: MENSAJE_RECONECTAR });
    throw new Error(MENSAJE_RECONECTAR);
  }
  if (res.status === 403) {
    throw new Error(
      "Shopify rechazó la conexión (403). Lo más probable es que falte agregar la red del sistema a la lista de IP permitidas de la app.",
    );
  }
  if (!res.ok) throw new Error(`Shopify respondió ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join(" · "));
  if (!json.data) throw new Error("Shopify no devolvió datos");
  return json.data;
}

const QUERY_VARIANTES = /* GraphQL */ `
  query Variantes($after: String) {
    productVariants(first: 100, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        sku
        barcode
        price
        inventoryQuantity
        product {
          id
          title
          status
        }
        inventoryItem {
          tracked
          inventoryLevels(first: 20) {
            nodes {
              location {
                id
                name
              }
              quantities(names: ["available"]) {
                name
                quantity
              }
            }
          }
        }
      }
    }
  }
`;

type Variante = {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  inventoryQuantity: number | null;
  product: { id: string; title: string; status: string };
  inventoryItem: {
    tracked: boolean;
    inventoryLevels: {
      nodes: {
        location: { id: string; name: string };
        quantities: { name: string; quantity: number }[];
      }[];
    };
  } | null;
};

type PaginaVariantes = {
  productVariants: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Variante[];
  };
};

const idCorto = (gid: string) => gid.split("/").pop() ?? gid;

/** Lee todos los productos y su stock de una tienda y deja la foto en shopify_variantes. */
export async function leerTienda(tienda: TiendaShopify) {
  const inicio = new Date().toISOString();
  const db = await admin();
  try {
    const filas: Record<string, unknown>[] = [];
    let after: string | null = null;
    for (let pagina = 0; pagina < 100; pagina++) {
      const data: PaginaVariantes = await graphql<PaginaVariantes>(tienda, QUERY_VARIANTES, {
        after,
      });
      for (const v of data.productVariants.nodes) {
        const ubicaciones = (v.inventoryItem?.inventoryLevels.nodes ?? []).map((n) => ({
          ubicacion: n.location.name,
          stock: n.quantities.find((q) => q.name === "available")?.quantity ?? 0,
        }));
        filas.push({
          tienda,
          variante_id: idCorto(v.id),
          producto_id: idCorto(v.product.id),
          producto: v.product.title,
          variante: v.title === "Default Title" ? null : v.title,
          estado_producto: v.product.status,
          sku: v.sku || null,
          codigo_barras: v.barcode || null,
          precio: Number(v.price) || null,
          stock: v.inventoryQuantity,
          controla_stock: v.inventoryItem?.tracked ?? null,
          stock_por_ubicacion: ubicaciones,
          leido_en: inicio,
        });
      }
      if (!data.productVariants.pageInfo.hasNextPage) break;
      after = data.productVariants.pageInfo.endCursor;
    }

    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await db
        .from("shopify_variantes")
        .upsert(filas.slice(i, i + 500) as never, { onConflict: "tienda,variante_id" });
      if (error) throw new Error(`No se pudo guardar la lectura: ${error.message}`);
    }
    /* Lo que ya no está en Shopify (borrado) sale de la foto */
    await db.from("shopify_variantes").delete().eq("tienda", tienda).lt("leido_en", inicio);
    await marcar(tienda, { ultima_lectura: inicio, ultimo_error: null });

    const stock = filas.reduce((s, f) => s + Math.max(0, Number(f["stock"]) || 0), 0);
    return { variantes: filas.length, stock };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await marcar(tienda, { ultimo_error: mensaje.slice(0, 500) });
    throw e;
  }
}
