import { SelectConOtro } from "@/components/inventario/SelectConOtro";
import { SelectProveedor } from "@/components/inventario/SelectProveedor";
import { SelectorSim } from "@/components/inventario/SelectorSim";
import { useCatalogoModelos } from "@/components/inventario/useCatalogoModelos";
import { formatCLP } from "@/lib/stores";
import {
  CATEGORIAS,
  CATEGORIA_ETIQUETA,
  GB_OPCIONES,
  fechaCompraAIso,
  fechaLocal,
  type TipoSim,
} from "@/lib/inventario";

/** Los mismos datos que "Ingresar equipo" en Inventario, para un teléfono vendido antes del
 *  sistema. El IMEI ya viene de la garantía y la ubicación es la tienda que la recibe. */
export type EquipoPrevio = {
  modelo: string;
  gb: string;
  color: string;
  bateria: string;
  sim: TipoSim | "";
  categoria: string;
  email_vinculado: string;
  costo: string;
  proveedor: string;
  lote: string;
  /** "AAAA-MM-DD"; vacío = hoy */
  fecha_compra: string;
  notas: string;
};

export const EQUIPO_PREVIO_VACIO: EquipoPrevio = {
  modelo: "",
  gb: "128",
  color: "",
  bateria: "",
  sim: "",
  categoria: "seminuevo",
  email_vinculado: "",
  costo: "",
  proveedor: "",
  lote: "",
  fecha_compra: "",
  notas: "",
};

/** Primer dato que falta, igual que al ingresar al inventario; null si se puede guardar. */
export function faltaEnPrevio(e: EquipoPrevio, puedeCostos: boolean) {
  if (!e.modelo.trim()) return "Indica el modelo del equipo";
  if (!e.sim) return "Indica si el equipo es SIM física o eSIM";
  if (puedeCostos && !(Number(e.costo) > 0)) return "Ingresa el costo de compra";
  if (!e.proveedor.trim()) return "Indica el proveedor del equipo";
  if (e.fecha_compra && e.fecha_compra > fechaLocal())
    return "La fecha de compra no puede ser futura";
  return null;
}

/** Lo que recibe garantia_agregar_equipo */
export const equipoPrevioJson = (e: EquipoPrevio) => ({
  modelo: e.modelo.trim(),
  gb: e.gb ? Number(e.gb) : null,
  color: e.color.trim() || null,
  bateria: e.bateria === "" ? null : Number(e.bateria),
  sim: e.sim || null,
  categoria: e.categoria,
  email_vinculado: e.email_vinculado.trim() || null,
  costo: e.costo ? Number(e.costo) : null,
  proveedor: e.proveedor.trim() || null,
  lote: e.lote.trim() || null,
  fecha_ingreso: fechaCompraAIso(e.fecha_compra),
  notas: e.notas.trim() || null,
});

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";
const etiqueta = "mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-muted-foreground";
const obligatorio = <span className="normal-case tracking-normal text-amber-300">obligatorio</span>;

export function EquipoPrevioCampos({
  valor,
  onCambio,
  puedeCostos,
}: {
  valor: EquipoPrevio;
  onCambio: (v: EquipoPrevio) => void;
  puedeCostos: boolean;
}) {
  const { modelos, colores } = useCatalogoModelos(true, valor.modelo);
  const set = <K extends keyof EquipoPrevio>(k: K, v: EquipoPrevio[K]) =>
    onCambio({ ...valor, [k]: v });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="previo-modelo" className={etiqueta}>
          Modelo {obligatorio}
        </label>
        <SelectConOtro
          id="previo-modelo"
          className={campo}
          value={valor.modelo}
          onChange={(v) => set("modelo", v)}
          opciones={modelos}
          placeholder="Elige el modelo"
          otroPlaceholder="Escribe el modelo, ej: iPhone 12 Pro"
        />
      </div>
      <div>
        <label htmlFor="previo-gb" className={etiqueta}>
          GB
        </label>
        <select
          id="previo-gb"
          className={campo}
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
        <label htmlFor="previo-color" className={etiqueta}>
          Color
        </label>
        <SelectConOtro
          id="previo-color"
          className={campo}
          value={valor.color}
          onChange={(v) => set("color", v)}
          opciones={colores}
          placeholder={valor.modelo.trim() ? "Elige el color" : "Primero elige el modelo"}
          otroPlaceholder="Escribe el color"
        />
      </div>
      <div>
        <label htmlFor="previo-bateria" className={etiqueta}>
          Batería %
        </label>
        <input
          id="previo-bateria"
          inputMode="numeric"
          placeholder="0-100"
          className={`${campo} num`}
          value={valor.bateria}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 3);
            set("bateria", v === "" ? "" : String(Math.min(100, Number(v))));
          }}
        />
      </div>
      <div>
        <label htmlFor="previo-categoria" className={etiqueta}>
          Categoría
        </label>
        <select
          id="previo-categoria"
          className={campo}
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
      <div className="sm:col-span-2">
        <span className={etiqueta}>SIM {obligatorio}</span>
        <SelectorSim value={valor.sim} onChange={(v) => set("sim", v)} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="previo-email" className={etiqueta}>
          Email vinculado
        </label>
        <input
          id="previo-email"
          className={campo}
          placeholder="ej: cuenta@icloud.com"
          value={valor.email_vinculado}
          onChange={(e) => set("email_vinculado", e.target.value)}
        />
      </div>
      {puedeCostos && (
        <div>
          <label htmlFor="previo-costo" className={etiqueta}>
            Costo de compra {obligatorio}
          </label>
          <input
            id="previo-costo"
            inputMode="numeric"
            placeholder="$0"
            className={`${campo} num`}
            value={valor.costo}
            onChange={(e) => set("costo", e.target.value.replace(/\D/g, "").slice(0, 10))}
          />
          {valor.costo && (
            <p className="num mt-1 text-xs text-muted-foreground">
              {formatCLP(Number(valor.costo))}
            </p>
          )}
        </div>
      )}
      <div className={puedeCostos ? "" : "sm:col-span-2"}>
        <label htmlFor="previo-proveedor" className={etiqueta}>
          Proveedor {obligatorio}
        </label>
        <SelectProveedor
          id="previo-proveedor"
          className={campo}
          value={valor.proveedor}
          onChange={(v) => set("proveedor", v)}
        />
      </div>
      <div>
        <label htmlFor="previo-fecha" className={etiqueta}>
          Fecha de compra
        </label>
        <input
          id="previo-fecha"
          type="date"
          className={`${campo} num [color-scheme:dark]`}
          max={fechaLocal()}
          value={valor.fecha_compra || fechaLocal()}
          onChange={(e) => set("fecha_compra", e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="previo-lote" className={etiqueta}>
          Lote
        </label>
        <input
          id="previo-lote"
          className={campo}
          value={valor.lote}
          onChange={(e) => set("lote", e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="previo-notas" className={etiqueta}>
          Notas del estado físico
        </label>
        <textarea
          id="previo-notas"
          rows={2}
          placeholder="ej: tiene un rayón en la esquina, mensaje de batería..."
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
          value={valor.notas}
          onChange={(e) => set("notas", e.target.value)}
        />
      </div>
    </div>
  );
}
