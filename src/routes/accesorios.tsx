import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/accesorios")({
  head: () => ({
    meta: [
      { title: "Accesorios · riff store OS" },
      { name: "description", content: "Fundas, láminas, cables y cargadores con control de stock." },
      { property: "og:title", content: "Accesorios · riff store OS" },
      { property: "og:description", content: "Fundas, láminas, cables y cargadores con control de stock." },
    ],
  }),
  component: () => <SectionPage titulo="Accesorios" descripcion="Fundas, láminas, cables y cargadores con control de stock." />,
});
