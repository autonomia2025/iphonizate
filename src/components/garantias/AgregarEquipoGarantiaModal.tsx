import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { GarantiaMinima } from "@/components/garantias/MandarTecnicoModal";
import {
  EQUIPO_PREVIO_VACIO,
  EquipoPrevioCampos,
  equipoPrevioJson,
  faltaEnPrevio,
  type EquipoPrevio,
} from "@/components/garantias/EquipoPrevioCampos";

/** Garantía de un teléfono vendido antes del sistema: se agrega el equipo y el flujo sigue normal. */
export function AgregarEquipoGarantiaModal({
  garantia,
  puedeCostos,
  onCerrar,
  onHecho,
}: {
  garantia: GarantiaMinima;
  puedeCostos: boolean;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [equipo, setEquipo] = useState<EquipoPrevio>(EQUIPO_PREVIO_VACIO);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const falta = faltaEnPrevio(equipo, puedeCostos);
    if (falta) {
      toast.error(falta);
      return;
    }
    setGuardando(true);
    const { error } = await supabase.rpc("garantia_agregar_equipo", {
      _garantia: garantia.id,
      _equipo: equipoPrevioJson(equipo),
    });
    setGuardando(false);
    if (error) {
      toast.error("No se pudo agregar el equipo", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    toast.success("Equipo agregado a la garantía", {
      description: "Ya puedes mandarlo a técnico o resolverla con cambio.",
    });
    onHecho();
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass w-full max-w-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Agregar equipo</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              IMEI <span className="num">{garantia.imei}</span> · vendido antes del sistema
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onCerrar}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/8 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          El equipo queda en el inventario como “En garantía”, con los mismos datos que un ingreso
          normal. Desde ahí se manda a técnico o se resuelve como cualquier otro.
        </p>

        <div className="mt-5">
          <EquipoPrevioCampos valor={equipo} onCambio={setEquipo} puedeCostos={puedeCostos} />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button className="accent-glow" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Agregar equipo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
