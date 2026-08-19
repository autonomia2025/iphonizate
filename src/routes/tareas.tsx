import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { fechaHoraCorta } from "@/lib/caja";
import {
  ORDEN_URGENCIA,
  URGENCIAS,
  URGENCIA_INFO,
  puedeCerrarTarea,
  type Urgencia,
} from "@/lib/gestion";
import { NuevaTareaModal } from "@/components/tareas/NuevaTareaModal";
import { cn } from "@/lib/utils";

const DESC = "Pendientes del equipo por urgencia y responsable.";

export const Route = createFileRoute("/tareas")({
  head: () => ({
    meta: [
      { title: "Tareas · riff store OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Tareas · riff store OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TareasPage,
});

const campo =
  "h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

type Tarea = {
  id: string;
  titulo: string;
  descripcion: string | null;
  urgencia: string;
  tipo: string | null;
  asignado_id: string | null;
  created_by: string | null;
  hecha: boolean;
  fecha: string;
};

function TareasPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;

  const [modal, setModal] = useState(false);
  const [urgenciaFiltro, setUrgenciaFiltro] = useState<"todas" | Urgencia>("todas");
  const [personaFiltro, setPersonaFiltro] = useState("todas");

  const personas = useQuery({
    queryKey: ["usuarios-activos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usuarios")
        .select("id, nombre, activo")
        .order("nombre");
      if (error) throw error;
      return (data ?? []).filter((u) => u.activo);
    },
  });

  const tareas = useQuery({
    queryKey: ["tareas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tareas")
        .select("id, titulo, descripcion, urgencia, tipo, asignado_id, created_by, hecha, fecha")
        .order("fecha", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Tarea[];
    },
  });

  const nombre = (id?: string | null) =>
    id ? ((personas.data ?? []).find((p) => p.id === id)?.nombre ?? "—") : "Sin asignar";

  const filtradas = useMemo(() => {
    return (tareas.data ?? []).filter((t) => {
      if (urgenciaFiltro !== "todas" && t.urgencia !== urgenciaFiltro) return false;
      if (personaFiltro === "sin" && t.asignado_id) return false;
      if (personaFiltro !== "todas" && personaFiltro !== "sin" && t.asignado_id !== personaFiltro)
        return false;
      return true;
    });
  }, [tareas.data, urgenciaFiltro, personaFiltro]);

  const pendientes = filtradas
    .filter((t) => !t.hecha)
    .sort(
      (a, b) =>
        (ORDEN_URGENCIA[a.urgencia] ?? 3) - (ORDEN_URGENCIA[b.urgencia] ?? 3) ||
        new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
    );
  const hechas = filtradas.filter((t) => t.hecha);

  const alternar = async (t: Tarea) => {
    if (!puedeCerrarTarea(t, usuario?.id ?? null, rol)) {
      toast.error("Solo quien la tiene asignada, quien la creó o una jefatura puede cerrarla");
      return;
    }
    const { error } = await supabase.from("tareas").update({ hecha: !t.hecha }).eq("id", t.id);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    toast.success(t.hecha ? "Tarea reabierta" : "Tarea marcada como hecha");
    void tareas.refetch();
  };

  const Tarjeta = ({ t }: { t: Tarea }) => {
    const info = URGENCIA_INFO[t.urgencia as Urgencia] ?? URGENCIA_INFO.media;
    const puede = puedeCerrarTarea(t, usuario?.id ?? null, rol);
    return (
      <article
        className={cn(
          "glass p-4 transition-colors duration-200 hover:bg-white/[0.07]",
          t.hecha && "opacity-70",
        )}
      >
        <div className="flex items-start gap-3">
          <button
            onClick={() => void alternar(t)}
            disabled={!puede}
            aria-label={t.hecha ? "Reabrir tarea" : "Marcar hecha"}
            className={cn(
              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors duration-200",
              t.hecha
                ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                : "border-white/15 bg-white/[0.04] hover:border-[var(--accent-store)]/60",
              !puede && "cursor-not-allowed opacity-50",
            )}
          >
            {t.hecha && <Check className="size-3.5" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className={cn("text-sm font-medium", t.hecha && "line-through")}>{t.titulo}</h3>
              <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn("size-2 rounded-full", info.punto)} />
                {info.label}
              </span>
            </div>
            {t.descripcion && (
              <p className="mt-1 text-[12px] text-muted-foreground">{t.descripcion}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-full border border-white/[0.08] px-2 py-0.5">
                {nombre(t.asignado_id)}
              </span>
              {t.tipo && (
                <span className="rounded-full border border-white/[0.08] px-2 py-0.5">{t.tipo}</span>
              )}
              <span className="num">{fechaHoraCorta(t.fecha)}</span>
            </div>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="mx-auto max-w-[86rem] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Tareas</h1>
          <p className="mt-1 text-sm text-muted-foreground">{DESC}</p>
        </div>
        <Button onClick={() => setModal(true)}>
          <Plus className="size-4" /> Nueva tarea
        </Button>
      </div>

      <div className="glass flex flex-wrap items-center gap-3 p-4">
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {(["todas", ...URGENCIAS.map((u) => u.valor)] as const).map((v) => (
            <button
              key={v}
              onClick={() => setUrgenciaFiltro(v as "todas" | Urgencia)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs capitalize transition-colors duration-200",
                urgenciaFiltro === v
                  ? "bg-white/[0.08] text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "todas" ? "Todas" : URGENCIA_INFO[v as Urgencia].label}
            </button>
          ))}
        </div>
        <select
          className={campo}
          value={personaFiltro}
          onChange={(e) => setPersonaFiltro(e.target.value)}
        >
          <option value="todas" className="bg-[#16131F]">
            Todas las personas
          </option>
          <option value="sin" className="bg-[#16131F]">
            Sin asignar
          </option>
          {(personas.data ?? []).map((p) => (
            <option key={p.id} value={p.id} className="bg-[#16131F]">
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold">Pendientes</h2>
            <span className="num rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-muted-foreground">
              {pendientes.length}
            </span>
          </div>
          {pendientes.map((t) => (
            <Tarjeta key={t.id} t={t} />
          ))}
          {pendientes.length === 0 && (
            <p className="glass p-6 text-center text-sm text-muted-foreground">
              {tareas.isLoading ? "Cargando…" : "Sin pendientes con esos filtros."}
            </p>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold">Hechas</h2>
            <span className="num rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-muted-foreground">
              {hechas.length}
            </span>
          </div>
          {hechas.map((t) => (
            <Tarjeta key={t.id} t={t} />
          ))}
          {hechas.length === 0 && (
            <p className="glass p-6 text-center text-sm text-muted-foreground">
              Todavía nada terminado.
            </p>
          )}
        </section>
      </div>

      <NuevaTareaModal
        abierto={modal}
        onCerrar={() => setModal(false)}
        onGuardado={() => void tareas.refetch()}
        personas={personas.data ?? []}
        usuarioId={usuario?.id ?? null}
      />
    </div>
  );
}
