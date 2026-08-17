import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/tareas")({
  head: () => ({
    meta: [
      { title: "Tareas · riff store OS" },
      { name: "description", content: "Pendientes del equipo, checklists de apertura y cierre." },
      { property: "og:title", content: "Tareas · riff store OS" },
      { property: "og:description", content: "Pendientes del equipo, checklists de apertura y cierre." },
    ],
  }),
  component: () => <SectionPage titulo="Tareas" descripcion="Pendientes del equipo, checklists de apertura y cierre." />,
});
