import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, Trash2, Usb } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CopiarLinea,
  InstruccionesLector,
  lineaInstalador,
} from "@/components/lector/InstruccionesLector";
import {
  crearAgenteLector,
  regenerarClaveLector,
  revocarAgenteLector,
} from "@/lib/lector.functions";
import { ESTADO_LECTOR_ETIQUETA, agenteVivo, type EstadoLector } from "@/lib/lector";

const selectClase =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

const fecha = (v?: string | null) =>
  v ? new Date(v).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : "—";

export function PanelLectores({ puedeEditar }: { puedeEditar: boolean }) {
  const crear = useServerFn(crearAgenteLector);
  const regenerar = useServerFn(regenerarClaveLector);
  const revocar = useServerFn(revocarAgenteLector);

  const [nombre, setNombre] = useState("");
  const [tiendaId, setTiendaId] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [claveNueva, setClaveNueva] = useState<{ nombre: string; clave: string } | null>(null);

  const tiendas = useQuery({
    queryKey: ["tiendas-lector"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tiendas").select("id, nombre").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const agentes = useQuery({
    queryKey: ["lector-agentes"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lector_agentes")
        .select(
          "id, nombre, tienda_id, estado, detalle_estado, version, hostname, ultimo_latido, ultima_lectura, activo",
        )
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const nombreTienda = (id: string) => tiendas.data?.find((t) => t.id === id)?.nombre ?? "—";

  const registrar = async () => {
    if (nombre.trim().length < 2 || !tiendaId) {
      toast.error("Indica el nombre del Mac y la tienda.");
      return;
    }
    setTrabajando(true);
    try {
      const r = await crear({ data: { nombre: nombre.trim(), tiendaId } });
      if (!r.ok) {
        toast.error(r.mensaje);
        return;
      }
      setClaveNueva({ nombre: r.nombre, clave: r.clave });
      setNombre("");
      void agentes.refetch();
      toast.success("Mac agregado", { description: "Copia la clave ahora: no se vuelve a mostrar." });
    } finally {
      setTrabajando(false);
    }
  };

  const nuevaClave = async (id: string, nombreAgente: string) => {
    setTrabajando(true);
    try {
      const r = await regenerar({ data: { id } });
      if (!r.ok) {
        toast.error(r.mensaje);
        return;
      }
      setClaveNueva({ nombre: nombreAgente, clave: r.clave });
      void agentes.refetch();
      toast.success("Clave nueva generada", { description: "La anterior dejó de servir." });
    } finally {
      setTrabajando(false);
    }
  };

  const quitar = async (id: string, nombreAgente: string) => {
    setTrabajando(true);
    try {
      const r = await revocar({ data: { id } });
      if (!r.ok) {
        toast.error(r.mensaje);
        return;
      }
      void agentes.refetch();
      toast.success(`${nombreAgente} quedó sin acceso`);
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <Usb className="size-4 text-[var(--accent-store)]" />
        <h3 className="font-display text-sm font-semibold">Macs lectores (lectura por USB)</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Los Mac del mostrador con el lector instalado leen el iPhone conectado y llenan el ingreso
        solo.
      </p>

      {puedeEditar && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="lector-nombre">Nombre del Mac</Label>
            <Input
              id="lector-nombre"
              className="mt-1"
              placeholder="ej: Mostrador 1"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="lector-tienda">Tienda</Label>
            <select
              id="lector-tienda"
              className={`${selectClase} mt-1`}
              value={tiendaId}
              onChange={(e) => setTiendaId(e.target.value)}
            >
              <option value="">Selecciona…</option>
              {tiendas.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" onClick={() => void registrar()} disabled={trabajando}>
            {trabajando ? <Loader2 className="size-4 animate-spin" /> : "Agregar Mac"}
          </Button>
        </div>
      )}

      {claveNueva && (
        <div className="mt-3 space-y-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          <div>
            <p className="font-medium">Clave de {claveNueva.nombre}</p>
            <p className="mt-0.5 opacity-80">
              Cópiala ahora: no se vuelve a mostrar nunca más. Si la pierdes, genera una nueva con
              “Clave nueva”.
            </p>
            <div className="mt-2">
              <CopiarLinea linea={claveNueva.clave} />
            </div>
          </div>
          <div>
            <p className="font-medium">Línea de instalación para ese Mac</p>
            <div className="mt-2">
              <CopiarLinea linea={lineaInstalador()} />
            </div>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setClaveNueva(null)}>
            Ya la copié
          </Button>
        </div>
      )}

      <div className="mt-5 overflow-x-auto rounded-xl border border-white/8 bg-[#16131F]">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-white/8">
              <th className="px-3 py-2 text-left font-medium">Mac</th>
              <th className="px-3 py-2 text-left font-medium">Tienda</th>
              <th className="px-3 py-2 text-left font-medium">Estado</th>
              <th className="px-3 py-2 text-left font-medium">Último latido</th>
              <th className="px-3 py-2 text-left font-medium">Versión</th>
              {puedeEditar && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {(agentes.data ?? []).map((a) => {
              const vivo = a.activo && agenteVivo(a.ultimo_latido);
              const estado: EstadoLector = vivo
                ? ((a.estado as EstadoLector) ?? "sin_equipo")
                : "sin_contacto";
              return (
                <tr
                  key={a.id}
                  className="border-b border-white/5 transition-colors duration-200 hover:bg-white/[0.03]"
                >
                  <td className="px-3 py-2">
                    {a.nombre}
                    {a.hostname && (
                      <span className="block text-[11px] text-muted-foreground">{a.hostname}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{nombreTienda(a.tienda_id)}</td>
                  <td className="px-3 py-2">
                    {a.activo ? (
                      <span className={vivo ? "text-emerald-300" : "text-muted-foreground"}>
                        {ESTADO_LECTOR_ETIQUETA[estado]}
                      </span>
                    ) : (
                      <span className="text-red-300">Revocado</span>
                    )}
                  </td>
                  <td className="num px-3 py-2">{fecha(a.ultimo_latido)}</td>
                  <td className="num px-3 py-2">{a.version ?? "—"}</td>
                  {puedeEditar && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={trabajando}
                        onClick={() => void nuevaClave(a.id, a.nombre)}
                      >
                        <KeyRound className="mr-1 size-3.5" /> Clave nueva
                      </Button>
                      {a.activo && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-red-300 hover:text-red-200"
                          disabled={trabajando}
                          onClick={() => void quitar(a.id, a.nombre)}
                        >
                          <Trash2 className="mr-1 size-3.5" /> Revocar
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {!agentes.isLoading && (agentes.data ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={puedeEditar ? 6 : 5}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Todavía no hay ningún Mac con lector registrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Cómo instalar el lector en un Mac
        </p>
        <div className="mt-3">
          <InstruccionesLector conEnlaceConfig={false} />
        </div>
      </div>
    </section>
  );
}
