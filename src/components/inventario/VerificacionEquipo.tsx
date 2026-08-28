import { ShieldAlert } from "lucide-react";

/**
 * Alertas del equipo que vienen de la lectura por USB (iCloud, lista negra).
 * Ya no existe consulta externa de IMEI: acá solo se muestra lo que está guardado.
 */
export type VerificacionFila = {
  imei: string;
  serie?: string | null;
  imei2?: string | null;
  icloud_activo?: boolean | null;
  lista_negra?: boolean | null;
  bloqueo_operador?: boolean | null;
  reemplazado_apple?: boolean | null;
  garantia_estado?: string | null;
  pais_compra?: string | null;
  fecha_compra_estimada?: string | null;
  bloqueo_usa?: string | null;
  verificado_at?: string | null;
};

export function VerificacionEquipo({ equipo }: { equipo: VerificacionFila }) {
  if (!tieneAlertaImei(equipo)) return null;

  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold">Alertas del equipo</h3>
      <p className="mt-2 flex items-center gap-2 rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
        <ShieldAlert className="size-4 shrink-0" />
        {equipo.icloud_activo && equipo.lista_negra
          ? "iCloud activado y IMEI en lista negra."
          : equipo.icloud_activo
            ? "iCloud activado: no se puede revender hasta desvincularlo."
            : "IMEI en lista negra: reportado como perdido o robado."}
      </p>
    </section>
  );
}

/** Distintivo rojo para la tabla: iCloud activo o lista negra. */
export const tieneAlertaImei = (e: {
  icloud_activo?: boolean | null;
  lista_negra?: boolean | null;
}) => !!e.icloud_activo || !!e.lista_negra;
