import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Copy, Download, Settings2, Terminal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Línea exacta que se pega en la Terminal del Mac. */
export function lineaInstalador() {
  const origen = typeof window === "undefined" ? "" : window.location.origin;
  return `curl -fsSL ${origen}/api/public/lector/instalar.sh | bash`;
}

export function CopiarLinea({ linea, id }: { linea: string; id?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code
        id={id}
        className="num min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs"
      >
        {linea}
      </code>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(linea);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          } catch {
            toast.error("No pudimos copiar. Selecciónalo a mano.");
          }
        }}
      >
        {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

/** Pasos para alguien que nunca abrió la Terminal. */
export function InstruccionesLector({ conEnlaceConfig = true }: { conEnlaceConfig?: boolean }) {
  const linea = lineaInstalador();
  return (
    <div className="space-y-4 text-xs">
      <ol className="space-y-3">
        <Paso n={1} titulo="Ten lista la clave de la tienda">
          La genera Dirección en Configuración → Macs lectores, con el botón “Agregar Mac”. Es una
          línea larga de letras y números; cópiala antes de empezar porque se muestra una sola vez.
          {conEnlaceConfig && (
            <Link
              to="/configuracion"
              className="mt-1.5 inline-flex items-center gap-1 text-[var(--accent-store)] underline-offset-2 hover:underline"
            >
              <Settings2 className="size-3.5" /> Ir a Configuración
            </Link>
          )}
        </Paso>
        <Paso n={2} titulo="Abre la Terminal del Mac">
          Aprieta <Tecla>Cmd</Tecla> + <Tecla>Espacio</Tecla>, escribe <b>Terminal</b> y aprieta{" "}
          <Tecla>Enter</Tecla>. Se abre una ventana negra con texto: eso es la Terminal.
        </Paso>
        <Paso n={3} titulo="Pega esta línea y aprieta Enter">
          <div className="mt-1.5">
            <CopiarLinea linea={linea} />
          </div>
          <span className="mt-1.5 block opacity-70">
            Para pegar en la Terminal usa <Tecla>Cmd</Tecla> + <Tecla>V</Tecla>.
          </span>
        </Paso>
        <Paso n={4} titulo="Pega la clave de la tienda cuando la pida">
          Cuando diga <i>“Pega la clave que te dio la oficina”</i>, pega la clave y aprieta{" "}
          <Tecla>Enter</Tecla>. El instalador la comprueba con el servidor: si no sirve, te la vuelve
          a pedir y no instala nada a medias. Después pide un nombre para este Mac (por ejemplo{" "}
          <b>Mostrador 1</b>); si aprietas <Tecla>Enter</Tecla> usa el nombre del computador.
        </Paso>
        <Paso n={5} titulo="Espera a que diga “✓ Listo”">
          El instalador baja todo lo que necesita y al final prueba las herramientas de lectura en
          este Mac. Si la prueba falla te lo dice y no deja nada a medias.
        </Paso>
        <Paso n={6} titulo="Listo: conecta el iPhone">
          Conéctalo con cable, desbloquéalo y toca <b>Confiar</b> en la pantalla del iPhone. Los
          datos aparecen solos en el ingreso de equipos.
        </Paso>
      </ol>

      <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-2.5 text-emerald-100">
        La instalación <b>no pide la contraseña del Mac</b> y no necesita permisos de administrador:
        todo queda dentro de tu carpeta personal. Puede tardar unos minutos porque descarga las
        herramientas para leer el iPhone. Deja la Terminal abierta hasta que diga <b>“✓ Listo”</b>.
      </p>

      <p className="opacity-60">
        El lector usa software libre (libimobiledevice, libplist, libusbmuxd, libtatsu, libtasn1 y
        OpenSSL) descargado del repositorio público de paquetes de Mac, y Node.js desde nodejs.org.
      </p>

    </div>
  );
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[var(--accent-store)]/20 text-[11px] font-semibold text-[var(--accent-store)]">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{titulo}</p>
        <div className="mt-0.5 text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-white/15 bg-white/10 px-1 py-0.5 text-[10px] text-foreground">
      {children}
    </kbd>
  );
}

/** Botón + panel con las instrucciones (para el modal de ingreso). */
export function BotonInstalarLector() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setAbierto(true)}>
        <Download className="mr-1 size-3.5" /> Instalar lector
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="modal-rapido glass max-h-[85vh] overflow-y-auto border-white/10 bg-white/5 backdrop-blur-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-base">
              <Terminal className="size-4 text-[var(--accent-store)]" /> Instalar el lector en este
              Mac
            </DialogTitle>
          </DialogHeader>
          <InstruccionesLector />
        </DialogContent>
      </Dialog>
    </>
  );
}
