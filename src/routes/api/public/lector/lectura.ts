import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { autenticarAgente } from "@/lib/lector.server";
import { COLOR_SIN_IDENTIFICAR } from "@/lib/lector";

const texto = z.string().trim().max(400).nullish();

const esquema = z.object({
  udid: texto,
  imei: z.string().trim().regex(/^\d{14,16}$/),
  imei2: texto,
  meid: texto,
  serie: texto,
  serie_placa: texto,
  product_type: texto,
  model_number: texto,
  gb: z.number().int().positive().max(8192).nullish(),
  ios_version: texto,
  region: texto,
  activado: z.boolean().nullish(),
  operador: texto,
  wifi_mac: texto,
  bluetooth_mac: texto,
  color_codigo: texto,
  bateria_ciclos: z.number().int().min(0).max(20000).nullish(),
  bateria_capacidad_disenio: z.number().int().min(0).max(50000).nullish(),
  icloud_bloqueado: z.boolean().nullish(),
  icloud_cuenta_enmascarada: texto,
  crudo: z.record(z.string(), z.unknown()).default({}),
});

export const Route = createFileRoute("/api/public/lector/lectura")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const agente = await autenticarAgente(request);
        if (!agente) return new Response("Clave de lector inválida", { status: 401 });

        let cuerpo: unknown;
        try {
          cuerpo = await request.json();
        } catch {
          return new Response("Cuerpo inválido", { status: 400 });
        }

        const parseado = esquema.safeParse(cuerpo);
        if (!parseado.success) {
          console.error("lector/lectura: datos inválidos", parseado.error.issues);
          return new Response("Datos inválidos", { status: 400 });
        }
        const l = parseado.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        /* Traducción de código interno de Apple a nombre comercial */
        let modelo: string | null = null;
        if (l.product_type) {
          const { data } = await supabaseAdmin
            .from("modelos_apple")
            .select("modelo_comercial")
            .eq("product_type", l.product_type)
            .maybeSingle();
          modelo = data?.modelo_comercial ?? null;
        }

        let colorComercial: string | null = null;
        if (l.product_type && l.color_codigo) {
          const { data } = await supabaseAdmin
            .from("colores_apple")
            .select("color_comercial")
            .eq("product_type", l.product_type)
            .eq("device_color", l.color_codigo)
            .maybeSingle();
          colorComercial = data?.color_comercial ?? COLOR_SIN_IDENTIFICAR;
        }

        const { data: fila, error } = await supabaseAdmin
          .from("lecturas_equipo")
          .insert({
            agente_id: agente.id,
            tienda_id: agente.tienda_id,
            udid: l.udid ?? null,
            imei: l.imei,
            imei2: l.imei2 ?? null,
            meid: l.meid ?? null,
            serie: l.serie ?? null,
            serie_placa: l.serie_placa ?? null,
            product_type: l.product_type ?? null,
            modelo,
            model_number: l.model_number ?? null,
            gb: l.gb ?? null,
            ios_version: l.ios_version ?? null,
            region: l.region ?? null,
            activado: l.activado ?? null,
            operador: l.operador ?? null,
            wifi_mac: l.wifi_mac ?? null,
            bluetooth_mac: l.bluetooth_mac ?? null,
            color_codigo: l.color_codigo ?? null,
            color_comercial: colorComercial,
            bateria_ciclos: l.bateria_ciclos ?? null,
            bateria_capacidad_disenio: l.bateria_capacidad_disenio ?? null,
            icloud_bloqueado: l.icloud_bloqueado ?? null,
            icloud_cuenta_enmascarada: l.icloud_cuenta_enmascarada ?? null,
            crudo: (l.crudo ?? {}) as never,
          })
          .select("id")
          .single();

        if (error) {
          console.error("lector/lectura: no se pudo guardar", error);
          return new Response("No se pudo guardar la lectura", { status: 500 });
        }

        await supabaseAdmin
          .from("lector_agentes")
          .update({
            estado: "listo",
            detalle_estado: l.imei,
            udid_actual: l.udid ?? null,
            ultima_lectura: new Date().toISOString(),
            ultimo_latido: new Date().toISOString(),
          })
          .eq("id", agente.id);

        return Response.json({ ok: true, id: fila.id });
      },
    },
  },
});
