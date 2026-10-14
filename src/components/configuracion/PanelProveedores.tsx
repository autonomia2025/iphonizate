import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { CLAVE_PROVEEDORES } from "@/lib/proveedores";

type Fila = { id: string; nombre: string; activo: boolean; equipos: number };

const campo =
  "h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-[var(--accent-store)]/60";
const boton =
  "rounded-full border border-white/10 px-3 py-1 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground disabled:opacity-50";

/** Lista oficial de proveedores: renombrar, unir los que son el mismo y ocultar los que ya no se usan. */
export function PanelProveedores({ puedeEditar }: { puedeEditar: boolean }) {
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState("");
  const [renombrando, setRenombrando] = useState<{ id: string; nombre: string } | null>(null);
  const [uniendo, setUniendo] = useState<{ id: string; destino: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const lista = useQuery({
    queryKey: ["proveedores-config"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listar_proveedores");
      if (error) throw error;
      return ((data ?? []) as unknown as Fila[]).map((f) => ({ ...f, equipos: Number(f.equipos) }));
    },
  });

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (lista.data ?? []).filter((f) => !q || f.nombre.toLowerCase().includes(q));
  }, [lista.data, busqueda]);

  const refrescar = () => {
    void lista.refetch();
    void queryClient.invalidateQueries({ queryKey: CLAVE_PROVEEDORES });
  };

  const ejecutar = async (
    accion: () => PromiseLike<{ error: { message: string } | null }>,
    exito: string,
  ) => {
    setTrabajando(true);
    const { error } = await accion();
    setTrabajando(false);
    if (error) {
      toast.error("No se pudo guardar", { description: error.message.replace(/^.*?:\s*/, "") });
      return false;
    }
    toast.success(exito);
    refrescar();
    return true;
  };

  const guardarNombre = async () => {
    if (!renombrando) return;
    const ok = await ejecutar(
      () =>
        supabase.rpc("renombrar_proveedor", { _id: renombrando.id, _nombre: renombrando.nombre }),
      "Proveedor renombrado: sus equipos ya tienen el nombre nuevo",
    );
    if (ok) setRenombrando(null);
  };

  const unir = async (origen: Fila) => {
    if (!uniendo?.destino) return;
    const destino = (lista.data ?? []).find((f) => f.id === uniendo.destino);
    if (!destino) return;
    if (
      !window.confirm(
        `¿Unir "${origen.nombre}" en "${destino.nombre}"?\n\nSus ${origen.equipos} equipo(s) quedarán con "${destino.nombre}" y "${origen.nombre}" desaparece de la lista.`,
      )
    )
      return;
    const ok = await ejecutar(
      () => supabase.rpc("unir_proveedores", { _origen: origen.id, _destino: destino.id }),
      `"${origen.nombre}" unido en "${destino.nombre}"`,
    );
    if (ok) setUniendo(null);
  };

  return (
    <section className="glass p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg">Proveedores</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Al ingresar un equipo el proveedor se elige de esta lista. Si un mismo proveedor aparece
            dos veces con nombres distintos, usa <span className="text-foreground">Unir con</span>.
          </p>
        </div>
        <input
          className={`${campo} max-w-60`}
          placeholder="Buscar proveedor"
          aria-label="Buscar proveedor"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="solid-panel mt-4 max-h-[28rem] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#16131F]">
            <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Proveedor</th>
              <th className="px-3 py-2 text-right font-medium">Equipos</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              {puedeEditar && <th className="px-3 py-2 font-medium">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-b border-white/5 align-top last:border-0">
                <td className="px-3 py-2">
                  {renombrando?.id === f.id ? (
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        className={campo}
                        value={renombrando.nombre}
                        maxLength={60}
                        aria-label="Nombre nuevo"
                        onChange={(e) => setRenombrando({ id: f.id, nombre: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && void guardarNombre()}
                      />
                      <button
                        type="button"
                        className={boton}
                        disabled={trabajando}
                        onClick={() => void guardarNombre()}
                      >
                        Guardar
                      </button>
                      <button type="button" className={boton} onClick={() => setRenombrando(null)}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    f.nombre
                  )}
                  {uniendo?.id === f.id && (
                    <div className="mt-2 flex gap-2">
                      <select
                        className={campo}
                        aria-label="Unir con"
                        value={uniendo.destino}
                        onChange={(e) => setUniendo({ id: f.id, destino: e.target.value })}
                      >
                        <option value="">Unir con…</option>
                        {(lista.data ?? [])
                          .filter((o) => o.id !== f.id)
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.nombre}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className={boton}
                        disabled={trabajando || !uniendo.destino}
                        onClick={() => void unir(f)}
                      >
                        Unir
                      </button>
                      <button type="button" className={boton} onClick={() => setUniendo(null)}>
                        Cancelar
                      </button>
                    </div>
                  )}
                </td>
                <td className="num px-3 py-2 text-right">{f.equipos}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {f.activo ? "Activo" : "Oculto"}
                </td>
                {puedeEditar && (
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className={boton}
                        onClick={() => {
                          setUniendo(null);
                          setRenombrando({ id: f.id, nombre: f.nombre });
                        }}
                      >
                        Renombrar
                      </button>
                      <button
                        type="button"
                        className={boton}
                        onClick={() => {
                          setRenombrando(null);
                          setUniendo({ id: f.id, destino: "" });
                        }}
                      >
                        Unir con
                      </button>
                      <button
                        type="button"
                        className={boton}
                        disabled={trabajando}
                        onClick={() =>
                          void ejecutar(
                            () =>
                              supabase.rpc("activar_proveedor", { _id: f.id, _activo: !f.activo }),
                            f.activo
                              ? `"${f.nombre}" ya no aparece al ingresar`
                              : `"${f.nombre}" vuelve a aparecer`,
                          )
                        }
                      >
                        {f.activo ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {lista.isLoading && <p className="p-4 text-sm text-muted-foreground">Cargando…</p>}
        {lista.isError && (
          <p className="p-4 text-sm text-red-300">
            No se pudo cargar la lista. ¿Ya se corrió el SQL de proveedores?
          </p>
        )}
      </div>
    </section>
  );
}
