import { createFileRoute } from "@tanstack/react-router";

import { useAuth } from "@/components/AuthContext";
import { PanelLectores } from "@/components/configuracion/PanelLectores";

const DESC = "Configuración de los Mac lectores que leen los equipos por USB.";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Configuración · iPhonizate OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfiguracionPage,
});

function ConfiguracionPage() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.rol === "direccion";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl">Configuración</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Los Mac que leen los equipos por USB.
        </p>
      </header>

      <PanelLectores puedeEditar={puedeEditar} />
    </div>
  );
}
