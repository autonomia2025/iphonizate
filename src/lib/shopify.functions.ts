import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  TIENDAS_SHOPIFY,
  esTiendaShopify,
  linkInstalacionValido,
  type ConexionShopify,
} from "@/lib/shopify";

type Contexto = { supabase: SupabaseClient<Database>; userId: string };

/** Shopify lo ven y manejan Dirección y Administración. */
async function autorizado(context: Contexto) {
  const { data: yo } = await context.supabase
    .from("usuarios")
    .select("rol")
    .eq("auth_user_id", context.userId)
    .maybeSingle();
  return yo?.rol === "direccion" || yo?.rol === "administracion";
}

const SIN_PERMISO = "Solo Dirección y Administración pueden manejar Shopify.";

export const estadoShopify = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await autorizado(context))) {
      return { ok: false as const, mensaje: SIN_PERMISO };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { secreto } = await import("@/lib/shopify.server");
    const [{ data: filas, error }, { data: variantes }] = await Promise.all([
      supabaseAdmin
        .from("shopify_conexiones")
        .select(
          "tienda, shop, link_instalacion, estado, conectada_en, ultima_lectura, ultimo_error",
        ),
      supabaseAdmin.from("shopify_variantes").select("tienda, stock").limit(20000),
    ]);
    if (error) return { ok: false as const, mensaje: "No se pudo leer el estado de Shopify." };

    const conexiones: ConexionShopify[] = TIENDAS_SHOPIFY.map((t) => {
      const f = filas?.find((x) => x.tienda === t.id);
      const propias = (variantes ?? []).filter((v) => v.tienda === t.id);
      return {
        tienda: t.id,
        nombre: t.nombre,
        shop: f?.shop ?? t.shop,
        link_instalacion: f?.link_instalacion ?? t.link,
        estado: (f?.estado as ConexionShopify["estado"]) ?? "pendiente",
        conectada_en: f?.conectada_en ?? null,
        ultima_lectura: f?.ultima_lectura ?? null,
        ultimo_error: f?.ultimo_error ?? null,
        secreto_configurado: !!secreto(t.id),
        variantes: propias.length,
        stock: propias.reduce((s, v) => s + Math.max(0, v.stock ?? 0), 0),
      };
    });
    return { ok: true as const, conexiones };
  });

export const guardarLinkShopify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tienda: string; link: string }) =>
    z
      .object({
        tienda: z.string().refine(esTiendaShopify),
        link: z.string().trim().max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await autorizado(context))) {
      return { ok: false as const, mensaje: SIN_PERMISO };
    }
    if (data.link && !linkInstalacionValido(data.link)) {
      return { ok: false as const, mensaje: "Ese link no es de Shopify. Copia el link completo." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("shopify_conexiones")
      .update({ link_instalacion: data.link || null, updated_at: new Date().toISOString() })
      .eq("tienda", data.tienda);
    if (error) return { ok: false as const, mensaje: "No se pudo guardar el link." };
    return { ok: true as const };
  });

export const leerShopify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tienda: string }) =>
    z.object({ tienda: z.string().refine(esTiendaShopify) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await autorizado(context))) {
      return { ok: false as const, mensaje: SIN_PERMISO };
    }
    const { leerTienda } = await import("@/lib/shopify.server");
    try {
      if (!esTiendaShopify(data.tienda)) throw new Error("Tienda no válida");
      const r = await leerTienda(data.tienda);
      return { ok: true as const, ...r };
    } catch (e) {
      return { ok: false as const, mensaje: e instanceof Error ? e.message : String(e) };
    }
  });

/** Desde qué red sale el servidor: es lo que va en la lista de IP permitidas de cada app. */
export const redShopify = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await autorizado(context))) {
      return { ok: false as const, mensaje: SIN_PERMISO };
    }
    try {
      const res = await fetch("https://ipinfo.io/json", {
        headers: { Accept: "application/json" },
      });
      const j = (await res.json()) as { ip?: string; org?: string };
      const asn = j.org?.match(/^AS(\d+)/)?.[1] ?? null;
      return {
        ok: true as const,
        ip: j.ip ?? null,
        asn,
        organizacion: j.org?.replace(/^AS\d+\s*/, "") ?? null,
      };
    } catch {
      return { ok: false as const, mensaje: "No se pudo consultar la red del servidor." };
    }
  });
