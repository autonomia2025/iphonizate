import { FAMILIAS, familiaDeModelo, ordenarSeries, serieDeModelo } from "@/lib/inventario";

type EquipoDisponible = { modelo?: string | null; gb?: number | null; color?: string | null };

export type GrupoModelo = {
  modelo: string;
  /** Capacidades presentes, de menor a mayor (null = sin capacidad anotada) */
  capacidades: (number | null)[];
  /** Por color: cuántos hay de cada capacidad */
  colores: { color: string; porCapacidad: Map<number | null, number>; total: number }[];
  totalPorCapacidad: Map<number | null, number>;
  total: number;
};

/** "1024" → "1 TB"; "256" → "256 GB" */
export const textoCapacidad = (gb: number | null) =>
  gb == null ? "Sin capacidad" : gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`;

/** Disponibles agrupados por modelo → color × capacidad. Modelos de más nuevo a más antiguo. */
export function agruparPorModelo(equipos: EquipoDisponible[]): GrupoModelo[] {
  const porModelo = new Map<string, EquipoDisponible[]>();
  for (const e of equipos) {
    const modelo = (e.modelo ?? "").trim() || "Sin modelo";
    porModelo.set(modelo, [...(porModelo.get(modelo) ?? []), e]);
  }

  const grupos = [...porModelo.entries()].map(([modelo, lista]) => {
    const capacidades = [...new Set(lista.map((e) => e.gb ?? null))].sort(
      (a, b) => (a ?? Number.MAX_SAFE_INTEGER) - (b ?? Number.MAX_SAFE_INTEGER),
    );
    const mapaColores = new Map<string, Map<number | null, number>>();
    const totalPorCapacidad = new Map<number | null, number>();
    for (const e of lista) {
      const color = (e.color ?? "").trim() || "Sin color";
      const gb = e.gb ?? null;
      const fila = mapaColores.get(color) ?? new Map<number | null, number>();
      fila.set(gb, (fila.get(gb) ?? 0) + 1);
      mapaColores.set(color, fila);
      totalPorCapacidad.set(gb, (totalPorCapacidad.get(gb) ?? 0) + 1);
    }
    const colores = [...mapaColores.entries()]
      .map(([color, porCapacidad]) => ({
        color,
        porCapacidad,
        total: [...porCapacidad.values()].reduce((a, n) => a + n, 0),
      }))
      .sort((a, b) => b.total - a.total || a.color.localeCompare(b.color, "es"));
    return { modelo, capacidades, colores, totalPorCapacidad, total: lista.length };
  });

  const series = ordenarSeries([...new Set(grupos.map((g) => serieDeModelo(g.modelo)))]);
  return grupos.sort(
    (a, b) =>
      series.indexOf(serieDeModelo(a.modelo)) - series.indexOf(serieDeModelo(b.modelo)) ||
      FAMILIAS.indexOf(familiaDeModelo(b.modelo)) - FAMILIAS.indexOf(familiaDeModelo(a.modelo)) ||
      a.modelo.localeCompare(b.modelo, "es"),
  );
}

/** Excel con un bloque por modelo: colores en filas, capacidades en columnas. */
export async function exportarExcelDisponibles(grupos: GrupoModelo[], alcance: string) {
  const XLSX = await import("xlsx");
  const filas: (string | number)[][] = [
    [`Disponibles por modelo · ${alcance} · ${new Date().toLocaleDateString("es-CL")}`],
    [],
  ];
  let anchoMax = 2;
  for (const g of grupos) {
    filas.push([g.modelo, ...g.capacidades.map(textoCapacidad), "Total"]);
    for (const c of g.colores) {
      filas.push([c.color, ...g.capacidades.map((gb) => c.porCapacidad.get(gb) ?? ""), c.total]);
    }
    filas.push(["Total", ...g.capacidades.map((gb) => g.totalPorCapacidad.get(gb) ?? 0), g.total]);
    filas.push([]);
    anchoMax = Math.max(anchoMax, g.capacidades.length + 2);
  }
  filas.push(["Total disponibles", grupos.reduce((a, g) => a + g.total, 0)]);

  const hoja = XLSX.utils.aoa_to_sheet(filas);
  hoja["!cols"] = [{ wch: 26 }, ...Array.from({ length: anchoMax - 1 }, () => ({ wch: 12 }))];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Disponibles");
  XLSX.writeFile(libro, `disponibles-por-modelo-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Una tabla por modelo, como planilla: colores × capacidades con totales. */
export function TablaDisponiblesPorModelo({ grupos }: { grupos: GrupoModelo[] }) {
  if (grupos.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Sin equipos disponibles</p>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {grupos.map((g) => (
        <div key={g.modelo} className="solid-panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                <th className="px-3 py-2.5 text-left font-display text-sm font-semibold">
                  {g.modelo}
                </th>
                {g.capacidades.map((gb) => (
                  <th
                    key={String(gb)}
                    className="num px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {textoCapacidad(gb)}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {g.colores.map((c) => (
                <tr
                  key={c.color}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.035]"
                >
                  <td className="px-3 py-2">{c.color}</td>
                  {g.capacidades.map((gb) => {
                    const n = c.porCapacidad.get(gb);
                    return (
                      <td key={String(gb)} className="num px-3 py-2 text-right">
                        {n ? n : <span className="text-muted-foreground/40">·</span>}
                      </td>
                    );
                  })}
                  <td className="num px-3 py-2 text-right font-semibold">{c.total}</td>
                </tr>
              ))}
              <tr className="border-t border-white/10 bg-white/[0.03]">
                <td className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Total
                </td>
                {g.capacidades.map((gb) => (
                  <td key={String(gb)} className="num px-3 py-2 text-right font-semibold">
                    {g.totalPorCapacidad.get(gb) ?? 0}
                  </td>
                ))}
                <td className="num px-3 py-2 text-right font-semibold text-[var(--accent-store)]">
                  {g.total}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
