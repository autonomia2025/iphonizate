import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/garantias")({
  head: () => ({
    meta: [
      { title: "Garantías · riff store OS" },
      { name: "description", content: "Solicitudes de garantía, plazos y resoluciones." },
      { property: "og:title", content: "Garantías · riff store OS" },
      { property: "og:description", content: "Solicitudes de garantía, plazos y resoluciones." },
    ],
  }),
  component: () => <SectionPage titulo="Garantías" descripcion="Solicitudes de garantía, plazos y resoluciones." />,
});
