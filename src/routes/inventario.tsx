import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/inventario")({
  head: () => ({
    meta: [
      { title: "Inventario · riff store OS" },
      { name: "description", content: "Ingreso de equipos usados, costos, estado y fotos por IMEI." },
      { property: "og:title", content: "Inventario · riff store OS" },
      { property: "og:description", content: "Ingreso de equipos usados, costos, estado y fotos por IMEI." },
    ],
  }),
  component: () => <SectionPage titulo="Inventario" descripcion="Ingreso de equipos usados, costos, estado y fotos por IMEI." />,
});
