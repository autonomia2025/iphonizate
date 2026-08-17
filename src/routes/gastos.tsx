import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/gastos")({
  head: () => ({
    meta: [
      { title: "Gastos · riff store OS" },
      { name: "description", content: "Arriendos, remuneraciones, publicidad y gastos operativos." },
      { property: "og:title", content: "Gastos · riff store OS" },
      { property: "og:description", content: "Arriendos, remuneraciones, publicidad y gastos operativos." },
    ],
  }),
  component: () => <SectionPage titulo="Gastos" descripcion="Arriendos, remuneraciones, publicidad y gastos operativos." />,
});
