import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/tecnico")({
  head: () => ({
    meta: [
      { title: "Técnico · riff store OS" },
      { name: "description", content: "Órdenes de servicio, repuestos y tiempos de reparación." },
      { property: "og:title", content: "Técnico · riff store OS" },
      { property: "og:description", content: "Órdenes de servicio, repuestos y tiempos de reparación." },
    ],
  }),
  component: () => <SectionPage titulo="Técnico" descripcion="Órdenes de servicio, repuestos y tiempos de reparación." />,
});
