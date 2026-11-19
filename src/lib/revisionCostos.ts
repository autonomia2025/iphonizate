import { ESTADO_ETIQUETA, type EquipoEstado } from "@/lib/inventario";
import { normalizarImei, normalizarMonto } from "@/lib/importar";

/** Lo que trae revision_costos_datos() */
export type EquipoCosto = {
  id: string;
  imei: string;
  modelo: string;
  gb: number | null;
  color: string | null;
  estado: EquipoEstado;
  ubicacion: string | null;
  proveedor: string | null;
  lote: string | null;
  fecha_ingreso: string | null;
  costo: number;
  precio_venta: number | null;
  fecha_venta: string | null;
  tienda_venta: string | null;
};

export type Gravedad = "sin_costo" | "digitacion" | "fuera_de_rango" | "ok";

export type EquipoRevisado = EquipoCosto & {
  /** Mediana del costo de su mismo modelo y capacidad (con al menos 3 equipos con costo) */
  referencia: number | null;
  gravedad: Gravedad;
  observaciones: string[];
};

export const GRAVEDAD_ETIQUETA: Record<Gravedad, string> = {
  sin_costo: "Sin costo",
  digitacion: "Posible error de digitación",
  fuera_de_rango: "Fuera de lo normal",
  ok: "Sin observaciones",
};

const ORDEN_GRAVEDAD: Gravedad[] = ["sin_costo", "digitacion", "fuera_de_rango", "ok"];

/* Un usado del mismo modelo y capacidad varía por batería y estado, pero no al doble o a la mitad */
const SOBRE = 1.6;
const BAJO = 0.5;
/* Un cero de más o de menos deja el monto ~10 veces arriba o abajo */
const CERO_DE_MAS = 5;
const CERO_DE_MENOS = 1 / 5;
const MINIMO_RAZONABLE = 20_000;
const MAXIMO_RAZONABLE = 3_000_000;

const clave = (e: { modelo: string; gb: number | null }) =>
  `${e.modelo.trim().toLowerCase()}|${e.gb ?? ""}`;

const mediana = (valores: number[]) => {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : Math.round((v[m - 1]! + v[m]!) / 2);
};

const clp = (n: number) => `$${n.toLocaleString("es-CL")}`;

/** Marca equipos sin costo o con un costo que no calza con el de su modelo y capacidad. */
export function revisarCostos(equipos: EquipoCosto[]): EquipoRevisado[] {
  const porClave = new Map<string, number[]>();
  for (const e of equipos) {
    if (e.costo > 0) porClave.set(clave(e), [...(porClave.get(clave(e)) ?? []), e.costo]);
  }
  const referencias = new Map<string, number>();
  for (const [k, costos] of porClave) if (costos.length >= 3) referencias.set(k, mediana(costos));

  const revisados = equipos.map((e): EquipoRevisado => {
    const referencia = referencias.get(clave(e)) ?? null;
    const observaciones: string[] = [];
    let gravedad: Gravedad = "ok";
    const subir = (g: Gravedad) => {
      if (ORDEN_GRAVEDAD.indexOf(g) < ORDEN_GRAVEDAD.indexOf(gravedad)) gravedad = g;
    };

    if (e.costo <= 0) {
      subir("sin_costo");
      observaciones.push("No tiene costo de compra");
    } else {
      if (referencia) {
        const razon = e.costo / referencia;
        if (razon >= CERO_DE_MAS) {
          subir("digitacion");
          observaciones.push(`Parece tener un cero de más (lo normal es ~${clp(referencia)})`);
        } else if (razon <= CERO_DE_MENOS) {
          subir("digitacion");
          observaciones.push(`Parece faltarle un cero (lo normal es ~${clp(referencia)})`);
        } else if (razon > SOBRE) {
          subir("fuera_de_rango");
          observaciones.push(`Muy sobre lo normal para su modelo (~${clp(referencia)})`);
        } else if (razon < BAJO) {
          subir("fuera_de_rango");
          observaciones.push(`Muy bajo lo normal para su modelo (~${clp(referencia)})`);
        }
      } else if (e.costo < MINIMO_RAZONABLE) {
        subir("digitacion");
        observaciones.push("Monto demasiado bajo para un teléfono");
      } else if (e.costo > MAXIMO_RAZONABLE) {
        subir("digitacion");
        observaciones.push("Monto demasiado alto para un teléfono");
      }
      if (e.precio_venta != null && e.precio_venta > 0 && e.costo > e.precio_venta) {
        subir("fuera_de_rango");
        observaciones.push(`Costó más de lo que se vendió (${clp(e.precio_venta)})`);
      }
    }
    return { ...e, referencia, gravedad, observaciones };
  });

  return revisados.sort(
    (a, b) =>
      ORDEN_GRAVEDAD.indexOf(a.gravedad) - ORDEN_GRAVEDAD.indexOf(b.gravedad) ||
      a.modelo.localeCompare(b.modelo, "es") ||
      (a.gb ?? 0) - (b.gb ?? 0),
  );
}

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-CL") : "");

