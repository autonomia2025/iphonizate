import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ErrorImeicheck,
  consultarCuenta,
  consultarImei,
  consultarServicios,
  numero,
  type ServicioImeicheck,
} from "@/lib/imeicheck.server";
import {
  MENSAJE_MOTIVO,
  datosParaEquipo,
  leerPropiedades,
  llavesDesconocidas,
  type ResultadoVerificacion,
} from "@/lib/imeicheck";

const DIAS_CACHE = 30;

type Cliente = SupabaseClient<any, any, any>;

async function configuracion(supabase: Cliente) {
  const { data } = await supabase
    .from("imeicheck_config")
    .select("service_id, ambiente")
    .eq("id", 1)
    .maybeSingle();
  return {
    serviceId: Number(data?.service_id ?? 12),
    ambiente: String(data?.ambiente ?? "sandbox"),
  };
}

/** La respuesta cruda se guarda siempre, incluso si el mapeo no reconoce nada. */
async function guardarConsulta(
  supabase: Cliente,
  imei: string,
  serviceId: number,
  status: string,
  respuesta: Record<string, unknown>,
  costo: number,
) {
  const { data, error } = await supabase
    .from("imei_verificaciones")
    .insert({
      imei,
      service_id: serviceId,
      status,
      properties: (respuesta["properties"] ?? {}) as never,
      respuesta: respuesta as never,
      costo,
    })
    .select("fecha")
    .maybeSingle();
  if (error) console.error("[imeicheck] no se pudo guardar la consulta", imei, error.message);
  return data?.fecha ? String(data.fecha) : new Date().toISOString();
}

export async function ejecutarVerificacion(
  supabase: Cliente,
  imei: string,
  forzar = false,
): Promise<ResultadoVerificacion> {
  const { serviceId } = await configuracion(supabase);

  /* Caché: solo verificaciones exitosas de menos de 30 días. Las fallidas se reintentan. */
  if (!forzar) {
    const desde = new Date(Date.now() - DIAS_CACHE * 86400_000).toISOString();
    const { data: guardada } = await supabase
      .from("imei_verificaciones")
      .select("status, properties, fecha, service_id, costo")
      .eq("imei", imei)
      .eq("status", "successful")
      .gte("fecha", desde)
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle();

    const props = guardada ? leerPropiedades(guardada.properties) : null;
    if (guardada && props) {
      return {
        ok: true,
        status: "successful",
        propiedades: props,
        origen: "cache",
        fecha: String(guardada.fecha),
        serviceId: Number(guardada.service_id ?? serviceId),
        costo: numero(guardada.costo),
      };
    }
  }

  let respuesta;
  try {
    respuesta = await consultarImei(serviceId, imei);
  } catch (e) {
    if (e instanceof ErrorImeicheck) {
      return { ok: false, motivo: e.motivo, mensaje: MENSAJE_MOTIVO[e.motivo] };
    }
    console.error("[imeicheck] fallo inesperado", imei, e);
    return { ok: false, motivo: "sin_respuesta", mensaje: MENSAJE_MOTIVO.sin_respuesta };
  }

  const status = String(respuesta.status ?? "unsuccessful");
  const costo = numero(respuesta.amount ?? respuesta.price ?? 0);

  /* Siempre se valida status antes de leer properties: en el caso fallido llega como array vacío. */
  const props = status === "successful" ? leerPropiedades(respuesta.properties) : null;

  /* Aviso temprano si Live cambia los nombres de las llaves. */
  const desconocidas = llavesDesconocidas(respuesta.properties);
  if (desconocidas.length > 0) {
    console.warn(
      `[imeicheck] llaves no contempladas en el mapeo (servicio ${serviceId}): ${desconocidas.join(", ")}`,
    );
  }

  const fecha = await guardarConsulta(
    supabase,
    imei,
    serviceId,
    status,
    respuesta as Record<string, unknown>,
    costo,
  );

  if (!props) {
    return { ok: false, motivo: "sin_resultado", status, mensaje: MENSAJE_MOTIVO.sin_resultado };
  }

  return { ok: true, status: "successful", propiedades: props, origen: "api", fecha, serviceId, costo };
}

/** Verifica y deja los datos grabados en la fila del equipo (solo desde el servidor). */
export async function verificarYGuardar(
  supabase: Cliente,
  imei: string,
  forzar = false,
  riesgoAceptado = false,
): Promise<ResultadoVerificacion & { guardado?: boolean }> {
  const resultado = await ejecutarVerificacion(supabase, imei, forzar);
  if (!resultado.ok) return resultado;

  const { error } = await supabase.rpc("guardar_verificacion_equipo", {
    _imei: imei,
    _datos: datosParaEquipo(resultado.propiedades) as never,
    _riesgo_aceptado: riesgoAceptado,
  });
  if (error) {
    console.error("[imeicheck] no se pudo guardar en el equipo", imei, error.message);
    return { ...resultado, guardado: false };
  }
  return { ...resultado, guardado: true };
}

export async function obtenerSaldo() {
  try {
    const cuenta = await consultarCuenta();
    return { ok: true as const, saldo: numero(cuenta.balance ?? cuenta["credit"] ?? 0) };
  } catch (e) {
    const err = e instanceof ErrorImeicheck ? e : null;
    return {
      ok: false as const,
      motivo: err?.motivo ?? "sin_respuesta",
      mensaje: err ? MENSAJE_MOTIVO[err.motivo] : MENSAJE_MOTIVO.sin_respuesta,
    };
  }
}

export async function obtenerServicios() {
  try {
    const bruto = await consultarServicios();
    const lista: ServicioImeicheck[] = Array.isArray(bruto) ? bruto : (bruto?.data ?? []);
    return {
      ok: true as const,
      servicios: lista
        .map((s) => ({
          id: Number(s.id ?? 0),
          nombre: String(s.title ?? s.name ?? `Servicio ${s.id ?? ""}`).trim(),
          precio: numero(s.price ?? 0),
        }))
        .filter((s) => s.id > 0),
    };
  } catch (e) {
    const err = e instanceof ErrorImeicheck ? e : null;
    return {
      ok: false as const,
      motivo: err?.motivo ?? "sin_respuesta",
      mensaje: err ? MENSAJE_MOTIVO[err.motivo] : MENSAJE_MOTIVO.sin_respuesta,
    };
  }
}
