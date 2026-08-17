import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/caja")({
  head: () => ({
    meta: [
      { title: "Caja · riff store OS" },
      { name: "description", content: "Apertura, cierre y arqueo diario por tienda." },
      { property: "og:title", content: "Caja · riff store OS" },
      { property: "og:description", content: "Apertura, cierre y arqueo diario por tienda." },
    ],
  }),
  component: () => <SectionPage titulo="Caja" descripcion="Apertura, cierre y arqueo diario por tienda." />,
});
