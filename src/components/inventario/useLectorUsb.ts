import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  agenteVivo,
  lecturaFresca,
  type AgenteLector,
  type EstadoLector,
  type Lectura,
} from "@/lib/lector";

const COLUMNAS_LECTURA =
  "id, agente_id, tienda_id, udid, imei, imei2, meid, serie, serie_placa, product_type, modelo, model_number, gb, ios_version, region, activado, operador, wifi_mac, bluetooth_mac, color_codigo, color_comercial, bateria_ciclos, bateria_capacidad_disenio, icloud_bloqueado, icloud_cuenta_enmascarada, fecha";

const COLUMNAS_AGENTE =
  "id, nombre, tienda_id, version, hostname, estado, detalle_estado, ultimo_latido, ultima_lectura, activo";

/**
 * Estado del lector USB y su última lectura.
 *
 * El Mac lector no siempre está registrado en la misma tienda donde se está
 * ingresando el equipo (por ejemplo, quedó en Oficina Central), así que se
 * prefiere el lector de la tienda pedida y, si ese no está vivo, se usa
 * cualquier lector de la cadena con latido reciente.
 */
export function useLectorUsb(tiendaId?: string | null, activo = true) {
  const [agente, setAgente] = useState<AgenteLector | null>(null);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [nuevaLectura, setNuevaLectura] = useState<Lectura | null>(null);
  const vistas = useRef<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    const { data: agentes } = await supabase
      .from("lector_agentes")
      .select(COLUMNAS_AGENTE)
      .eq("activo", true)
      .order("ultimo_latido", { ascending: false, nullsFirst: false })
      .limit(20);

    const lista = (agentes ?? []) as AgenteLector[];
    const vivos = lista.filter((a) => agenteVivo(a.ultimo_latido));
    const elegido =
      vivos.find((a) => a.tienda_id === tiendaId) ??
      vivos[0] ??
      lista.find((a) => a.tienda_id === tiendaId) ??
      lista[0] ??
      null;

    setAgente(elegido);

    if (!elegido) {
      setLectura(null);
      return;
    }

    const { data: lecturas } = await supabase
      .from("lecturas_equipo")
      .select(COLUMNAS_LECTURA)
      .eq("agente_id", elegido.id)
      .order("fecha", { ascending: false })
      .limit(1);
    setLectura((lecturas?.[0] as Lectura | undefined) ?? null);
  }, [tiendaId]);

  useEffect(() => {
    if (!activo) return;
    void cargar();

    const canal = supabase
      .channel("lector-usb")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lector_agentes" },
        (payload) => {
          const fila = payload.new as AgenteLector | null;
          if (!fila?.id || !fila.activo) return;
          setAgente((actual) => {
            if (!actual || actual.id === fila.id) return fila;
            /* Si llega otro Mac con latido vivo y el actual está caído, se cambia */
            if (!agenteVivo(actual.ultimo_latido) && agenteVivo(fila.ultimo_latido)) return fila;
            return actual;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lecturas_equipo" },
        (payload) => {
          const fila = payload.new as Lectura | null;
          if (!fila?.id || vistas.current.has(fila.id)) return;
          vistas.current.add(fila.id);
          setLectura(fila);
          setNuevaLectura(fila);
        },
      )
      .subscribe();

    /* Respaldo por si el canal se cae: se recarga cada 20 s */
    const t = setInterval(() => void cargar(), 20_000);

    return () => {
      clearInterval(t);
      void supabase.removeChannel(canal);
    };
  }, [activo, cargar]);

  const conectado = agenteVivo(agente?.ultimo_latido);
  const estado: EstadoLector = !agente
    ? "sin_contacto"
    : !conectado
      ? "sin_contacto"
      : ((agente.estado as EstadoLector) ?? "sin_equipo");

  return {
    agente,
    estado,
    conectado,
    /** Última lectura conocida del Mac elegido. */
    lectura,
    /** Se sigue ofreciendo aunque tenga rato: la barra avisa la antigüedad. */
    lecturaUtil: lectura,
    /** Si la lectura ya tiene más de 10 minutos. */
    lecturaVieja: !!lectura && !lecturaFresca(lectura.fecha),
    /** Lectura que acaba de llegar por realtime (para autoaplicar una vez). */
    nuevaLectura,
    limpiarNueva: () => setNuevaLectura(null),
    recargar: cargar,
  };
}
