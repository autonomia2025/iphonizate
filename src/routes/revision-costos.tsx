import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Search, Upload } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ESTADO_ETIQUETA } from "@/lib/inventario";
import { formatCLP } from "@/lib/stores";
import {
  GRAVEDAD_ETIQUETA,
  exportarExcelRevision,
  leerExcelRevision,
  revisarCostos,
  type EquipoCosto,
  type Gravedad,
  type LecturaRevision,
} from "@/lib/revisionCostos";
import { cn } from "@/lib/utils";

const DESC =
  "Costos de compra de los equipos en stock y vendidos: los que faltan o parecen mal digitados, para corregirlos con un Excel.";

export const Route = createFileRoute("/revision-costos")({
  head: () => ({
    meta: [
      { title: "Revisión de costos · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Revisión de costos · iPhonizate OS" },
      { property: "og:description", content: DESC },
    ],
  }),
  component: RevisionCostosPage,
});

type Filtro = "revisar" | Gravedad | "todos";

const GRAVEDAD_CLASE: Record<Gravedad, string> = {
  sin_costo: "bg-red-500/15 text-red-300 border-red-400/25",
  digitacion: "bg-amber-500/15 text-amber-300 border-amber-400/25",
  fuera_de_rango: "bg-sky-500/15 text-sky-300 border-sky-400/25",
  ok: "bg-white/5 text-muted-foreground border-white/8",
};

/* La tabla en pantalla muestra hasta este número; el Excel lleva todos los del filtro */
const MAX_FILAS = 300;

const sinPrefijo = (m: string) => m.replace(/^.*?:\s*/, "");

function RevisionCostosPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const permitido = rol === "direccion" || rol === "administracion";
  const queryClient = useQueryClient();
  const archivoRef = useRef<HTMLInputElement>(null);

  const [filtro, setFiltro] = useState<Filtro>("revisar");
  const [busqueda, setBusqueda] = useState("");
  const [lectura, setLectura] = useState<LecturaRevision | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const datos = useQuery({
    queryKey: ["revision-costos"],
    enabled: permitido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("revision_costos_datos");
      if (error) throw error;
      return revisarCostos((data ?? []) as unknown as EquipoCosto[]);
    },
  });

  const equipos = useMemo(() => datos.data ?? [], [datos.data]);
  const cuenta = (g: Gravedad) => equipos.filter((e) => e.gravedad === g).length;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return equipos.filter(
      (e) =>
        (filtro === "todos" ||
          (filtro === "revisar" ? e.gravedad !== "ok" : e.gravedad === filtro)) &&
        (!q || e.imei.includes(q) || e.modelo.toLowerCase().includes(q)),
    );
  }, [equipos, filtro, busqueda]);

  if (!permitido) {
    return (
      <div className="mx-auto max-w-[86rem]">
        <h1 className="font-display text-2xl font-semibold">Revisión de costos</h1>
        <p className="glass mt-6 p-5 text-sm text-muted-foreground">
          Solo dirección y administración pueden revisar los costos.
        </p>
      </div>
    );
  }

  const subir = async (archivo: File) => {
    setLeyendo(true);
    try {
      const r = await leerExcelRevision(archivo, equipos);
      if (r.cambios.length === 0 && r.problemas.length === 0) {
        toast.info("No hay costos para cambiar", {
          description:
            r.sinCambio > 0
              ? "Los costos reales del archivo son iguales a los registrados."
              : 'La columna "Costo real" está vacía.',
        });
      } else {
        setLectura(r);
      }
    } catch (e) {
      toast.error("No se pudo leer el archivo", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLeyendo(false);
      if (archivoRef.current) archivoRef.current.value = "";
    }
  };

  const aplicar = async () => {
    if (!lectura || lectura.cambios.length === 0) return;
    setGuardando(true);
    const { data, error } = await supabase.rpc("revision_costos_aplicar", {
      _cambios: lectura.cambios.map((c) => ({ equipo_id: c.equipo.id, costo: c.costoNuevo })),
    });
    setGuardando(false);
    if (error) {
      toast.error("No se guardó ningún costo", { description: sinPrefijo(error.message) });
      return;
    }
    const r = (data ?? {}) as { actualizados?: number; ventas_ajustadas?: number };
    toast.success(`${r.actualizados ?? 0} costos corregidos`, {
      description: r.ventas_ajustadas
        ? `Se ajustó también la ganancia de ${r.ventas_ajustadas} venta${r.ventas_ajustadas === 1 ? "" : "s"}.`
        : undefined,
    });
    setLectura(null);
    void datos.refetch();
    void queryClient.invalidateQueries({ queryKey: ["v_stock"] });
  };

  const filtros: { id: Filtro; label: string; n: number }[] = [
    { id: "revisar", label: "Por revisar", n: equipos.length - cuenta("ok") },
    { id: "sin_costo", label: GRAVEDAD_ETIQUETA.sin_costo, n: cuenta("sin_costo") },
    { id: "digitacion", label: GRAVEDAD_ETIQUETA.digitacion, n: cuenta("digitacion") },
    { id: "fuera_de_rango", label: GRAVEDAD_ETIQUETA.fuera_de_rango, n: cuenta("fuera_de_rango") },
    { id: "todos", label: "Todos", n: equipos.length },
  ];

  return (
    <div className="mx-auto max-w-[86rem]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Revisión de costos</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{DESC}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="gap-2"
            disabled={visibles.length === 0}
            onClick={() => void exportarExcelRevision(visibles)}
          >
            <Download className="size-4" /> Descargar Excel
          </Button>
          <Button
            className="accent-glow gap-2"
            disabled={leyendo || !datos.data}
            onClick={() => archivoRef.current?.click()}
          >
            <Upload className="size-4" /> {leyendo ? "Leyendo…" : "Subir Excel"}
          </Button>
          <input
            ref={archivoRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void subir(f);
            }}
          />
        </div>
      </div>

      <p className="glass mt-5 p-4 text-sm text-muted-foreground">
        Descarga el Excel, escribe el costo correcto en la columna <b>Costo real</b> solo en los
        equipos que hay que corregir y súbelo. Antes de guardar se muestra cada cambio. El costo
        normal de cada modelo es lo que suele costar el mismo modelo y capacidad en el sistema.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {filtros.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-all duration-200",
              filtro === f.id
                ? "accent-glow border-[var(--accent-store)]/50 bg-[var(--accent-store-soft)] text-foreground"
                : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
            <span className="num ml-1.5 text-xs opacity-80">{f.n}</span>
          </button>
        ))}
        <label className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-9 w-full rounded-full border border-white/10 bg-white/[0.04] pl-9 pr-3 text-sm outline-none focus:border-[var(--accent-store)]/60"
            placeholder="Buscar IMEI o modelo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
      </div>

      <section className="solid-panel mt-4 overflow-x-auto">
        {datos.isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Revisando costos…</p>
        ) : datos.error ? (
          <p className="p-8 text-center text-sm text-red-300">
            {sinPrefijo((datos.error as Error).message)}
          </p>
        ) : visibles.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {filtro === "revisar" ? "Ningún costo con observaciones." : "Sin equipos."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Equipo</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
                <th className="px-4 py-3 text-left font-medium">Proveedor</th>
                <th className="px-4 py-3 text-right font-medium">Costo</th>
                <th className="px-4 py-3 text-right font-medium">Normal</th>
                <th className="px-4 py-3 text-right font-medium">Venta</th>
                <th className="px-4 py-3 text-left font-medium">Revisar</th>
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, MAX_FILAS).map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.035]"
                >
                  <td className="px-4 py-2.5">
                    <p>
                      {e.modelo}
                      {e.gb ? ` · ${e.gb} GB` : ""}
                      {e.color ? ` · ${e.color}` : ""}
                    </p>
                    <p className="num text-xs text-muted-foreground">{e.imei}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <p>{ESTADO_ETIQUETA[e.estado] ?? e.estado}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.estado === "VENDIDO" ? e.tienda_venta : e.ubicacion}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{e.proveedor ?? "—"}</td>
                  <td className="num px-4 py-2.5 text-right font-semibold">
                    {e.costo > 0 ? formatCLP(e.costo) : "—"}
                  </td>
                  <td className="num px-4 py-2.5 text-right text-muted-foreground">
                    {e.referencia ? formatCLP(e.referencia) : "—"}
                  </td>
                  <td className="num px-4 py-2.5 text-right text-muted-foreground">
                    {e.precio_venta != null ? formatCLP(e.precio_venta) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs",
                        GRAVEDAD_CLASE[e.gravedad],
                      )}
                    >
                      {GRAVEDAD_ETIQUETA[e.gravedad]}
                    </span>
                    {e.observaciones.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {e.observaciones.join(" · ")}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {visibles.length > MAX_FILAS && (
          <p className="border-t border-white/8 px-4 py-2.5 text-xs text-muted-foreground">
            Se muestran {MAX_FILAS} de {visibles.length}. El Excel lleva los {visibles.length}.
          </p>
        )}
      </section>

      {lectura && (
        <Dialog open onOpenChange={(v) => !v && !guardando && setLectura(null)}>
          <DialogContent className="modal-rapido glass max-h-[90vh] overflow-y-auto border-white/10 bg-white/5 backdrop-blur-2xl sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="font-display text-lg">Confirmar costos del Excel</DialogTitle>
            </DialogHeader>
            <p className="-mt-2 text-sm text-muted-foreground">
              {lectura.cambios.length} costo{lectura.cambios.length === 1 ? "" : "s"} por cambiar
              {lectura.sinCambio > 0 ? ` · ${lectura.sinCambio} iguales al registrado` : ""}
              {lectura.problemas.length > 0
                ? ` · ${lectura.problemas.length} filas con problemas`
                : ""}
            </p>

            {lectura.cambios.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-white/8">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Equipo</th>
                      <th className="px-3 py-2 text-right font-medium">Antes</th>
                      <th className="px-3 py-2 text-right font-medium">Ahora</th>
                      <th className="px-3 py-2 text-right font-medium">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lectura.cambios.map((c) => (
                      <tr key={c.equipo.id} className="border-b border-white/5 last:border-0">
                        <td className="px-3 py-2">
                          <p>
                            {c.equipo.modelo}
                            {c.equipo.gb ? ` · ${c.equipo.gb} GB` : ""}
                          </p>
                          <p className="num text-xs text-muted-foreground">
                            {c.equipo.imei}
                            {c.equipo.estado === "VENDIDO"
                              ? " · vendido: se ajusta la ganancia"
                              : ""}
                          </p>
                        </td>
                        <td className="num px-3 py-2 text-right text-muted-foreground">
                          {c.equipo.costo > 0 ? formatCLP(c.equipo.costo) : "—"}
                        </td>
                        <td className="num px-3 py-2 text-right font-semibold">
                          {formatCLP(c.costoNuevo)}
                        </td>
                        <td className="num px-3 py-2 text-right text-muted-foreground">
                          {c.costoNuevo - c.equipo.costo > 0 ? "+" : "−"}
                          {formatCLP(Math.abs(c.costoNuevo - c.equipo.costo))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {lectura.problemas.length > 0 && (
              <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-xs text-amber-100">
                <p className="font-medium">Estas filas no se van a guardar:</p>
                <ul className="mt-1.5 space-y-0.5">
                  {lectura.problemas.slice(0, 50).map((p) => (
                    <li key={`${p.fila}-${p.imei}`}>
                      Fila {p.fila}
                      {p.imei ? ` · IMEI ${p.imei}` : ""}: {p.motivo}
                    </li>
                  ))}
                  {lectura.problemas.length > 50 && (
                    <li>…y {lectura.problemas.length - 50} más.</li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={guardando} onClick={() => setLectura(null)}>
                Cancelar
              </Button>
              <Button
                className="accent-glow"
                disabled={guardando || lectura.cambios.length === 0}
                onClick={() => void aplicar()}
              >
                {guardando
                  ? "Guardando…"
                  : `Guardar ${lectura.cambios.length} costo${lectura.cambios.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
