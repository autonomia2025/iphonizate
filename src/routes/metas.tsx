import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/metas")({
  head: () => ({
    meta: [
      { title: "Metas · riff store OS" },
      { name: "description", content: "Metas mensuales por tienda y por vendedor." },
      { property: "og:title", content: "Metas · riff store OS" },
      { property: "og:description", content: "Metas mensuales por tienda y por vendedor." },
    ],
  }),
  component: () => <SectionPage titulo="Metas" descripcion="Metas mensuales por tienda y por vendedor." />,
});
