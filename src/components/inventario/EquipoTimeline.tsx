import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fechaLarga } from "@/lib/inventario";

export type EventoTimeline = {
  id: string;
  fecha: string | null;
  fuente: string | null;
  titulo: string | null;
  detalle: string | null;
  autor: string | null;
  tienda: string | null;
};

const PUNTO: Record<string, string> = {
  comentario: "bg-[var(--accent-store)]",
  movimiento: "bg-sky-400",
  servicio: "bg-amber-400",
  venta: "bg-emerald-400",
  historial: "bg-white/35",
};

export function useTimelineEquipo(equipoId?: string | null) {
  return useQuery({
    queryKey: ["v_equipo_timeline", equipoId],
    enabled: !!equipoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_equipo_timeline")
        .select("id, fecha, fuente, titulo, detalle, autor, tienda")
        .eq("equipo_id", equipoId!)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventoTimeline[];
    },
  });
}

/**
 * Bitácora + historia completa del equipo en una sola línea de tiempo.
 * Los comentarios quedan con autor y fecha, y nadie los puede editar ni borrar.
 */
export function EquipoTimeline({
  equipoId,
  compacto = false,
}: {
  equipoId: string;
  compacto?: boolean;
}) {
  const queryClient = useQueryClient();
  const timeline = useTimelineEquipo(equipoId);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const comentar = async () => {
    const limpio = texto.trim();
    if (!limpio) return;
    setEnviando(true);
    const { error } = await supabase.rpc("agregar_comentario_equipo", {
      _equipo: equipoId,
      _texto: limpio,
    });
    setEnviando(false);
    if (error) {
      toast.error("No se pudo guardar el comentario", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    setTexto("");
    toast.success("Comentario agregado a la bitácora");
    void timeline.refetch();
    void queryClient.invalidateQueries({ queryKey: ["equipos_historial", equipoId] });
  };

  return (
    <section className={compacto ? "" : "mt-6 pb-6"}>
      <h3 className="text-sm font-semibold">Bitácora e historia</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Deja aquí lo que pasa con el equipo: lo verá la próxima persona que lo escanee.
      </p>

      <div className="mt-3">
        <Textarea
          value={texto}
          rows={2}
          maxLength={1000}
          placeholder="Ej: pantalla cambiada, queda a la espera de repuesto de cámara"
          onChange={(e) => setTexto(e.target.value)}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="num text-[11px] text-muted-foreground">{texto.length}/1000</span>
          <Button
            size="sm"
            className="accent-glow gap-2"
            disabled={enviando || !texto.trim()}
            onClick={() => void comentar()}
          >
            <MessageSquarePlus className="size-4" />
            {enviando ? "Guardando…" : "Agregar comentario"}
          </Button>
        </div>
      </div>

      {timeline.data && timeline.data.length > 0 ? (
        <ol className="mt-4 space-y-3">
          {timeline.data.map((e) => (
            <li key={e.id} className="relative border-l border-white/10 pl-4">
              <span
                className={`absolute -left-[3.5px] top-1.5 size-1.5 rounded-full ${
                  PUNTO[e.fuente ?? "historial"] ?? "bg-white/35"
                }`}
              />
              <p className="text-sm">{e.titulo}</p>
              {e.detalle && (
                <p className="mt-0.5 text-sm whitespace-pre-line text-muted-foreground">
                  {e.detalle}
                </p>
              )}
              <p className="num mt-0.5 text-[11px] text-muted-foreground">
                {fechaLarga(e.fecha)}
                {e.autor ? ` · ${e.autor}` : ""}
                {e.tienda ? ` · ${e.tienda}` : ""}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          {timeline.isLoading ? "Cargando…" : "Todavía no hay eventos registrados."}
        </p>
      )}
    </section>
  );
}
