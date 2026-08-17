import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/vender")({
  head: () => ({
    meta: [
      { title: "Vender · riff store OS" },
      { name: "description", content: "Punto de venta para registrar equipos, accesorios y formas de pago." },
      { property: "og:title", content: "Vender · riff store OS" },
      { property: "og:description", content: "Punto de venta para registrar equipos, accesorios y formas de pago." },
    ],
  }),
  component: () => <SectionPage titulo="Vender" descripcion="Punto de venta para registrar equipos, accesorios y formas de pago." />,
});
