import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/reportes")({
  head: () => ({
    meta: [
      { title: "Reportes · riff store OS" },
      { name: "description", content: "Ventas, margen y rotación por período y tienda." },
      { property: "og:title", content: "Reportes · riff store OS" },
      { property: "og:description", content: "Ventas, margen y rotación por período y tienda." },
    ],
  }),
  component: () => <SectionPage titulo="Reportes" descripcion="Ventas, margen y rotación por período y tienda." />,
});
