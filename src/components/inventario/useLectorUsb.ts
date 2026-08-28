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
 * Estado del lector USB de una tienda y su última lectura.
 * Escucha por realtime tanto el agente (para la barra de estado) como las
 * lecturas nuevas (para autocompletar el formulario).
 */
export function useLectorUsb(tiendaId?: string | null, activo = true) {
  const [agente, setAgente] = useState<AgenteLector | null>(null);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [nuevaLectura, setNuevaLectura] = useState<Lectura | null>(null);
  const vistas = useRef<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    if (!tiendaId) {
      setAgente(null);
      setLectura(null);
      return;
    }
    const [{ data: agentes }, { data: lecturas }] = await Promise.all([
      supabase
        .from("lector_agentes")
        .select(COLUMNAS_AGENTE)
        .eq("tienda_id", tiendaId)
        .eq("activo", true)
        .order("ultimo_latido", { ascending: false, nullsFirst: false })
        .limit(1),
      supabase
        .from("lecturas_equipo")
        .select(COLUMNAS_LECTURA)
        .eq("tienda_id", tiendaId)
        .order("fecha", { ascending: false })
        .limit(1),
    ]);
    setAgente((agentes?.[0] as AgenteLector | undefined) ?? null);
    setLectura((lecturas?.[0] as Lectura | undefined) ?? null);
  }, [tiendaId]);

  useEffect(() => {
    if (!activo || !tiendaId) return;
    void cargar();

    const canal = supabase
      .channel(`lector-${tiendaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lector_agentes", filter: `tienda_id=eq.${tiendaId}` },
        (payload) => {
          const fila = payload.new as AgenteLector | null;
          if (fila?.id && fila.activo) setAgente(fila);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lecturas_equipo",
          filter: `tienda_id=eq.${tiendaId}`,
        },
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
  }, [activo, tiendaId, cargar]);

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
    /** Última lectura conocida, sirva o no para autocompletar. */
    lectura,
    /** Lectura fresca: la que el modal ofrece aplicar. */
    lecturaUtil: lectura && lecturaFresca(lectura.fecha) ? lectura : null,
    /** Lectura que acaba de llegar por realtime (para autoaplicar una vez). */
    nuevaLectura,
    limpiarNueva: () => setNuevaLectura(null),
    recargar: cargar,
  };
}
