/**
 * Formulario de edición de la ficha de un equipo: qué cambió, qué se manda a la base
 * y cómo comprobar después que quedó guardado.
 */

export type EditForm = {
  modelo: string;
  gb: string;
  color: string;
  bateria: string;
  categoria: string;
  email_vinculado: string;
  proveedor: string;
  lote: string;
  notas: string;
  ubicacion_id: string;
  costo: string;
};

export type DatosFicha = {
  modelo: string;
  gb: number | null;
  color: string | null;
  bateria: number | null;
  categoria: string | null;
  email_vinculado?: string | null;
  proveedor?: string | null;
  lote?: string | null;
  notas?: string | null;
  ubicacion_id?: string | null;
  costo?: number | null;
};

export const formDesde = (e: DatosFicha): EditForm => ({
  modelo: e.modelo,
  gb: e.gb == null ? "" : String(e.gb),
  color: e.color ?? "",
  bateria: e.bateria == null ? "" : String(e.bateria),
  categoria: e.categoria ?? "seminuevo",
  email_vinculado: e.email_vinculado ?? "",
  proveedor: e.proveedor ?? "",
  lote: e.lote ?? "",
  notas: e.notas ?? "",
  ubicacion_id: e.ubicacion_id ?? "",
  costo: e.costo == null ? "" : String(e.costo),
});

/** Valor que se guarda en la base para cada campo del formulario. */
export const valorDe = (campo: keyof EditForm, f: EditForm): string | number | null => {
  switch (campo) {
    case "modelo":
      return f.modelo.trim();
    case "gb":
      return f.gb ? Number(f.gb) : null;
    case "bateria":
      return f.bateria ? Math.min(100, Number(f.bateria)) : null;
    case "costo":
      return f.costo ? Number(f.costo) : 0;
    case "categoria":
    case "ubicacion_id":
      return f[campo];
    default:
      return f[campo].trim() || null;
  }
};

export const ETIQUETA_CAMPO: Record<keyof EditForm, string> = {
  modelo: "modelo",
  gb: "capacidad",
  color: "color",
  bateria: "batería",
  categoria: "categoría",
  email_vinculado: "email vinculado",
  proveedor: "proveedor",
  lote: "lote",
  notas: "notas",
  ubicacion_id: "ubicación",
  costo: "costo",
};

/** Campos que el usuario cambió: solo esos se mandan, así nunca se pisa un dato que no tocó. */
export const camposCambiados = (original: EditForm, editado: EditForm, puedeCostos: boolean) =>
  (Object.keys(editado) as (keyof EditForm)[]).filter(
    (c) => (c !== "costo" || puedeCostos) && valorDe(c, editado) !== valorDe(c, original),
  );

/** Campos enviados que la base no dejó como se pidieron. El costo solo se revisa si se puede ver. */
export const camposQueNoQuedaron = (
  enviados: (keyof EditForm)[],
  editado: EditForm,
  enBase: EditForm,
  costoVisible: boolean,
) =>
  enviados.filter(
    (c) => !(c === "costo" && !costoVisible) && valorDe(c, enBase) !== valorDe(c, editado),
  );
