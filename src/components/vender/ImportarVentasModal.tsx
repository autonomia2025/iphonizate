import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, XCircle } from "lucide-react";
import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { descargarCsv, type Tienda } from "@/lib/importar";
import {
  CAMPOS_VENTA,
  armarVentas,
  csvVentasRechazadas,
  detectarMapeoVentas,
  metodosDeVenta,
  paraEnviar,
  type MapeoVenta,
  type VentaImportada,
} from "@/lib/importarVentas";

type Props = {
  abierto: boolean;
  onCerrar: () => void;
  tiendas: Tienda[];
  puedeCostos: boolean;
  /** Recibe el rango de fechas importado para mostrarlo en el historial. */
  onImportado: (rango: { desde: string; hasta: string }) => void;
};

type Paso = "archivo" | "mapeo" | "previa" | "resultado";

type Resultado = { clave: string; ok: boolean; error?: string; avisos?: string[] };

/* La base de datos procesa las ventas en tandas para no pasarse del tiempo máximo por consulta */
const TANDA = 50;

const selectClase =
  "h-9 w-full rounded-md border border-white/12 bg-white/5 px-2 text-sm text-foreground outline-none focus:border-[var(--accent-store)] focus:ring-2 focus:ring-[var(--accent-store)]/30";

const fechaCorta = (iso: string | null) => (iso ? iso.split("-").reverse().join("-") : "—");

async function enviar(
  ventas: VentaImportada[],
  probar: boolean,
  alAvanzar?: (hechas: number) => void,
) {
  const resultados = new Map<string, Resultado>();
  for (let i = 0; i < ventas.length; i += TANDA) {
    const tanda = ventas.slice(i, i + TANDA);
    const { data, error } = await supabase.rpc("importar_ventas", {
      _ventas: tanda.map(paraEnviar),
      _probar: probar,
    });
    if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
    for (const r of (data ?? []) as Resultado[]) resultados.set(r.clave, r);
    alAvanzar?.(Math.min(i + TANDA, ventas.length));
  }
  return resultados;
}

