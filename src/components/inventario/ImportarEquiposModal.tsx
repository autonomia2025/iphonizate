import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, XCircle } from "lucide-react";
import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { ESTADOS_ACTIVOS, SERVICIO_ETIQUETA, type EquipoEstado } from "@/lib/inventario";
import {
  CAMPOS,
  csvRechazadas,
  descargarCsv,
  detectarMapeo,
  validarFilas,
  type FilaImportada,
  type Mapeo,
  type Tienda,
} from "@/lib/importar";

type Props = {
  abierto: boolean;
  onCerrar: () => void;
  tiendas: Tienda[];
  puedeCostos: boolean;
  onImportado: () => void;
};

type Paso = "archivo" | "mapeo" | "previa" | "resultado";

const selectClase =
  "h-9 w-full rounded-md border border-white/12 bg-white/5 px-2 text-sm text-foreground outline-none focus:border-[var(--accent-store)] focus:ring-2 focus:ring-[var(--accent-store)]/30";

export function ImportarEquiposModal({ abierto, onCerrar, tiendas, puedeCostos, onImportado }: Props) {
  const [paso, setPaso] = useState<Paso>("archivo");
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filasCrudas, setFilasCrudas] = useState<Record<string, unknown>[]>([]);
  const [mapeo, setMapeo] = useState<Mapeo>({});
  const [validadas, setValidadas] = useState<FilaImportada[]>([]);
  const [cargando, setCargando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [resumen, setResumen] = useState<{ importadas: number; omitidas: number } | null>(null);

  const reiniciar = () => {
    setPaso("archivo");
    setNombreArchivo("");
    setEncabezados([]);
    setFilasCrudas([]);
    setMapeo({});
    setValidadas([]);
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
      const libro = XLSX.read(buffer, { cellDates: false, raw: false });
      const nombreHoja = libro.SheetNames[0];
      const hoja = nombreHoja ? libro.Sheets[nombreHoja] : undefined;
      if (!hoja) {
        toast.error("El archivo no tiene ninguna hoja con datos");
        return;
      }
      const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: "", raw: false });
      const primera = filas[0];
      if (!primera) {
        toast.error("El archivo está vacío o no tiene encabezados");
        return;
      }
      const enc = Object.keys(primera);
      setNombreArchivo(archivo.name);
      setEncabezados(enc);
      setFilasCrudas(filas);
      setMapeo(detectarMapeo(enc));
      setPaso("mapeo");
    } catch (e) {
      toast.error("No pudimos leer el archivo", {
        description: e instanceof Error ? e.message : "Formato no reconocido",
      });
    } finally {
      setCargando(false);
    }
  };

  const validar = async () => {
    setCargando(true);
    const { data, error } = await supabase.from("v_stock").select("imei, estado");
    setCargando(false);
    if (error) {
      toast.error("No pudimos revisar los IMEI ya cargados", { description: error.message });
      return;
    }
    const activos = new Set(
      (data ?? [])
        .filter((e) => ESTADOS_ACTIVOS.includes((e.estado ?? "POR_REVISAR") as EquipoEstado))
        .map((e) => String(e.imei)),
    );
    setValidadas(validarFilas(filasCrudas, mapeo, { tiendas, imeisActivos: activos, puedeCostos }));
    setPaso("previa");
  };

  const listas = useMemo(() => validadas.filter((f) => f.errores.length === 0), [validadas]);
  const conAviso = useMemo(() => listas.filter((f) => f.avisos.length > 0), [listas]);
  const rechazadas = useMemo(() => validadas.filter((f) => f.errores.length > 0), [validadas]);

  const faltanObligatorios = CAMPOS.filter((c) => c.obligatorio && !mapeo[c.campo]);

  const importar = async () => {
    setCargando(true);
    setProgreso(0);
    let importadas = 0;
    const fallidas: FilaImportada[] = [];

    for (let i = 0; i < listas.length; i++) {
      const fila = listas[i];
      const { error } = await supabase.from("equipos").insert({
        imei: fila.imei,
        modelo: fila.modelo,
        gb: fila.gb,
        color: fila.color,
        bateria: fila.bateria,
        email_vinculado: fila.email_vinculado,
        categoria: fila.categoria,
        costo: fila.costo ?? 0,
        proveedor: fila.proveedor,
        lote: fila.lote,
        estado: fila.arreglos.length ? "POR_REVISAR" : "DISPONIBLE",
        ubicacion_id: fila.ubicacion_id,
        notas: fila.notas,
      });

      if (error) {
        fallidas.push({ ...fila, errores: [error.message.replace(/^.*?:\s*/, "")] });
      } else {
        importadas += 1;
        if (fila.arreglos.length) {
          const { data: creado } = await supabase
            .from("v_stock")
            .select("id")
            .eq("imei", fila.imei)
            .maybeSingle();
          if (creado?.id) {
            await supabase.from("servicios_equipo").insert(
              fila.arreglos.map((tipo) => ({ equipo_id: creado.id!, tipo, costo: 0 })),
            );
          }
        }
      }
      setProgreso(Math.round(((i + 1) / listas.length) * 100));
    }

    setCargando(false);
    setValidadas((prev) => [...prev.filter((f) => f.errores.length > 0), ...fallidas]);
    setResumen({ importadas, omitidas: rechazadas.length + fallidas.length });
    setPaso("resultado");
    onImportado();
  };

  const descargarRechazadas = () => {
    const filas = validadas.filter((f) => f.errores.length > 0);
    if (filas.length === 0) return;
    descargarCsv(`equipos-rechazados-${new Date().toISOString().slice(0, 10)}.csv`, csvRechazadas(filas));
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && cerrar()}>
      <DialogContent className="modal-rapido glass max-h-[90vh] overflow-y-auto border-white/10 bg-white/5 backdrop-blur-2xl sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Importar equipos desde Excel</DialogTitle>
        </DialogHeader>

        {paso === "archivo" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sube la planilla (.xlsx o .csv). Se lee en tu navegador, no se guarda el archivo. Después
              revisas el mapeo de columnas y una vista previa antes de importar.
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
          </div>
        )}

        {paso === "mapeo" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {nombreArchivo} · {filasCrudas.length} fila{filasCrudas.length === 1 ? "" : "s"}. Revisa a
              qué columna corresponde cada dato.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {CAMPOS.map((c) => (
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
                </div>
              ))}
            </div>
            {faltanObligatorios.length > 0 && (
              <p className="text-xs text-amber-300">
                Falta mapear: {faltanObligatorios.map((c) => c.label).join(", ")}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPaso("archivo")}>
                Cambiar archivo
              </Button>
              <Button onClick={() => void validar()} disabled={faltanObligatorios.length > 0 || cargando}>
                {cargando ? "Revisando…" : "Revisar filas"}
              </Button>
            </div>
          </div>
        )}

        {paso === "previa" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2">
                <p className="flex items-center gap-2 text-xs text-emerald-300">
                  <CheckCircle2 className="size-4" /> Listas para importar
                </p>
                <p className="num mt-1 text-xl font-semibold">{listas.length}</p>
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

            <div className="solid-panel max-h-72 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#16131F]">
                  <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Fila</th>
                    <th className="px-3 py-2 font-medium">IMEI</th>
                    <th className="px-3 py-2 font-medium">Modelo</th>
                    <th className="px-3 py-2 font-medium">Ubicación</th>
                    {puedeCostos && <th className="px-3 py-2 text-right font-medium">Costo</th>}
                    <th className="px-3 py-2 font-medium">Estado al importar</th>
                    <th className="px-3 py-2 font-medium">Revisión</th>
                  </tr>
                </thead>
                <tbody>
                  {validadas.map((f) => (
                    <tr key={`${f.linea}-${f.imei}`} className="border-b border-white/5 last:border-0">
                      <td className="num px-3 py-2 text-muted-foreground">{f.linea}</td>
                      <td className="num px-3 py-2 tracking-[0.04em]">{f.imei || "—"}</td>
                      <td className="px-3 py-2">
                        {f.modelo || "—"}
                        {f.gb ? ` · ${f.gb} GB` : ""}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{f.ubicacionTexto || "—"}</td>
                      {puedeCostos && (
                        <td className="num px-3 py-2 text-right">{formatCLP(f.costo ?? 0)}</td>
                      )}
                      <td className="px-3 py-2 text-muted-foreground">
                        {f.arreglos.length
                          ? `Por revisar · ${f.arreglos.map((a) => SERVICIO_ETIQUETA[a]).join(", ")}`
                          : "Disponible"}
                      </td>
                      <td className="px-3 py-2">
                        {f.errores.length > 0 ? (
                          <span className="text-xs text-red-300">{f.errores.join(" · ")}</span>
                        ) : f.avisos.length > 0 ? (
                          <span className="text-xs text-amber-300">{f.avisos.join(" · ")}</span>
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
                {cargando ? `Importando… ${progreso}%` : `Importar ${listas.length} equipo${listas.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        )}

        {paso === "resultado" && resumen && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
              <p className="text-sm">
                Se importaron <span className="num font-semibold">{resumen.importadas}</span> equipo
                {resumen.importadas === 1 ? "" : "s"} y se omitieron{" "}
                <span className="num font-semibold">{resumen.omitidas}</span>.
              </p>
              {resumen.omitidas > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Descarga el CSV de rechazadas, corrige los motivos y vuelve a subir solo esas filas.
                </p>
              )}
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
