import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/precios")({
  head: () => ({
    meta: [
      { title: "Precios · riff store OS" },
      { name: "description", content: "Listas de precios por modelo, margen objetivo y descuentos." },
      { property: "og:title", content: "Precios · riff store OS" },
      { property: "og:description", content: "Listas de precios por modelo, margen objetivo y descuentos." },
    ],
  }),
  component: () => <SectionPage titulo="Precios" descripcion="Listas de precios por modelo, margen objetivo y descuentos." />,
});
