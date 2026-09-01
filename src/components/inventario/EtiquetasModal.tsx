import { useMemo, useState } from "react";
import { Printer, X, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  TAMANOS,
  type EquipoEtiqueta,
  type MedidaEtiqueta,
  descripcionEquipo,
  guardarTamano,
  imprimirEtiquetas,
  leerTamanoGuardado,
  svgCodigoBarras,
} from "@/lib/etiquetas";
import { cn } from "@/lib/utils";

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";
const etiqueta = "mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-muted-foreground";

export function EtiquetasModal({
  abierto,
  equipos,
  onCerrar,
}: {
  abierto: boolean;
  equipos: EquipoEtiqueta[];
  onCerrar: () => void;
}) {
  const [medida, setMedida] = useState<MedidaEtiqueta>(() => leerTamanoGuardado());

  const preset = useMemo(
    () => TAMANOS.find((t) => t.ancho === medida.ancho && t.alto === medida.alto)?.id ?? "custom",
    [medida],
  );

  const muestra = equipos[0];
  const codigo = useMemo(
    () => (muestra ? svgCodigoBarras(muestra.imei, medida) : null),
    [muestra, medida],
  );

  if (!abierto) return null;

  const aplicar = (nueva: MedidaEtiqueta) => {
    setMedida(nueva);
    guardarTamano(nueva);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="glass relative z-10 w-full max-w-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">Imprimir etiquetas</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {equipos.length === 1
                ? descripcionEquipo(equipos[0]!)
                : `${equipos.length} etiquetas seleccionadas`}{" "}
              · Code 128 con IMEI
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.06] hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <label className={etiqueta}>Tamaño de etiqueta</label>
            <select
              className={campo}
              value={preset}
              onChange={(e) => {
                const t = TAMANOS.find((x) => x.id === e.target.value);
                if (t) aplicar({ ancho: t.ancho, alto: t.alto });
              }}
            >
              {TAMANOS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
              <option value="custom">Personalizado</option>
            </select>
          </div>
          <div>
            <label className={etiqueta}>Ancho (mm)</label>
            <input
              type="number"
              min={20}
              className={`${campo} num`}
              value={medida.ancho}
              onChange={(e) => aplicar({ ...medida, ancho: Number(e.target.value) || medida.ancho })}
            />
          </div>
          <div>
            <label className={etiqueta}>Alto (mm)</label>
            <input
              type="number"
              min={10}
              className={`${campo} num`}
              value={medida.alto}
              onChange={(e) => aplicar({ ...medida, alto: Number(e.target.value) || medida.alto })}
            />
          </div>
        </div>

        {muestra && codigo && (
          <div className="mt-4">
            <p className={etiqueta}>Vista previa</p>
            <div className="flex justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div
                className="flex flex-col items-center justify-center gap-1 bg-white text-black"
                style={{
                  width: `${medida.ancho}mm`,
                  height: `${medida.alto}mm`,
                  padding: "1.5mm 3mm",
                  borderRadius: 2,
                }}
              >
                <div
                  className="leading-none"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: codigo.svg }}
                />
                <div className="text-center leading-tight">
                  <div style={{ fontSize: "7.5pt", fontWeight: 700 }}>{descripcionEquipo(muestra)}</div>
                  <div className="num" style={{ fontSize: "8pt", letterSpacing: "0.4pt" }}>{muestra.imei}</div>
                  {muestra.servicios?.length ? <div style={{ maxWidth: "100%", fontSize: "5.5pt", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Pendiente: {muestra.servicios.join(" · ")}</div> : null}
                </div>
              </div>
            </div>
            <p
              className={cn(
                "num mt-2 text-[11px]",
                codigo.legible ? "text-muted-foreground" : "text-amber-300",
              )}
            >
              {codigo.legible ? (
                <>
                  Módulo {codigo.modulo.toFixed(2)} mm · ancho del código{" "}
                  {codigo.anchoTotal.toFixed(1)} mm · zona muda 10 módulos por lado
                </>
              ) : (
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5" />
                  El código queda comprimido para este ancho: usa una etiqueta más ancha para que lo
                  lea la pistola.
                </span>
              )}
            </p>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => imprimirEtiquetas(equipos, medida)}>
            <Printer className="size-4" /> Imprimir{" "}
            {equipos.length > 1 ? `${equipos.length} etiquetas` : "etiqueta"}
          </Button>
        </div>
      </div>
    </div>
  );
}
