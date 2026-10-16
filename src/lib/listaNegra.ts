/* Inventario de lista negra: equipos con el IMEI reportado que no se venden por el flujo normal.
   Terminan vendidos (solo se anota el valor) o cambiados por otro teléfono que entra al inventario. */

export type EstadoListaNegra = "en_stock" | "vendido" | "cambiado";

export const ESTADOS_LISTA_NEGRA: EstadoListaNegra[] = ["en_stock", "vendido", "cambiado"];

export const ESTADO_LISTA_NEGRA_ETIQUETA: Record<EstadoListaNegra, string> = {
  en_stock: "En stock",
  vendido: "Vendido",
  cambiado: "Cambiado",
};

export const ESTADO_LISTA_NEGRA_CLASE: Record<EstadoListaNegra, string> = {
  en_stock: "bg-red-500/15 text-red-300 border-red-400/25",
  vendido: "bg-emerald-500/15 text-emerald-300 border-emerald-400/25",
  cambiado: "bg-sky-500/15 text-sky-300 border-sky-400/25",
};

export type FilaListaNegra = {
  id: string;
  imei: string;
  modelo: string;
  gb: number | null;
  color: string | null;
  bateria: number | null;
  sim: string | null;
  ubicacion_id: string | null;
  tienda: string | null;
  proveedor: string | null;
  lote: string | null;
  notas: string | null;
  estado: EstadoListaNegra;
  fecha_ingreso: string | null;
  ingresado_por: string | null;
  cerrado_at: string | null;
  cerrado_por: string | null;
  valor_venta: number | null;
  equipo_cambio_id: string | null;
  imei_cambio: string | null;
  modelo_cambio: string | null;
  costo: number | null;
};
