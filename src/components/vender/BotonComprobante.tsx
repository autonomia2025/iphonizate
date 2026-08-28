import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { enlaceComprobante } from "@/lib/comprobante.functions";

/** Abre el PDF del comprobante de una venta; lo genera si aún no existe. */
export function BotonComprobante({ ventaId }: { ventaId: string }) {
  const pedirEnlace = useServerFn(enlaceComprobante);
  const [cargando, setCargando] = useState(false);

  const abrir = async () => {
    setCargando(true);
    try {
      const { url } = (await pedirEnlace({ data: { ventaId } })) as { url: string };
      window.open(url, "_blank", "noopener");
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
