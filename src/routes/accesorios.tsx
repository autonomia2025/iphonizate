import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Plus, SlidersHorizontal, Upload } from "lucide-react";
import { toast } from "sonner";

import { armarCsv, descargarCsv, leerCsv } from "@/lib/importar";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { formatCLP, formatNumero } from "@/lib/stores";
import { puedeIngresarEquipos, puedeVerCostos } from "@/lib/inventario";
import {
  CATEGORIAS_ACCESORIO,
  CATEGORIA_ACCESORIO_ETIQUETA,
  NuevoAccesorioModal,
  type CategoriaAccesorio,
} from "@/components/accesorios/NuevoAccesorioModal";
import { AjustarStockModal } from "@/components/accesorios/AjustarStockModal";

const DESC = "Catálogo de accesorios con stock por tienda, mínimos y ajustes registrados.";

export const Route = createFileRoute("/accesorios")({
  head: () => ({
    meta: [
      { title: "Accesorios · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Accesorios · iPhonizate OS" },
      { property: "og:description", content: DESC },
    ],
  }),
  component: AccesoriosPage,
});

const chip = (activo: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs transition-all duration-200 ${
    activo
      ? "border-[var(--accent-store)]/50 bg-[var(--accent-store)]/15 text-foreground"
      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground"
  }`;

function AccesoriosPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol ?? null;
  const puedeOperar = puedeIngresarEquipos(rol);
  const verCostos = puedeVerCostos(rol);
  const esJefe = rol === "jefe_tienda";

  const [categoria, setCategoria] = useState<CategoriaAccesorio | "">("");
  const [tiendaFiltro, setTiendaFiltro] = useState<string>(
    esJefe && usuario?.tienda_id ? usuario.tienda_id : "",
  );
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalAjuste, setModalAjuste] = useState(false);
  const [accesorioAjuste, setAccesorioAjuste] = useState<string | null>(null);

  const tiendas = useQuery({
    queryKey: ["tiendas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tiendas").select("id, nombre").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const accesorios = useQuery({
    queryKey: ["accesorios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_accesorios")
        .select("id, nombre, categoria, tipo, modelo, costo, precio, minimo")
        .order("nombre");
      if (error) throw error;
      return (data ?? []).map((a) => ({
        id: a.id as string,
        nombre: a.nombre ?? "",
        categoria: a.categoria,
        tipo: a.tipo,
        modelo: a.modelo,
        costo: a.costo ?? 0,
        precio: a.precio ?? 0,
        minimo: a.minimo ?? 0,
      }));
    },
  });

  const stock = useQuery({
    queryKey: ["accesorios_stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accesorios_stock")
        .select("accesorio_id, tienda_id, cantidad");
      if (error) throw error;
      return data ?? [];
    },
  });

  const columnas = useMemo(() => {
    const todas = tiendas.data ?? [];
    return tiendaFiltro ? todas.filter((t) => t.id === tiendaFiltro) : todas;
  }, [tiendas.data, tiendaFiltro]);

  const filas = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const s of stock.data ?? []) mapa.set(`${s.accesorio_id}:${s.tienda_id}`, s.cantidad);

    return (accesorios.data ?? [])
      .filter((a) => !categoria || a.categoria === categoria)
      .map((a) => {
        const porTienda = columnas.map((t) => mapa.get(`${a.id}:${t.id}`) ?? 0);
        const total = porTienda.reduce((s, n) => s + n, 0);
        return { ...a, porTienda, total, bajo: total < a.minimo };
      });
  }, [accesorios.data, stock.data, columnas, categoria]);

  const refrescar = () => {
    void accesorios.refetch();
    void stock.refetch();
  };

  const exportar = () => {
    descargarCsv(
      `accesorios-${new Date().toISOString().slice(0, 10)}.csv`,
      armarCsv(
        ["nombre", "categoria", "tipo", "modelo", "costo", "precio", "minimo", "stock_total"],
        filas.map((a) => [a.nombre, a.categoria, a.tipo ?? "", a.modelo ?? "", a.costo, a.precio, a.minimo, a.total]),
      ),
    );
  };

  const importar = async (archivo: File) => {
    setImportando(true);
    try {
      const categoriasValidas = CATEGORIAS_ACCESORIO.map((c) => c.valor as string);
      const filasCsv = leerCsv(await archivo.text());
      const validas = filasCsv
        .map((f) => ({
          nombre: (f["nombre"] ?? "").trim(),
          categoria: (f["categoria"] ?? "").trim().toLowerCase(),
          tipo: (f["tipo"] ?? "").trim() || null,
          modelo: (f["modelo"] ?? "").trim() || null,
          costo: Number((f["costo"] ?? "").replace(/[^\d]/g, "")) || 0,
          precio: Number((f["precio"] ?? "").replace(/[^\d]/g, "")) || 0,
          minimo: Number((f["minimo"] ?? "").replace(/[^\d]/g, "")) || 0,
        }))
        .filter((f) => f.nombre && categoriasValidas.includes(f.categoria) && f.precio > 0);

      if (!validas.length) {
        toast.error("El archivo no trae filas válidas", {
          description: "Columnas: nombre, categoria (cargador/carcasa/mica/audifonos/otro), tipo, modelo, costo, precio, minimo.",
        });
        return;
      }

      let creados = 0;
      let actualizados = 0;
      for (const f of validas) {
        const existente = (accesorios.data ?? []).find(
          (a) => a.nombre.toLowerCase() === f.nombre.toLowerCase() && (a.modelo ?? "") === (f.modelo ?? ""),
        );
        if (existente) {
          const { error } = await supabase
            .from("accesorios")
            .update({ costo: f.costo, precio: f.precio, minimo: f.minimo, tipo: f.tipo, modelo: f.modelo })
            .eq("id", existente.id);
          if (!error) actualizados += 1;
        } else {
          const { error } = await supabase.from("accesorios").insert({
            nombre: f.nombre,
            categoria: f.categoria as CategoriaAccesorio,
            tipo: f.tipo,
            modelo: f.modelo,
            costo: f.costo,
            precio: f.precio,
            minimo: f.minimo,
          });
          if (!error) creados += 1;
        }
      }
      toast.success(`${creados} nuevos · ${actualizados} actualizados`);
      refrescar();
    } catch (e) {
      toast.error("No pudimos leer el archivo", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setImportando(false);
    }
  };

  const cargando = accesorios.isLoading || stock.isLoading || tiendas.isLoading;
  const colSpan = 4 + (verCostos ? 1 : 0) + columnas.length + 1;

  return (
    <div className="mx-auto max-w-[86rem]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Accesorios</h1>
          <p className="mt-1 text-sm text-muted-foreground">{DESC}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" className="gap-2" onClick={exportar} disabled={filas.length === 0}>
            <Download className="size-4" /> Exportar CSV
          </Button>
          {puedeOperar && (
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
          {puedeOperar && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setAccesorioAjuste(null);
                  setModalAjuste(true);
                }}
              >
                <SlidersHorizontal className="size-4" /> Ajustar stock
              </Button>
              <Button className="accent-glow" onClick={() => setModalNuevo(true)}>
                <Plus className="size-4" /> Nuevo accesorio
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filtros */}
      <section className="glass mt-6 p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Categoría</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={chip(categoria === "")} onClick={() => setCategoria("")}>
            Todas
          </button>
          {CATEGORIAS_ACCESORIO.map((c) => (
            <button
              key={c.valor}
              type="button"
              className={chip(categoria === c.valor)}
              onClick={() => setCategoria(c.valor)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <p className="mb-2 mt-4 text-xs uppercase tracking-wide text-muted-foreground">Tienda</p>
        <div className="flex flex-wrap gap-2">
          {!esJefe && (
            <button
              type="button"
              className={chip(tiendaFiltro === "")}
              onClick={() => setTiendaFiltro("")}
            >
              Todas
            </button>
          )}
          {(tiendas.data ?? [])
            .filter((t) => !esJefe || t.id === usuario?.tienda_id)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                className={chip(tiendaFiltro === t.id)}
                onClick={() => setTiendaFiltro(tiendaFiltro === t.id ? (esJefe ? t.id : "") : t.id)}
              >
                {t.nombre}
              </button>
            ))}
        </div>
      </section>

      {/* Tabla sólida */}
      <div className="solid-panel mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium">Modelo</th>
                {verCostos && <th className="px-4 py-3 text-right font-medium">Costo</th>}
                <th className="px-4 py-3 text-right font-medium">Precio</th>
                {columnas.map((t) => (
                  <th key={t.id} className="px-4 py-3 text-right font-medium">
                    {t.nombre}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => {
                    if (!puedeOperar) return;
                    setAccesorioAjuste(a.id);
                    setModalAjuste(true);
                  }}
                  className={`border-b border-white/5 transition-colors duration-200 last:border-0 ${
                    puedeOperar ? "cursor-pointer" : ""
                  } ${a.bajo ? "bg-red-500/10 hover:bg-red-500/15" : "hover:bg-white/[0.035]"}`}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{a.nombre}</span>
                    {a.tipo ? (
                      <span className="ml-2 text-xs text-muted-foreground">{a.tipo}</span>
                    ) : null}
                    {a.bajo && (
                      <span className="num ml-2 rounded-full border border-red-400/25 bg-red-500/15 px-2 py-0.5 text-xs text-red-300">
                        bajo el mínimo ({a.minimo})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {CATEGORIA_ACCESORIO_ETIQUETA[a.categoria as CategoriaAccesorio] ?? a.categoria}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a.modelo ?? "—"}</td>
                  {verCostos && <td className="num px-4 py-2.5 text-right">{formatCLP(a.costo)}</td>}
                  <td className="num px-4 py-2.5 text-right">{formatCLP(a.precio)}</td>
                  {a.porTienda.map((n, i) => (
                    <td key={columnas[i]!.id} className="num px-4 py-2.5 text-right">
                      {formatNumero(n)}
                    </td>
                  ))}
                  <td className="num px-4 py-2.5 text-right font-semibold">
                    {formatNumero(a.total)}
                  </td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {cargando
                      ? "Cargando catálogo…"
                      : "Todavía no hay accesorios con ese filtro."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {puedeOperar && (
        <>
          <NuevoAccesorioModal
            abierto={modalNuevo}
            onCerrar={() => setModalNuevo(false)}
            onGuardado={refrescar}
            puedeCostos={verCostos}
          />
          <AjustarStockModal
            abierto={modalAjuste}
            onCerrar={() => setModalAjuste(false)}
            onGuardado={refrescar}
            accesorios={(accesorios.data ?? []).map((a) => ({ id: a.id, nombre: a.nombre }))}
            tiendas={tiendas.data ?? []}
            tiendaFija={esJefe ? (usuario?.tienda_id ?? null) : null}
            accesorioInicial={accesorioAjuste}
          />
        </>
      )}
    </div>
  );
}
