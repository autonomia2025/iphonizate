import { SelectConOtro } from "@/components/inventario/SelectConOtro";
import { SelectorSim } from "@/components/inventario/SelectorSim";
import { useCatalogoModelos } from "@/components/inventario/useCatalogoModelos";
import { GB_OPCIONES, type TipoSim } from "@/lib/inventario";

/** Datos mínimos de un teléfono vendido antes del sistema, para agregarlo desde Garantías. */
export type EquipoPrevio = {
  modelo: string;
  gb: string;
  color: string;
  bateria: string;
  sim: TipoSim | "";
};

export const EQUIPO_PREVIO_VACIO: EquipoPrevio = {
  modelo: "",
  gb: "128",
  color: "",
  bateria: "",
  sim: "",
};

/** Lo que recibe garantia_agregar_equipo */
export const equipoPrevioJson = (e: EquipoPrevio) => ({
  modelo: e.modelo.trim(),
  gb: e.gb ? Number(e.gb) : null,
  color: e.color.trim() || null,
  bateria: e.bateria === "" ? null : Number(e.bateria),
  sim: e.sim || null,
});

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";
const etiqueta = "mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-muted-foreground";

export function EquipoPrevioCampos({
  valor,
  onCambio,
}: {
  valor: EquipoPrevio;
  onCambio: (v: EquipoPrevio) => void;
}) {
  const { modelos, colores } = useCatalogoModelos(true, valor.modelo);
  const set = <K extends keyof EquipoPrevio>(k: K, v: EquipoPrevio[K]) =>
    onCambio({ ...valor, [k]: v });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="previo-modelo" className={etiqueta}>
          Modelo <span className="normal-case tracking-normal text-amber-300">obligatorio</span>
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
        <span className={etiqueta}>SIM</span>
        <SelectorSim value={valor.sim} onChange={(v) => set("sim", v)} />
      </div>
    </div>
  );
}
