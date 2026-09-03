import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Download, Plus, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { fechaHoraCorta } from "@/lib/caja";
import { diasDesde, precioDesactualizado, puedeEditarPrecios } from "@/lib/gestion";
import { NuevoPrecioModal } from "@/components/precios/NuevoPrecioModal";
import { armarCsv, descargarCsv, leerCsv } from "@/lib/importar";
import { cn } from "@/lib/utils";

const DESC = "Precios sugeridos por modelo y capacidad, con control de actualización.";

export const Route = createFileRoute("/precios")({
  head: () => ({
    meta: [
      { title: "Precios · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Precios · iPhonizate OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreciosPage,
});

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

type Fila = {
  id: string;
  modelo: string;
  gb: number;
  precio: number;
  updated_at: string;
  updated_by: string | null;
  usuarios?: { nombre: string } | null;
};

function PreciosPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const puedeEditar = puedeEditarPrecios(rol);

  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<"modelo" | "fecha">("modelo");
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [importando, setImportando] = useState(false);

  const precios = useQuery({
    queryKey: ["precios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("precios")
        .select("id, modelo, gb, precio, updated_at, updated_by, usuarios(nombre)")
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as Fila[];
    },
  });

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = (precios.data ?? []).filter((p) =>
      q ? p.modelo.toLowerCase().includes(q) : true,
    );
    return lista.sort((a, b) =>
      orden === "modelo"
        ? a.modelo.localeCompare(b.modelo, "es") || a.gb - b.gb
        : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }, [precios.data, busqueda, orden]);

  const desactualizados = filas.filter((p) => precioDesactualizado(p.updated_at)).length;

  const abrirEdicion = (fila: Fila) => {
    if (!puedeEditar) return;
    setEditando(fila.id);
    setValor(String(fila.precio));
  };

  const guardar = async (fila: Fila) => {
    const nuevo = Number(valor.replace(/[^\d]/g, ""));
    if (!nuevo || nuevo <= 0) {
      toast.error("Ingresa un precio mayor a cero");
      return;
    }
    if (nuevo === fila.precio) {
      setEditando(null);
      return;
    }
    setGuardando(true);
    try {
      const { error } = await supabase
        .from("precios")
        .update({
          precio: nuevo,
          updated_at: new Date().toISOString(),
          updated_by: usuario?.id ?? null,
        })
        .eq("id", fila.id);
      if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
      toast.success("Precio actualizado");
      setEditando(null);
      void precios.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setGuardando(false);
    }
  };

  const exportar = () => {
    descargarCsv(
      `precios-${new Date().toISOString().slice(0, 10)}.csv`,
      armarCsv(
        ["modelo", "gb", "precio"],
        filas.map((p) => [p.modelo, p.gb, p.precio]),
      ),
    );
  };

  const importar = async (archivo: File) => {
    setImportando(true);
    try {
      const filasCsv = leerCsv(await archivo.text());
      const validas = filasCsv
        .map((f) => ({
          modelo: (f["modelo"] ?? "").trim(),
          gb: Number((f["gb"] ?? "").replace(/[^\d]/g, "")),
          precio: Number((f["precio"] ?? "").replace(/[^\d]/g, "")),
        }))
        .filter((f) => f.modelo && f.gb > 0 && f.precio > 0);
      if (!validas.length) {
        toast.error("El archivo no trae filas válidas", {
          description: "Usa las columnas modelo, gb y precio.",
        });
        return;
      }
      let guardadas = 0;
      for (const f of validas) {
        const existente = (precios.data ?? []).find((p) => p.modelo === f.modelo && p.gb === f.gb);
        const payload = {
          precio: f.precio,
          updated_at: new Date().toISOString(),
          updated_by: usuario?.id ?? null,
        };
        const { error } = existente
          ? await supabase.from("precios").update(payload).eq("id", existente.id)
          : await supabase.from("precios").insert({ modelo: f.modelo, gb: f.gb, ...payload });
        if (!error) guardadas += 1;
      }
      toast.success(`${guardadas} precio${guardadas === 1 ? "" : "s"} cargados`, {
        description: guardadas < validas.length ? `${validas.length - guardadas} no se pudieron guardar` : undefined,
      });
      void precios.refetch();
    } catch (e) {
      toast.error("No pudimos leer el archivo", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="mx-auto max-w-[86rem] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Precios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {DESC}
            {desactualizados > 0 && (
              <span className="ml-1 text-amber-300">
                · {desactualizados} sin actualizar hace más de 30 días
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="gap-2" onClick={exportar} disabled={filas.length === 0}>
            <Download className="size-4" /> Exportar CSV
          </Button>
          {puedeEditar && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-white/12 bg-white/[0.04] px-3 py-2 text-sm transition-colors hover:bg-white/[0.07]">
              <Upload className="size-4" /> {importando ? "Cargando…" : "Importar CSV"}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const archivo = e.target.files?.[0];
                  if (archivo) void importar(archivo);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {puedeEditar && (
            <Button onClick={() => setModal(true)}>
              <Plus className="size-4" /> Nuevo precio
            </Button>
          )}
        </div>
      </div>

      <div className="glass flex flex-wrap items-center gap-3 p-4">
        <label className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            className={`${campo} pl-9`}
            placeholder="Buscar por modelo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {(
            [
              { v: "modelo", label: "Por modelo" },
              { v: "fecha", label: "Por actualización" },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              onClick={() => setOrden(o.v)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs transition-colors duration-200",
                orden === o.v
                  ? "bg-white/[0.08] text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <section className="solid-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold">Lista de precios</h2>
          <span className="num text-[12px] text-muted-foreground">{filas.length} modelos</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Modelo</th>
                <th className="px-3 py-2.5 text-right font-medium">GB</th>
                <th className="px-3 py-2.5 text-right font-medium">Precio sugerido</th>
                <th className="px-3 py-2.5 font-medium">Última actualización</th>
                <th className="px-5 py-2.5 font-medium">Actualizado por</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => {
                const viejo = precioDesactualizado(p.updated_at);
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "border-t border-white/[0.05] transition-colors duration-200 hover:bg-surface-alt",
                      viejo && "bg-amber-500/[0.06]",
                    )}
                  >
                    <td className="px-5 py-2.5 font-medium">{p.modelo}</td>
                    <td className="num px-3 py-2.5 text-right">{p.gb}</td>
                    <td className="num px-3 py-2.5 text-right">
                      {editando === p.id ? (
                        <span className="flex items-center justify-end gap-1">
                          <input
                            autoFocus
                            inputMode="numeric"
                            className="num h-8 w-32 rounded-lg border border-white/12 bg-white/[0.05] px-2 text-right text-sm outline-none focus:border-[var(--accent-store)]/60"
                            value={valor}
                            onChange={(e) => setValor(e.target.value.replace(/[^\d]/g, ""))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void guardar(p);
                              if (e.key === "Escape") setEditando(null);
                            }}
                          />
                          <button
                            aria-label="Guardar"
                            disabled={guardando}
                            onClick={() => void guardar(p)}
                            className="rounded-lg p-1.5 text-emerald-300 transition-colors duration-200 hover:bg-emerald-500/15"
                          >
                            <Check className="size-4" />
                          </button>
                          <button
                            aria-label="Cancelar"
                            onClick={() => setEditando(null)}
                            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.07]"
                          >
                            <X className="size-4" />
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => abrirEdicion(p)}
                          disabled={!puedeEditar}
                          className={cn(
                            "num rounded-lg px-2 py-1 font-medium transition-colors duration-200",
                            puedeEditar
                              ? "hover:bg-white/[0.07] hover:text-[var(--accent-store)]"
                              : "cursor-default",
                          )}
                        >
                          {formatCLP(p.precio)}
                        </button>
                      )}
                    </td>
                    <td className="num px-3 py-2.5 text-muted-foreground">
                      {fechaHoraCorta(p.updated_at)}
                      <span className={cn("ml-2 text-[11px]", viejo && "text-amber-300")}>
                        {diasDesde(p.updated_at)} d
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground">
                      {p.usuarios?.nombre ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {filas.length === 0 && (
                <tr>
                  <td className="px-5 py-8 text-center text-muted-foreground" colSpan={5}>
                    {precios.isLoading ? "Cargando precios…" : "Todavía no hay precios cargados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <NuevoPrecioModal
        abierto={modal}
        onCerrar={() => setModal(false)}
        onGuardado={() => void precios.refetch()}
        usuarioId={usuario?.id ?? null}
      />
    </div>
  );
}
