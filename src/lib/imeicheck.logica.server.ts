import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ErrorImeicheck,
  consultarCuenta,
  consultarImei,
  consultarServicios,
  numero,
  type ServicioImeicheck,
} from "@/lib/imeicheck.server";
import { leerPropiedades, type ResultadoVerificacion } from "@/lib/imeicheck";

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
      return { ok: false, motivo: e.motivo, mensaje: e.message };
    }
    return {
      ok: false,
      motivo: "api_caida",
      mensaje: "No pudimos verificar el IMEI. Completa los datos a mano y sigue.",
    };
  }

  const status = String(respuesta.status ?? "unsuccessful");
  const costo = numero(respuesta.amount ?? respuesta.price ?? 0);

  /* Siempre se valida status antes de leer properties: en el caso fallido llega como array vacío. */
  const props = status === "successful" ? leerPropiedades(respuesta.properties) : null;

  if (!props) {
    return {
      ok: false,
      motivo: "sin_resultado",
      status,
      mensaje:
        "imeicheck no pudo verificar este IMEI. Puedes reintentar o completar los datos a mano.",
    };
  }

  const { data: fila } = await supabase
    .from("imei_verificaciones")
    .insert({
      imei,
      service_id: serviceId,
      status,
      properties: respuesta.properties as never,
      respuesta: respuesta as never,
      costo,
    })
    .select("fecha")
    .maybeSingle();

  return {
    ok: true,
    status: "successful",
    propiedades: props,
    origen: "api",
    fecha: String(fila?.fecha ?? new Date().toISOString()),
    serviceId,
    costo,
  };
}

export async function obtenerSaldo() {
  try {
    const cuenta = await consultarCuenta();
    return { ok: true as const, saldo: numero(cuenta.balance ?? cuenta["credit"] ?? 0) };
  } catch (e) {
    const err = e instanceof ErrorImeicheck ? e : null;
    return {
      ok: false as const,
      motivo: err?.motivo ?? "api_caida",
      mensaje: err?.message ?? "No pudimos leer el saldo de imeicheck.",
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
      motivo: err?.motivo ?? "api_caida",
      mensaje: err?.message ?? "No pudimos leer los servicios de imeicheck.",
    };
  }
}
