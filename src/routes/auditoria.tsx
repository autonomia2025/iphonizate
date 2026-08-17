import { createFileRoute } from "@tanstack/react-router";
import { SectionPage } from "@/components/SectionPage";

export const Route = createFileRoute("/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoría · riff store OS" },
      { name: "description", content: "Registro de cambios de precio, stock y accesos." },
      { property: "og:title", content: "Auditoría · riff store OS" },
      { property: "og:description", content: "Registro de cambios de precio, stock y accesos." },
    ],
  }),
  component: () => <SectionPage titulo="Auditoría" descripcion="Registro de cambios de precio, stock y accesos." />,
});
