import type { RefObject } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectConOtro } from "@/components/inventario/SelectConOtro";
import { SelectProveedor } from "@/components/inventario/SelectProveedor";
import { SelectorSim } from "@/components/inventario/SelectorSim";
import { useCatalogoModelos } from "@/components/inventario/useCatalogoModelos";
import { luhnValido } from "@/lib/imei";
import { formatCLP } from "@/lib/stores";
import { CATEGORIAS, CATEGORIA_ETIQUETA, GB_OPCIONES, type TipoSim } from "@/lib/inventario";

/** Los mismos datos que "Ingresar equipo" en Inventario, sin servicios ni lector. */
export type DatosEquipo = {
  imei: string;
  modelo: string;
  gb: string;
  color: string;
  bateria: string;
  sim: TipoSim | "";
  categoria: string;
  costo: string;
  proveedor: string;
  lote: string;
  ubicacion_id: string;
  notas: string;
};

export const DATOS_EQUIPO_VACIO: DatosEquipo = {
  imei: "",
  modelo: "",
  gb: "128",
  color: "",
  bateria: "",
  sim: "",
  categoria: "seminuevo",
  costo: "",
  proveedor: "",
  lote: "",
  ubicacion_id: "",
  notas: "",
};

/** Lo que reciben las funciones de la base (lista_negra_ingresar y lista_negra_cambiar). */
export const datosEquipoJson = (d: DatosEquipo) => ({
  imei: d.imei,
  modelo: d.modelo.trim(),
  gb: d.gb ? Number(d.gb) : null,
  color: d.color.trim() || null,
  bateria: d.bateria === "" ? null : Number(d.bateria),
  sim: d.sim || null,
  categoria: d.categoria,
  costo: d.costo ? Number(d.costo) : null,
  proveedor: d.proveedor.trim(),
  lote: d.lote.trim() || null,
  ubicacion_id: d.ubicacion_id || null,
  notas: d.notas.trim() || null,
});

/** Primer dato que falta, o null si se puede guardar. */
export function faltaEnDatos(d: DatosEquipo, opciones: { costoObligatorio: boolean }) {
  if (!/^\d{15}$/.test(d.imei)) return "El IMEI debe tener exactamente 15 dígitos.";
  if (!d.modelo.trim()) return "Indica el modelo del equipo.";
  if (!d.sim) return "Indica si el equipo es SIM física o eSIM.";
  if (opciones.costoObligatorio && !(Number(d.costo) > 0)) return "Ingresa el costo de compra.";
  if (!d.proveedor.trim()) return "Indica el proveedor del equipo.";
  if (!d.ubicacion_id) return "Selecciona la ubicación del equipo.";
  return null;
}

const selectClase =
  "h-9 w-full rounded-md border border-white/12 bg-white/5 px-3 text-sm text-foreground outline-none focus:border-[var(--accent-store)] focus:ring-2 focus:ring-[var(--accent-store)]/30";

