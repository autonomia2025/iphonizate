import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EtiquetasModal } from "@/components/inventario/EtiquetasModal";
import type { EquipoEtiqueta } from "@/lib/etiquetas";
import {
  CamposEquipo,
  DATOS_EQUIPO_VACIO,
  datosEquipoJson,
  faltaEnDatos,
  type DatosEquipo,
} from "@/components/listaNegra/CamposEquipo";

type Tienda = { id: string; nombre: string; es_bodega?: boolean | null };

export function IngresarListaNegraModal({
  abierto,
  onCerrar,
  tiendas,
  tiendaPorDefecto,
  puedeCostos,
  onGuardado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  tiendas: Tienda[];
  tiendaPorDefecto?: string | null;
  puedeCostos: boolean;
  onGuardado: () => void;
}) {
  const [datos, setDatos] = useState<DatosEquipo>({ ...DATOS_EQUIPO_VACIO });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [etiquetaNueva, setEtiquetaNueva] = useState<EquipoEtiqueta | null>(null);
  const imeiRef = useRef<HTMLInputElement>(null);

  /* Igual que el inventario: parte en bodega y con el foco en el IMEI */
  useEffect(() => {
    if (!abierto) return;
    const bodega = tiendas.find((t) => t.es_bodega);
    setDatos((d) => ({
      ...d,
      ubicacion_id: d.ubicacion_id || bodega?.id || tiendaPorDefecto || tiendas[0]?.id || "",
    }));
    const t = setTimeout(() => imeiRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [abierto, tiendaPorDefecto, tiendas]);

  const guardar = async () => {
    const falta = faltaEnDatos(datos, { costoObligatorio: puedeCostos });
    if (falta) {
      setError(falta);
      toast.error("No se pudo guardar el equipo", { description: falta });
      return;
    }
    setError(null);
    setGuardando(true);
    const { error: err } = await supabase.rpc("lista_negra_ingresar", {
      _datos: datosEquipoJson(datos),
    });
    setGuardando(false);
    if (err) {
      const texto = err.message.replace(/^.*?:\s*/, "");
      setError(texto);
      toast.error("No se pudo guardar el equipo", { description: texto });
      return;
    }
    toast.success("Equipo ingresado a lista negra", {
      description: `${datos.modelo.trim()} · IMEI ${datos.imei}`,
    });
    setEtiquetaNueva({
      imei: datos.imei,
      modelo: datos.modelo.trim(),
      gb: datos.gb ? Number(datos.gb) : null,
      color: datos.color.trim() || null,
      etapa: "Lista negra",
      bateria: datos.bateria === "" ? null : Number(datos.bateria),
      sim: datos.sim || null,
    });
    onGuardado();
    /* Conserva ubicación y proveedor para ingresar el siguiente del mismo lote */
    setDatos((d) => ({
      ...DATOS_EQUIPO_VACIO,
      ubicacion_id: d.ubicacion_id,
      proveedor: d.proveedor,
      lote: d.lote,
    }));
    setTimeout(() => imeiRef.current?.focus(), 30);
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="modal-rapido glass max-h-[90vh] overflow-y-auto border-white/10 bg-white/5 backdrop-blur-2xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Ingresar a lista negra</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-sm text-muted-foreground">
          Equipo con el IMEI reportado. No aparece en Stock ni en Vender, pero su costo suma a la
          inversión hasta que se venda o se cambie.
        </p>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <CamposEquipo
            valor={datos}
            onCambio={setDatos}
            tiendas={tiendas}
            puedeCostos={puedeCostos}
            costoObligatorio={puedeCostos}
            imeiRef={imeiRef}
            abierto={abierto}
          />

          {error && (
            <p className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCerrar}>
              Cerrar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar e ingresar otro"}
            </Button>
          </div>
        </form>
      </DialogContent>
      <EtiquetasModal
        abierto={!!etiquetaNueva}
        equipos={etiquetaNueva ? [etiquetaNueva] : []}
        onCerrar={() => setEtiquetaNueva(null)}
      />
    </Dialog>
  );
}
