import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TIPOS_TAREA, URGENCIAS, type Urgencia } from "@/lib/gestion";
import { cn } from "@/lib/utils";

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

type Props = {
  abierto: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
  personas: { id: string; nombre: string }[];
  usuarioId?: string | null;
};

export function NuevaTareaModal({ abierto, onCerrar, onGuardado, personas, usuarioId }: Props) {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [urgencia, setUrgencia] = useState<Urgencia>("media");
  const [tipo, setTipo] = useState<string>(TIPOS_TAREA[0]);
  const [asignado, setAsignado] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setTitulo("");
    setDescripcion("");
    setUrgencia("media");
    setTipo(TIPOS_TAREA[0]);
    setAsignado(usuarioId ?? "");
  }, [abierto, usuarioId]);

  if (!abierto) return null;

  const guardar = async () => {
    if (!titulo.trim()) {
      toast.error("Escribe un título para la tarea");
      return;
    }
    setGuardando(true);
    try {
      const { error } = await supabase.from("tareas").insert({
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        urgencia,
        tipo,
        asignado_id: asignado || null,
        created_by: usuarioId ?? null,
      });
      if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
      toast.success("Tarea creada");
      onGuardado();
      onCerrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear la tarea");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass w-full max-w-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Nueva tarea</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Asigna responsable y urgencia para que no se pierda
            </p>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.07] hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Título
            </span>
            <input
              autoFocus
              className={campo}
              value={titulo}
              placeholder="Llamar a proveedor por pantallas"
              onChange={(e) => setTitulo(e.target.value)}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Descripción
            </span>
            <textarea
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
              value={descripcion}
              placeholder="Detalle o contexto"
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </label>

          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Urgencia
            </span>
            <div className="flex gap-2">
              {URGENCIAS.map((u) => (
                <button
                  key={u.valor}
                  onClick={() => setUrgencia(u.valor)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors duration-200",
                    urgencia === u.valor
                      ? "border-white/20 bg-white/[0.08]"
                      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className={cn("size-2 rounded-full", u.punto)} />
                  {u.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Tipo
            </span>
            <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_TAREA.map((t) => (
                <option key={t} value={t} className="bg-[#16131F]">
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Asignada a
            </span>
            <select className={campo} value={asignado} onChange={(e) => setAsignado(e.target.value)}>
              <option value="" className="bg-[#16131F]">
                Sin asignar
              </option>
              {personas.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#16131F]">
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Creando…" : "Crear tarea"}
          </Button>
        </div>
      </div>
    </div>
  );
}
