/** Colores que se ofrecen al ingresar un equipo según el modelo elegido. */

export type ColorModelo = { modelo: string; color: string; orden: number };
export type CatalogoApple = {
  modelos: { modelo_comercial: string; product_type: string }[];
  colores: { product_type: string; color_comercial: string }[];
};

const normalizar = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Primero los colores que definió la tienda para ese modelo (en su orden). Si el modelo no está
 * en esa lista, los del catálogo Apple para ese modelo y, si tampoco hay, todos los conocidos.
 * Sin modelo elegido no se ofrece ninguno: el color depende del modelo.
 */
export function coloresParaModelo(
  modelo: string,
  propios: ColorModelo[],
  apple: CatalogoApple | undefined,
): string[] {
  const m = normalizar(modelo);
  if (!m) return [];

  const deLaTienda = propios
    .filter((c) => normalizar(c.modelo) === m)
    .sort((a, b) => a.orden - b.orden)
    .map((c) => c.color);
  if (deLaTienda.length) return [...new Set(deLaTienda)];

  if (!apple) return [];
  const tipos = new Set(
    apple.modelos.filter((x) => normalizar(x.modelo_comercial) === m).map((x) => x.product_type),
  );
  const propiosApple = apple.colores
    .filter((c) => tipos.has(c.product_type))
    .map((c) => c.color_comercial);
  const lista = propiosApple.length ? propiosApple : apple.colores.map((c) => c.color_comercial);
  return [...new Set(lista)].sort((a, b) => a.localeCompare(b, "es"));
}
