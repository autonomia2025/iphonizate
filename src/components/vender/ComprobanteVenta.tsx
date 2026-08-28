import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, FileText, Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { emitirComprobante } from "@/lib/comprobante.functions";

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

type Estado = {
  numero: string;
  url: string;
  correo: string | null;
  envio: "enviado" | "sin_correo" | "error" | "suprimido";
  motivo: string | null;
};

/**
 * Emite el comprobante en cuanto se registra la venta y deja a mano el PDF y
 * el reenvío al correo del cliente.
 */
export function ComprobanteVenta({
  ventaId,
  correoCliente,
}: {
  ventaId: string;
  correoCliente: string | null;
}) {
  const emitir = useServerFn(emitirComprobante);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [correo, setCorreo] = useState(correoCliente ?? "");
  const pedido = useRef(false);

  const pedir = async (destino: string | null) => {
    setCargando(true);
    setError(null);
    try {
      const r = (await emitir({ data: { ventaId, correo: destino } })) as Estado;
      setEstado(r);
      if (r.envio === "enviado") toast.success(`Comprobante enviado a ${r.correo}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el comprobante");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (pedido.current) return;
    pedido.current = true;
    void pedir(correoCliente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventaId]);

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <FileText className="size-4 text-[var(--accent-store)]" />
          <span className="font-display">Comprobante</span>
          {estado?.numero && (
            <span className="num text-xs text-muted-foreground">{estado.numero}</span>
          )}
          {cargando && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </div>

        {estado?.url && (
          <Button variant="ghost" size="sm" className="border border-white/10" asChild>
            <a href={estado.url} target="_blank" rel="noreferrer">
              Ver comprobante
            </a>
          </Button>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 text-xs text-red-300">
          <AlertTriangle className="size-3.5" /> {error}
          <button
            type="button"
            className="underline"
            onClick={() => void pedir(correo.trim() || null)}
          >
            Reintentar
          </button>
        </div>
      )}

      {estado?.envio === "enviado" && (
        <p className="mt-3 flex items-center gap-2 text-xs text-emerald-300">
          <Check className="size-3.5" /> Enviado a {estado.correo}
        </p>
      )}

      {estado?.envio === "suprimido" && (
        <p className="mt-3 text-xs text-amber-300">
          Ese correo pidió no recibir mensajes. El PDF queda guardado igual.
        </p>
      )}

      {estado && estado.envio !== "enviado" && estado.envio !== "suprimido" && (
        <div className="mt-3">
          <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="size-3.5" />
            {estado.envio === "sin_correo"
              ? "Sin correo del cliente: escríbelo para enviarle el comprobante."
              : `No se pudo enviar${estado.motivo ? `: ${estado.motivo}` : ""}.`}
          </p>
          <div className="flex gap-2">
            <input
              className={campo}
              type="email"
              value={correo}
              placeholder="cliente@correo.cl"
              aria-label="Correo del cliente"
              onChange={(e) => setCorreo(e.target.value)}
            />
            <Button
              size="sm"
              className="h-10 gap-1.5 bg-[var(--accent-store)] text-white hover:bg-[var(--accent-store)]/90"
              disabled={cargando || !correo.trim()}
              onClick={() => void pedir(correo.trim())}
            >
              <Send className="size-3.5" /> Enviar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
