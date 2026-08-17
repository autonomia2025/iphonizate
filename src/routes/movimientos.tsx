import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/movimientos")({
  head: () => ({
    meta: [
      { title: "Movimientos · riff store OS" },
      { name: "description", content: "Traslados entre tiendas y bodega, con trazabilidad por equipo." },
      { property: "og:title", content: "Movimientos · riff store OS" },
      { property: "og:description", content: "Traslados entre tiendas y bodega, con trazabilidad por equipo." },
    ],
  }),
  component: () => <SectionPage titulo="Movimientos" descripcion="Traslados entre tiendas y bodega, con trazabilidad por equipo." />,
});
