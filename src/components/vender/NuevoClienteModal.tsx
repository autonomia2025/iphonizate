import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const campo =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";
const etiqueta = "mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground";

export type ClienteBasico = {
  id: string;
  nombre: string;
  telefono: string | null;
};

export function NuevoClienteModal({
  abierto,
  onCerrar,
  onCreado,
  telefonoInicial = "",
  nombreInicial = "",
}: {
  abierto: boolean;
  onCerrar: () => void;
  onCreado: (cliente: ClienteBasico) => void;
  telefonoInicial?: string;
  nombreInicial?: string;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [telefono, setTelefono] = useState(telefonoInicial);
  const [correo, setCorreo] = useState("");
  const [instagram, setInstagram] = useState("");
  const [guardando, setGuardando] = useState(false);

  if (!abierto) return null;

  const guardar = async () => {
    if (!nombre.trim()) {
      toast.error("El nombre del cliente es obligatorio");
      return;
    }
    setGuardando(true);
    try {
      if (telefono.trim()) {
        const { data: existente } = await supabase
          .from("clientes")
          .select("id, nombre, telefono")
          .eq("telefono", telefono.trim())
          .maybeSingle();
        if (existente) {
          toast.info(`Ese teléfono ya es de ${existente.nombre}, lo asignamos a la venta`);
          onCreado(existente as ClienteBasico);
          onCerrar();
          return;
        }
      }
      const { data, error } = await supabase
        .from("clientes")
        .insert({
          nombre: nombre.trim(),
          telefono: telefono.trim() || null,
          correo: correo.trim() || null,
          instagram: instagram.trim() || null,
        })
        .select("id, nombre, telefono")
        .single();
      if (error) throw error;
      toast.success("Cliente creado");
      onCreado(data as ClienteBasico);
      onCerrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el cliente");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCerrar} />
      <div className="glass relative z-10 w-full max-w-md rounded-2xl p-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg text-foreground">Cliente nuevo</h2>
            <p className="text-xs text-muted-foreground">Datos de contacto para la venta</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={etiqueta} htmlFor="cli-nombre">
              Nombre
            </label>
            <input
              id="cli-nombre"
              className={campo}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={etiqueta} htmlFor="cli-tel">
                Teléfono
              </label>
              <input
                id="cli-tel"
                className={campo}
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+56 9 ..."
              />
            </div>
            <div>
              <label className={etiqueta} htmlFor="cli-ig">
                Instagram
              </label>
              <input
                id="cli-ig"
                className={campo}
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@cuenta"
              />
            </div>
          </div>
          <div>
            <label className={etiqueta} htmlFor="cli-correo">
              Correo
            </label>
            <input
              id="cli-correo"
              className={campo}
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            onClick={guardar}
            disabled={guardando}
            className="bg-[var(--accent-store)] text-white hover:bg-[var(--accent-store)]/90"
          >
            {guardando ? "Guardando..." : "Crear cliente"}
          </Button>
        </div>
      </div>
    </div>
  );
}
