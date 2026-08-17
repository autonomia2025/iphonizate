import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/stock")({
  head: () => ({
    meta: [
      { title: "Stock · riff store OS" },
      { name: "description", content: "Equipos disponibles por tienda, con batería, capacidad y precio de lista." },
      { property: "og:title", content: "Stock · riff store OS" },
      { property: "og:description", content: "Equipos disponibles por tienda, con batería, capacidad y precio de lista." },
    ],
  }),
  component: () => <SectionPage titulo="Stock" descripcion="Equipos disponibles por tienda, con batería, capacidad y precio de lista." />,
});