export function ImportarVentasModal({
  abierto,
  onCerrar,
  tiendas,
  puedeCostos,
  onImportado,
}: Props) {
  const [paso, setPaso] = useState<Paso>("archivo");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filasCrudas, setFilasCrudas] = useState<Record<string, unknown>[]>([]);
  const [mapeo, setMapeo] = useState<MapeoVenta>({});
  const [tiendaPorDefecto, setTiendaPorDefecto] = useState("");
  const [ventas, setVentas] = useState<VentaImportada[]>([]);
  const [cargando, setCargando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [resumen, setResumen] = useState<{ importadas: number; omitidas: number } | null>(null);

  const reiniciar = () => {
    setPaso("archivo");
    setNombreArchivo("");
    setEncabezados([]);
    setFilasCrudas([]);
    setMapeo({});
    setTiendaPorDefecto("");
    setVentas([]);
    setResumen(null);
    setProgreso(0);
  };

  const cerrar = () => {
    onCerrar();
    setTimeout(reiniciar, 200);
  };

  const leerArchivo = async (archivo: File) => {
    setCargando(true);
    try {
      const buffer = await archivo.arrayBuffer();
      /* cellDates + raw: las fechas llegan como fecha y los montos como número, sin formato de Excel */
      const libro = XLSX.read(buffer, { cellDates: true });
      const nombreHoja = libro.SheetNames[0];
      const hoja = nombreHoja ? libro.Sheets[nombreHoja] : undefined;
      if (!hoja) {
        toast.error("El archivo no tiene ninguna hoja con datos");
        return;
      }
      const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, {
        defval: "",
        raw: true,
      });
      const primera = filas[0];
      if (!primera) {
        toast.error("El archivo está vacío o no tiene encabezados");
        return;
      }
      const enc = Object.keys(primera);
      setNombreArchivo(archivo.name);
      setEncabezados(enc);
      setFilasCrudas(filas);
      setMapeo(detectarMapeoVentas(enc));
      setPaso("mapeo");
    } catch (e) {
      toast.error("No pudimos leer el archivo", {
        description: e instanceof Error ? e.message : "Formato no reconocido",
      });
    } finally {
      setCargando(false);
    }
  };

  const descargarPlantilla = () => {
    const enc = [
      "numero_venta",
      "fecha",
      "tienda",
      "cliente",
      "telefono",
      "correo",
      "vendedor",
      "modelo",
      "imei",
      "gb",
      "color",
      "costo",
      "precio_venta",
      "metodo_pago",
      "nombre_pagador",
    ];
    const ejemplo = [
      "1001",
      "01-08-2026",
      tiendas.find((t) => !t.es_bodega)?.nombre ?? "iPhonizate",
      "Cliente Ejemplo",
      "+56912345678",
      "",
      "Matías",
      "iPhone 15 Pro",
      "356938035643809",
      "256",
      "Titanio natural",
      "450000",
      "650000",
      "transferencia",
      "Cliente Ejemplo",
    ];
    const hoja = XLSX.utils.aoa_to_sheet([enc, ejemplo]);
    hoja["!cols"] = enc.map((h, i) => ({
      wch: Math.max(h.length + 4, String(ejemplo[i] ?? "").length + 4),
    }));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Ventas");
    XLSX.writeFile(libro, "plantilla-importar-ventas.xlsx");
  };

  const faltanObligatorios = CAMPOS_VENTA.filter((c) => c.obligatorio && !mapeo[c.campo]);
  const faltaTienda = !mapeo.tienda && !tiendaPorDefecto;
  const camposVisibles = CAMPOS_VENTA.filter((c) => c.campo !== "costo" || puedeCostos);

  const revisar = async () => {
    setCargando(true);
    try {
      const armadas = armarVentas(filasCrudas, mapeo, {
        tiendas,
        tiendaPorDefecto: mapeo.tienda ? null : tiendaPorDefecto || null,
        puedeCostos,
      });
      /* La base de datos revisa lo mismo que hará al importar (vendedores, IMEI ya vendidos,
         ventas ya importadas) y deshace todo: nada queda guardado en este paso */
      const sinErrores = armadas.filter((v) => v.errores.length === 0);
      const resultados = await enviar(sinErrores, true);
      setVentas(
        armadas.map((v) => {
          const r = resultados.get(v.clave);
          if (!r) return v;
          return {
            ...v,
            errores: r.ok ? v.errores : [...v.errores, r.error ?? "Error desconocido"],
            avisos: [...v.avisos, ...(r.avisos ?? [])],
          };
        }),
      );
      setPaso("previa");
    } catch (e) {
      toast.error("No pudimos revisar las ventas", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setCargando(false);
    }
  };

  const listas = useMemo(() => ventas.filter((v) => v.errores.length === 0), [ventas]);
  const conAviso = useMemo(() => listas.filter((v) => v.avisos.length > 0), [listas]);
  const rechazadas = useMemo(() => ventas.filter((v) => v.errores.length > 0), [ventas]);
  const totalListas = useMemo(() => listas.reduce((s, v) => s + v.total, 0), [listas]);

  const importar = async () => {
    setCargando(true);
    setProgreso(0);
    try {
      const resultados = await enviar(listas, false, (hechas) =>
        setProgreso(Math.round((hechas / listas.length) * 100)),
      );
      const actualizadas = ventas.map((v) => {
        const r = resultados.get(v.clave);
        return r && !r.ok ? { ...v, errores: [r.error ?? "Error desconocido"] } : v;
      });
      const importadas = listas.filter((v) => resultados.get(v.clave)?.ok);
      setVentas(actualizadas);
      setResumen({
        importadas: importadas.length,
        omitidas: actualizadas.filter((v) => v.errores.length > 0).length,
      });
      setPaso("resultado");

      const fechas = importadas
        .map((v) => v.fecha)
        .filter((f): f is string => !!f)
        .sort();
      if (fechas.length) onImportado({ desde: fechas[0]!, hasta: fechas[fechas.length - 1]! });
    } catch (e) {
      toast.error("La importación se detuvo", {
        description: `${e instanceof Error ? e.message : ""} Las tandas anteriores quedaron guardadas: vuelve a subir el archivo y se saltarán las ya importadas.`,
      });
    } finally {
      setCargando(false);
    }
  };

  const descargarRechazadas = () => {
    const filas = ventas.filter((v) => v.errores.length > 0);
    if (filas.length === 0) return;
    descargarCsv(
      `ventas-rechazadas-${new Date().toISOString().slice(0, 10)}.csv`,
      csvVentasRechazadas(filas),
    );
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && !cargando && cerrar()}>
      <DialogContent className="modal-rapido glass max-h-[90vh] overflow-y-auto border-white/10 bg-white/5 backdrop-blur-2xl sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Importar ventas desde Excel</DialogTitle>
        </DialogHeader>

        {paso === "archivo" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sube la planilla de ventas (.xlsx o .csv). Cada fila es un producto vendido; si una
              venta tiene varios productos, usa la misma columna de N° de venta. Antes de guardar
              verás una vista previa, y si subes el mismo archivo dos veces no se duplica nada.
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center transition-colors duration-200 hover:border-[var(--accent-store)]/50">
              <FileSpreadsheet className="size-8 text-[var(--accent-store)]" />
              <span className="text-sm">
                {cargando ? "Leyendo archivo…" : "Arrastra la planilla o haz clic para elegirla"}
              </span>
              <span className="text-xs text-muted-foreground">Formatos .xlsx, .xls y .csv</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const archivo = e.target.files?.[0];
                  if (archivo) void leerArchivo(archivo);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
              <p className="text-xs text-muted-foreground">
                ¿No sabes cómo ordenar la planilla? Descarga la plantilla con las columnas listas y
                una fila de ejemplo.
              </p>
              <Button variant="ghost" size="sm" className="gap-2" onClick={descargarPlantilla}>
                <Download className="size-4" /> Descargar plantilla
              </Button>
            </div>
          </div>
        )}

        {paso === "mapeo" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {nombreArchivo} · {filasCrudas.length} fila{filasCrudas.length === 1 ? "" : "s"}.
              Revisa a qué columna corresponde cada dato.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {camposVisibles.map((c) => (
                <div key={c.campo}>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                    {c.label}
                    {c.obligatorio && <span className="ml-1 text-amber-300">obligatorio</span>}
                  </label>
                  <select
                    className={selectClase}
                    value={mapeo[c.campo] ?? ""}
                    onChange={(e) =>
                      setMapeo((m) => ({ ...m, [c.campo]: e.target.value || undefined }))
                    }
                  >
                    <option value="">— no está en el archivo —</option>
                    {encabezados.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  {c.ayuda && <p className="mt-1 text-[11px] text-muted-foreground">{c.ayuda}</p>}
                </div>
              ))}
            </div>

            {!mapeo.tienda && (
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                  El archivo no dice la tienda: ¿de qué tienda son todas estas ventas?
                </label>
                <select
                  className={selectClase}
                  value={tiendaPorDefecto}
                  onChange={(e) => setTiendaPorDefecto(e.target.value)}
                >
                  <option value="">— elige una tienda —</option>
                  {tiendas
                    .filter((t) => !t.es_bodega)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {(faltanObligatorios.length > 0 || faltaTienda) && (
              <p className="text-xs text-amber-300">
                Falta:{" "}
                {[
                  ...faltanObligatorios.map((c) => c.label),
                  ...(faltaTienda ? ["Tienda"] : []),
                ].join(", ")}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPaso("archivo")}>
                Cambiar archivo
              </Button>
              <Button
                onClick={() => void revisar()}
                disabled={faltanObligatorios.length > 0 || faltaTienda || cargando}
              >
                {cargando ? "Revisando…" : "Revisar ventas"}
              </Button>
            </div>
          </div>
        )}

        {paso === "previa" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Todavía no se guardó nada. Revisa las ventas y, si todo calza, impórtalas.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2">
                <p className="flex items-center gap-2 text-xs text-emerald-300">
                  <CheckCircle2 className="size-4" /> Listas para importar
                </p>
                <p className="num mt-1 text-xl font-semibold">
                  {listas.length}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    · {formatCLP(totalListas)}
                  </span>
                </p>
              </div>
              <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2">
                <p className="flex items-center gap-2 text-xs text-amber-300">
                  <AlertTriangle className="size-4" /> Con aviso (se importan)
                </p>
                <p className="num mt-1 text-xl font-semibold">{conAviso.length}</p>
              </div>
              <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2">
                <p className="flex items-center gap-2 text-xs text-red-300">
                  <XCircle className="size-4" /> Con error (se omiten)
                </p>
                <p className="num mt-1 text-xl font-semibold">{rechazadas.length}</p>
              </div>
            </div>

            <div className="solid-panel max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#16131F]">
                  <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Fila</th>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Tienda</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Productos</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 font-medium">Pago</th>
                    <th className="px-3 py-2 font-medium">Vendedor</th>
                    <th className="px-3 py-2 font-medium">Revisión</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((v) => (
                    <tr key={v.clave} className="border-b border-white/5 align-top last:border-0">
                      <td className="num px-3 py-2 text-muted-foreground">{v.lineas.join(", ")}</td>
                      <td className="num px-3 py-2">{fechaCorta(v.fecha)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{v.tiendaTexto || "—"}</td>
                      <td className="px-3 py-2">{v.cliente?.nombre ?? "—"}</td>
                      <td className="px-3 py-2">
                        {v.items.map((it) => (
                          <span key={it.linea} className="block">
                            {it.modelo || "—"}
                            {it.gb ? ` · ${it.gb} GB` : ""}
                            {it.imei && (
                              <span className="num ml-1 text-xs text-muted-foreground">
                                {it.imei}
                              </span>
                            )}
                          </span>
                        ))}
                      </td>
                      <td className="num px-3 py-2 text-right">{formatCLP(v.total)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{metodosDeVenta(v)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{v.vendedor ?? "—"}</td>
                      <td className="max-w-72 px-3 py-2">
                        {v.errores.length > 0 ? (
                          <span className="text-xs text-red-300">{v.errores.join(" · ")}</span>
                        ) : v.avisos.length > 0 ? (
                          <span className="text-xs text-amber-300">{v.avisos.join(" · ")}</span>
                        ) : (
                          <span className="text-xs text-emerald-300">Lista</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {cargando && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full bg-[var(--accent-store)] transition-all duration-200"
                  style={{ width: `${progreso}%` }}
                />
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {rechazadas.length > 0 && (
                <Button variant="ghost" className="gap-2" onClick={descargarRechazadas}>
                  <Download className="size-4" /> CSV de rechazadas
                </Button>
              )}
              <Button variant="ghost" onClick={() => setPaso("mapeo")} disabled={cargando}>
                Volver al mapeo
              </Button>
              <Button onClick={() => void importar()} disabled={cargando || listas.length === 0}>
                {cargando
                  ? `Importando… ${progreso}%`
                  : `Importar ${listas.length} venta${listas.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        )}

        {paso === "resultado" && resumen && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
              <p className="text-sm">
                Se importaron <span className="num font-semibold">{resumen.importadas}</span> venta
                {resumen.importadas === 1 ? "" : "s"} y se omitieron{" "}
                <span className="num font-semibold">{resumen.omitidas}</span>.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                El historial quedó filtrado en las fechas importadas.
                {resumen.omitidas > 0 &&
                  " Descarga el CSV de rechazadas, corrige los motivos y vuelve a subir el archivo: las ventas ya importadas se saltan solas."}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {resumen.omitidas > 0 && (
                <Button variant="ghost" className="gap-2" onClick={descargarRechazadas}>
                  <Download className="size-4" /> CSV de rechazadas
                </Button>
              )}
              <Button variant="ghost" onClick={reiniciar}>
                Importar otra planilla
              </Button>
              <Button onClick={cerrar}>Cerrar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