const ENCABEZADOS = [
  "IMEI",
  "Modelo",
  "GB",
  "Color",
  "Estado",
  "Ubicación",
  "Proveedor",
  "Lote",
  "Fecha de compra",
  "Precio de venta",
  "Fecha de venta",
  "Costo registrado",
  "Costo normal del modelo",
  "Revisar",
  "Costo real",
];

/** Excel para completar: la columna "Costo real" se llena solo donde haya que corregir. */
export async function exportarExcelRevision(equipos: EquipoRevisado[]) {
  const XLSX = await import("xlsx");
  const filas: (string | number)[][] = [
    ENCABEZADOS,
    ...equipos.map((e) => [
      e.imei,
      e.modelo,
      e.gb ?? "",
      e.color ?? "",
      ESTADO_ETIQUETA[e.estado] ?? e.estado,
      e.estado === "VENDIDO" ? (e.tienda_venta ?? "") : (e.ubicacion ?? ""),
      e.proveedor ?? "",
      e.lote ?? "",
      fecha(e.fecha_ingreso),
      e.precio_venta ?? "",
      fecha(e.fecha_venta),
      e.costo,
      e.referencia ?? "",
      e.observaciones.join(" · "),
      "",
    ]),
  ];
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  hoja["!cols"] = [18, 22, 6, 14, 12, 16, 16, 10, 13, 13, 13, 14, 16, 48, 14].map((wch) => ({
    wch,
  }));
  hoja["!autofilter"] = { ref: `A1:O${filas.length}` };

  const instrucciones = XLSX.utils.aoa_to_sheet([
    ["Cómo usar esta planilla"],
    [],
    ['1. Revisa los equipos de la hoja "Revisión". Los primeros son los que tienen observaciones.'],
    ['2. Escribe el costo correcto en la columna "Costo real" solo de los que hay que corregir.'],
    ['3. Deja vacía la columna "Costo real" en los que están bien: esos no se tocan.'],
    ["4. No cambies la columna IMEI: es la que identifica a cada equipo."],
    [
      "5. Sube el archivo en Revisión de costos → Subir Excel. Antes de guardar se muestra cada cambio.",
    ],
    [],
    ["Si el equipo está vendido, también se corrige el costo de esa venta y su ganancia."],
  ]);
  instrucciones["!cols"] = [{ wch: 100 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Revisión");
  XLSX.utils.book_append_sheet(libro, instrucciones, "Instrucciones");
  XLSX.writeFile(libro, `revision-costos-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export type CambioCosto = { equipo: EquipoRevisado; costoNuevo: number };

export type LecturaRevision = {
  cambios: CambioCosto[];
  /** Filas con "Costo real" que no se pueden usar, con el motivo */
  problemas: { fila: number; imei: string; motivo: string }[];
  /** Filas con "Costo real" igual al registrado */
  sinCambio: number;
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Lee el Excel completado y arma los cambios contra los equipos actuales. */
export async function leerExcelRevision(
  archivo: File,
  equipos: EquipoRevisado[],
): Promise<LecturaRevision> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(await archivo.arrayBuffer());
  const nombreHoja =
    libro.SheetNames.find((n) => sinTildes(n) === "revision") ?? libro.SheetNames[0];
  const hoja = nombreHoja ? libro.Sheets[nombreHoja] : undefined;
  if (!hoja) throw new Error("El archivo no tiene hojas");

  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: "", raw: true });
  const iEnc = filas.findIndex((f) => f.some((c) => sinTildes(String(c)) === "imei"));
  if (iEnc < 0) throw new Error("No se encontró la columna IMEI");
  const enc = filas[iEnc]!.map((c) => sinTildes(String(c)));
  const colImei = enc.indexOf("imei");
  const colReal = enc.indexOf("costo real");
  if (colReal < 0) throw new Error('No se encontró la columna "Costo real"');

  const porImei = new Map(equipos.map((e) => [e.imei, e]));
  const vistos = new Set<string>();
  const res: LecturaRevision = { cambios: [], problemas: [], sinCambio: 0 };

  filas.slice(iEnc + 1).forEach((f, i) => {
    const fila = iEnc + i + 2;
    const crudo = f[colReal];
    if (crudo == null || String(crudo).trim() === "") return;
    const { imei } = normalizarImei(f[colImei]);
    const { valor } = normalizarMonto(crudo);
    if (!imei) return void res.problemas.push({ fila, imei: "", motivo: "Fila sin IMEI" });
    if (valor == null || valor <= 0)
      return void res.problemas.push({
        fila,
        imei,
        motivo: `Costo real no válido: "${String(crudo)}"`,
      });
    const equipo = porImei.get(imei);
    if (!equipo)
      return void res.problemas.push({
        fila,
        imei,
        motivo: "El IMEI no está entre los equipos en stock o vendidos",
      });
    if (vistos.has(imei))
      return void res.problemas.push({ fila, imei, motivo: "IMEI repetido en el archivo" });
    vistos.add(imei);
    if (valor === equipo.costo) res.sinCambio += 1;
    else res.cambios.push({ equipo, costoNuevo: valor });
  });

  return res;
}
