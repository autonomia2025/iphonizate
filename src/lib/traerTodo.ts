/**
 * La base de datos entrega como máximo 1.000 filas por consulta y corta el resto sin avisar
 * (aunque se pida .limit(5000)). Esta función pide tandas de 1.000 hasta traer todo.
 *
 * `armar` debe devolver una consulta nueva cada vez, con un orden estable (por ejemplo
 * terminando en .order("id")) y aplicando .range(desde, hasta).
 */
export const TANDA_FILAS = 1000;

export async function traerTodo<T>(
  armar: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  tope = 50_000,
): Promise<T[]> {
  const todo: T[] = [];
  for (let desde = 0; desde < tope; desde += TANDA_FILAS) {
    const { data, error } = await armar(desde, desde + TANDA_FILAS - 1);
    if (error) throw error;
    const filas = data ?? [];
    todo.push(...filas);
    if (filas.length < TANDA_FILAS) break;
  }
  return todo;
}
