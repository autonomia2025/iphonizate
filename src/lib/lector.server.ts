/**
 * Piezas del lector que solo corren en el servidor: hash de la clave del Mac
 * y autenticación de las llamadas del agente.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const hashClave = (clave: string) =>
  createHash("sha256").update(clave.trim()).digest("hex");

export const generarClave = () => `lec_${randomBytes(24).toString("hex")}`;

export const mismoHash = (a: string, b: string) => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

export type AgenteAutenticado = {
  id: string;
  nombre: string;
  tienda_id: string;
  activo: boolean;
};

/**
 * Busca el agente por el hash de la clave que llegó en el encabezado.
 * Devuelve null si no hay clave, no existe o está revocado.
 */
export async function autenticarAgente(request: Request): Promise<AgenteAutenticado | null> {
  const clave = request.headers.get("x-lector-clave")?.trim();
  if (!clave || clave.length < 16) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hash = hashClave(clave);
  const { data, error } = await supabaseAdmin
    .from("lector_agentes")
    .select("id, nombre, tienda_id, activo, clave_hash")
    .eq("clave_hash", hash)
    .maybeSingle();

  if (error || !data || !data.activo) return null;
  if (!mismoHash(data.clave_hash, hash)) return null;
  return { id: data.id, nombre: data.nombre, tienda_id: data.tienda_id, activo: data.activo };
}
