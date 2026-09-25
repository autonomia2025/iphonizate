import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { enlaceComprobante } from "@/lib/comprobante.functions";

/**
 * Abre la pestaña en el mismo clic y la apunta al PDF cuando llega el enlace.
 * Abrirla después del await la deja fuera del gesto del usuario y Safari la
 * bloquea sin avisar.
 */
export async function abrirEnPestana(obtenerUrl: () => Promise<string>) {
  const pestana = window.open("", "_blank");
  if (pestana) pestana.opener = null;
  try {
    const url = await obtenerUrl();
    if (pestana) pestana.location.href = url;
    else window.location.assign(url);
  } catch (e) {
    pestana?.close();
    throw e;
  }
}

/** Abre el PDF del comprobante de una venta; lo genera si aún no existe. */
export function BotonComprobante({ ventaId }: { ventaId: string }) {
  const pedirEnlace = useServerFn(enlaceComprobante);
  const [cargando, setCargando] = useState(false);

  const abrir = async () => {
    setCargando(true);
    try {
      await abrirEnPestana(async () => (await pedirEnlace({ data: { ventaId } })).url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir el comprobante");
    } finally {
      setCargando(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 border border-white/10"
      disabled={cargando}
      onClick={() => void abrir()}
    >
      {cargando ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
      Ver comprobante
    </Button>
  );
}