export function CamposEquipo({
  valor,
  onCambio,
  tiendas,
  puedeCostos,
  costoObligatorio,
  costoAyuda,
  etiquetaProveedor = "Proveedor",
  conCategoria = false,
  imeiRef,
  abierto,
}: {
  valor: DatosEquipo;
  onCambio: (v: DatosEquipo) => void;
  tiendas: { id: string; nombre: string }[];
  puedeCostos: boolean;
  costoObligatorio: boolean;
  costoAyuda?: string;
  etiquetaProveedor?: string;
  conCategoria?: boolean;
  imeiRef?: RefObject<HTMLInputElement | null>;
  abierto: boolean;
}) {
  const { modelos, colores } = useCatalogoModelos(abierto, valor.modelo);
  const set = <K extends keyof DatosEquipo>(k: K, v: DatosEquipo[K]) =>
    onCambio({ ...valor, [k]: v });

  const imeiOk = /^\d{15}$/.test(valor.imei);
  const imeiLuhn = luhnValido(valor.imei);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Label htmlFor="ln-imei">IMEI</Label>
          <Input
            id="ln-imei"
            ref={imeiRef}
            inputMode="numeric"
            autoComplete="off"
            placeholder="15 dígitos o lector de código de barras"
            value={valor.imei}
            onChange={(e) => set("imei", e.target.value.replace(/\D/g, "").slice(0, 15))}
            className="num mt-1 tracking-[0.08em]"
          />
          <p
            className={`mt-1 text-xs ${
              imeiOk && imeiLuhn
                ? "text-emerald-300"
                : valor.imei
                  ? "text-amber-300"
                  : "text-muted-foreground"
            }`}
          >
            {valor.imei.length}/15 dígitos
            {!valor.imei
              ? ""
              : !imeiOk
                ? " · falta completar"
                : imeiLuhn
                  ? " · válido"
                  : " · dígito verificador incorrecto"}
          </p>
        </div>
        <div>
          <Label htmlFor="ln-modelo">Modelo</Label>
          <SelectConOtro
            id="ln-modelo"
            className={`${selectClase} mt-1`}
            value={valor.modelo}
            onChange={(v) => set("modelo", v)}
            opciones={modelos}
            placeholder="Elige el modelo"
            otroPlaceholder="Escribe el modelo, ej: iPhone 18 Pro"
          />
        </div>
      </div>

      <div className={`grid gap-4 ${conCategoria ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <div>
          <Label htmlFor="ln-gb">GB</Label>
          <select
            id="ln-gb"
            className={`${selectClase} mt-1`}
            value={valor.gb}
            onChange={(e) => set("gb", e.target.value)}
          >
            {GB_OPCIONES.map((gb) => (
              <option key={gb} value={gb}>
                {gb}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="ln-color">Color</Label>
          <SelectConOtro
            id="ln-color"
            className={`${selectClase} mt-1`}
            value={valor.color}
            onChange={(v) => set("color", v)}
            opciones={colores}
            placeholder={valor.modelo.trim() ? "Elige el color" : "Primero elige el modelo"}
            otroPlaceholder="Escribe el color"
          />
        </div>
        <div>
          <Label htmlFor="ln-bateria">Batería %</Label>
          <Input
            id="ln-bateria"
            inputMode="numeric"
            className="num mt-1"
            placeholder="0-100"
            value={valor.bateria}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 3);
              set("bateria", v === "" ? "" : String(Math.min(100, Number(v))));
            }}
          />
        </div>
        {conCategoria && (
          <div>
            <Label htmlFor="ln-categoria">Categoría</Label>
            <select
              id="ln-categoria"
              className={`${selectClase} mt-1`}
              value={valor.categoria}
              onChange={(e) => set("categoria", e.target.value)}
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA_ETIQUETA[c]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label>
            SIM <span className="text-amber-300">obligatorio</span>
          </Label>
          <SelectorSim className="mt-1" value={valor.sim} onChange={(v) => set("sim", v)} />
        </div>
        {puedeCostos && (
          <div>
            <Label htmlFor="ln-costo">
              Costo de compra{" "}
              {costoObligatorio && <span className="text-amber-300">obligatorio</span>}
            </Label>
            <Input
              id="ln-costo"
              inputMode="numeric"
              className="num mt-1"
              placeholder="$0"
              value={valor.costo}
              onChange={(e) => set("costo", e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
            <p className="num mt-1 text-xs text-muted-foreground">
              {valor.costo ? formatCLP(Number(valor.costo)) : (costoAyuda ?? "")}
            </p>
          </div>
        )}
        <div className={puedeCostos ? "" : "sm:col-span-2"}>
          <Label htmlFor="ln-proveedor">
            {etiquetaProveedor} <span className="text-amber-300">obligatorio</span>
          </Label>
          <SelectProveedor
            id="ln-proveedor"
            className={`${selectClase} mt-1`}
            value={valor.proveedor}
            onChange={(v) => set("proveedor", v)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ln-lote">Lote</Label>
          <Input
            id="ln-lote"
            className="mt-1"
            value={valor.lote}
            onChange={(e) => set("lote", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="ln-ubicacion">Ubicación</Label>
          <select
            id="ln-ubicacion"
            className={`${selectClase} mt-1`}
            value={valor.ubicacion_id}
            onChange={(e) => set("ubicacion_id", e.target.value)}
          >
            {tiendas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="ln-notas">Notas del estado físico</Label>
        <Textarea
          id="ln-notas"
          className="mt-1 min-h-20"
          placeholder="ej: tiene un rayón en la esquina, mensaje de batería..."
          value={valor.notas}
          onChange={(e) => set("notas", e.target.value)}
        />
      </div>
    </div>
  );
}
