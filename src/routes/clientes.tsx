import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes · riff store OS" },
      { name: "description", content: "Historial de compras, garantías y contacto." },
      { property: "og:title", content: "Clientes · riff store OS" },
      { property: "og:description", content: "Historial de compras, garantías y contacto." },
    ],
  }),
  component: () => <SectionPage titulo="Clientes" descripcion="Historial de compras, garantías y contacto." />,
});
