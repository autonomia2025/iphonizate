import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Mail, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emitirComprobante, enlaceComprobante } from "@/lib/comprobante.functions";
import { formatCLP } from "@/lib/stores";
import { fechaLarga } from "@/lib/inventario";

const DESC = "Todos los tickets de venta: búscalos, ábrelos en PDF y reenvíalos al cliente.";

export const Route = createFileRoute("/comprobantes")({
  head: () => ({
    meta: [
      { title: "Comprobantes · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Comprobantes · iPhonizate OS" },
      { property: "og:description", content: DESC },
    ],
  }),
  component: ComprobantesPage,
});

const ESTADO_CORREO: Record<string, string> = {
  enviado: "Enviado al cliente",
  sin_correo: "Sin correo",
  suprimido: "Correo bloqueado",
  error: "Falló el envío",
};

function ComprobantesPage() {
  const [busqueda, setBusqueda] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const abrirEnlace = useServerFn(enlaceComprobante);
  const emitir = useServerFn(emitirComprobante);

  const comprobantes = useQuery({
    queryKey: ["v_comprobantes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_comprobantes")
        .select(
          "id, fecha, total, anulada, con_boleta, comprobante_numero, tiene_pdf, comprobante_email, comprobante_email_estado, tienda, vendedor, cliente, cliente_correo, imeis, modelos",
        )
        .order("fecha", { ascending: false })
        .limit(400);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const todas = comprobantes.data ?? [];
    if (!q) return todas;
    return todas.filter((v) =>
      [v.comprobante_numero, v.cliente, v.imeis, v.modelos, v.vendedor, v.tienda]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(q)),
    );
  }, [comprobantes.data, busqueda]);

  const verPdf = async (ventaId: string) => {
    setOcupado(ventaId);
    try {
      const { url } = await abrirEnlace({ data: { ventaId } });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error("No se pudo abrir el comprobante", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
    setOcupado(null);
  };

  const reenviar = async (ventaId: string, correo: string | null) => {
    if (!correo) {
      toast.error("Esa venta no tiene correo del cliente");
      return;
    }
    setOcupado(ventaId);
    try {
      const r = await emitir({ data: { ventaId, correo } });
      if (r.envio === "enviado") toast.success(`Comprobante enviado a ${correo}`);
      else toast.warning("No se pudo enviar", { description: r.motivo ?? undefined });
      void comprobantes.refetch();
    } catch (e) {
      toast.error("No se pudo reenviar", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
    setOcupado(null);
  };

  return (
    <div className="mx-auto max-w-[86rem]">
      <div>
        <h1 className="font-display text-2xl font-semibold">Comprobantes</h1>
        <p className="mt-1 text-sm text-muted-foreground">{DESC}</p>
      </div>

      <div className="glass mt-6 flex items-center gap-2 p-4">
        <Search className="size-4 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Número, cliente, IMEI, modelo, vendedor o tienda"
          className="border-0 bg-transparent focus-visible:ring-0"
        />
      </div>

      <div className="solid-panel mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Equipos</th>
                <th className="px-4 py-3 font-medium">Tienda</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Correo</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filas.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                >
                  <td className="num px-4 py-2.5">
                    {v.comprobante_numero ?? "—"}
                    {v.anulada && (
                      <span className="ml-2 rounded-full border border-rose-400/40 px-2 py-0.5 text-[10px] text-rose-300">
                        anulada
                      </span>
                    )}
                  </td>
                  <td className="num px-4 py-2.5 text-muted-foreground">{fechaLarga(v.fecha)}</td>
                  <td className="px-4 py-2.5">{v.cliente ?? "Sin cliente"}</td>
                  <td className="px-4 py-2.5">
                    <p className="truncate">{v.modelos ?? "—"}</p>
                    <p className="num text-xs text-muted-foreground">{v.imeis ?? ""}</p>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{v.tienda ?? "—"}</td>
                  <td className="num px-4 py-2.5">{formatCLP(v.total ?? 0)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {ESTADO_CORREO[v.comprobante_email_estado ?? ""] ??
                      (v.cliente_correo ? "Sin enviar" : "Sin correo")}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1.5"
                        disabled={ocupado === v.id}
                        onClick={() => void verPdf(v.id!)}
                      >
                        <Download className="size-3.5" /> PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5"
                        disabled={ocupado === v.id}
                        onClick={() =>
                          void reenviar(v.id!, v.comprobante_email ?? v.cliente_correo ?? null)
                        }
                      >
                        <Mail className="size-3.5" /> Reenviar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {comprobantes.isLoading
                      ? "Cargando comprobantes…"
                      : "Todavía no hay comprobantes con esa búsqueda."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
