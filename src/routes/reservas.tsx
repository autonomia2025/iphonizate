import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/reservas")({
  head: () => ({
    meta: [
      { title: "Reservas · riff store OS" },
      { name: "description", content: "Equipos apartados por clientes, abonos y vencimientos." },
      { property: "og:title", content: "Reservas · riff store OS" },
      { property: "og:description", content: "Equipos apartados por clientes, abonos y vencimientos." },
    ],
  }),
  component: () => <SectionPage titulo="Reservas" descripcion="Equipos apartados por clientes, abonos y vencimientos." />,
});
