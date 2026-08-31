import { useEffect, useRef } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { AppRol } from "@/lib/nav";

/* ------------------------------------------------------------------ Acceso */

/** Finanzas es la sección más sensible: solo dirección y administración.
 *  El bloqueo real está en RLS; esto es solo para la interfaz. */
export const ROLES_FINANZAS: AppRol[] = ["direccion", "administracion"];
export const puedeVerFinanzas = (rol?: AppRol | null) => !!rol && ROLES_FINANZAS.includes(rol);

/** Deja registrado en auditoría que alguien abrió una pantalla de Finanzas. */
export function useRegistrarAccesoFinanzas(seccion: string, activo: boolean) {
  const hecho = useRef(false);
  useEffect(() => {
    if (!activo || hecho.current) return;
    hecho.current = true;
    void supabase.rpc("registrar_acceso_finanzas", { _seccion: seccion });
  }, [seccion, activo]);
}

/* ------------------------------------------------------ Marcas y prorrateo */

export type Asignacion = "compartido" | "iphonizate" | "black-pink-phone" | "riffstore";

export const MARCAS: { valor: Asignacion; label: string }[] = [
  { valor: "iphonizate", label: "iPhonizate" },
  { valor: "black-pink-phone", label: "Black Pink Phone" },
  { valor: "riffstore", label: "Riffstore" },
];

export const ASIGNACIONES: { valor: Asignacion; label: string }[] = [
  { valor: "compartido", label: "Compartido" },
  ...MARCAS,
];

export const etiquetaAsignacion = (valor?: string | null) =>
  ASIGNACIONES.find((a) => a.valor === valor)?.label ?? "Compartido";

/* ---------------------------------------------------------- Tipos de datos */

export type Parametros = Record<string, number>;

export const TIPOS_PERSONAL = [
  { valor: "contrato", label: "Contrato" },
  { valor: "honorarios", label: "Honorarios" },
  { valor: "sin_contrato", label: "Sin contrato" },
  { valor: "por_contratar", label: "Por contratar" },
] as const;

export type TipoPersonal = (typeof TIPOS_PERSONAL)[number]["valor"];

export const etiquetaTipo = (t?: string | null) =>
  TIPOS_PERSONAL.find((x) => x.valor === t)?.label ?? "—";

export type PersonaFinanzas = {
  id: string;
  nombre: string;
  cargo: string | null;
  area: string | null;
  asignacion: string;
  tipo: TipoPersonal;
  empresa_rut: string | null;
  rut: string | null;
  fecha_ingreso: string | null;
  afp: string | null;
  salud: string | null;
  sueldo_base: number;
  liquido_liquidacion: number;
  bonificacion_extra: number;
  bono_variable_referencia: number;
  estado: "activo" | "inactivo";
  revisar: boolean;
  notas: string | null;
  usuario_id: string | null;
};

export type FilaNomina = {
  id: string;
  periodo: string;
  personal_id: string;
  liquido_liquidacion: number;
  bonificacion_extra: number;
  bono_base: number;
  faltas: number;
  atrasos: number;
  otros_descuentos: number;
  pagado_quincena: boolean;
  pagado_fin_mes: boolean;
  notas: string | null;
};

/* ------------------------------------------------------------- Parámetros */

export const parametro = (params: Parametros, clave: string, porDefecto = 0) =>
  Number.isFinite(params[clave]) ? params[clave]! : porDefecto;

/* --------------------------------------------------------------- Cálculos */

export const faltasEquivalentes = (fila: { faltas: number; atrasos: number }, params: Parametros) => {
  const porFalta = Math.max(1, parametro(params, "atrasos_por_falta", 2));
  return fila.faltas + Math.floor(fila.atrasos / porFalta);
};

export const descuentoBono = (faltasEq: number, params: Parametros) => {
  if (faltasEq <= 0) return 0;
  if (faltasEq === 1) return parametro(params, "descuento_1_falta", 0.3333);
  if (faltasEq === 2) return parametro(params, "descuento_2_faltas", 0.6667);
  return parametro(params, "descuento_3_faltas", 1);
};

export type CalculoNomina = {
  totalLiquido: number;
  faltasEq: number;
  descuento: number;
  bonoAPagar: number;
  quincena: number;
  finMes: number;
  cargaPatronal: number;
  costoEmpresa: number;
  total: number;
};

/** Todo derivado: la persona solo escribe faltas, atrasos y montos base. */
export function calcularNomina(
  fila: Pick<
    FilaNomina,
    "liquido_liquidacion" | "bonificacion_extra" | "bono_base" | "faltas" | "atrasos" | "otros_descuentos"
  >,
  tipo: TipoPersonal,
  params: Parametros,
): CalculoNomina {
  const totalLiquido = Number(fila.liquido_liquidacion) + Number(fila.bonificacion_extra);
  const faltasEq = faltasEquivalentes(fila, params);
  const descuento = descuentoBono(faltasEq, params);
  const bonoAPagar = Math.round(Number(fila.bono_base) * (1 - descuento));
  const quincena = Math.round(totalLiquido / 2);
  const finMes = totalLiquido - quincena + bonoAPagar - Number(fila.otros_descuentos);
  const cargaPatronal =
    tipo === "contrato" ? Math.round(totalLiquido * parametro(params, "carga_patronal", 0)) : 0;
  return {
    totalLiquido,
    faltasEq,
    descuento,
    bonoAPagar,
    quincena,
    finMes,
    cargaPatronal,
    costoEmpresa: totalLiquido + cargaPatronal,
    total: quincena + finMes,
  };
}

/* ------------------------------------------------------------- Períodos */

export const periodoActualFinanzas = () => new Date().toISOString().slice(0, 7);

export const periodoAnterior = (periodo: string) => {
  const [a, m] = periodo.split("-").map(Number);
  const d = new Date(a!, m! - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const mesTexto = (periodo: string) => {
  const [a, m] = periodo.split("-").map(Number);
  if (!a || !m) return periodo;
  const t = new Date(a, m - 1, 1).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Fecha real de pago dentro del mes, sin pasarse del último día. */
export const fechaDelMes = (periodo: string, dia: number) => {
  const [a, m] = periodo.split("-").map(Number);
  const ultimo = new Date(a!, m!, 0).getDate();
  return new Date(a!, m! - 1, Math.min(dia, ultimo));
};

export const diasHasta = (fecha: Date) => {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(fecha);
  f.setHours(0, 0, 0, 0);
  return Math.round((f.getTime() - hoy.getTime()) / 86_400_000);
};

export const fechaLarga = (f: Date) =>
  f.toLocaleDateString("es-CL", { weekday: "long", day: "2-digit", month: "long" });

/* --------------------------------------------------------- Reparto por marca */

/** Marcas realmente en operación: las que existen como tienda en el sistema.
 *  Si no hay datos todavía, se usan las tres marcas del catálogo. */
export function marcasActivas(slugs?: (string | null | undefined)[]) {
  if (!slugs || slugs.length === 0) return MARCAS;
  const set = new Set(slugs.filter(Boolean) as string[]);
  const encontradas = MARCAS.filter((m) => set.has(m.valor));
  return encontradas.length ? encontradas : MARCAS;
}

/** Reparte un monto compartido entre las marcas según el prorrateo configurado.
 *  El peso por defecto se ajusta a la cantidad de marcas activas (2, 3 o más). */
export function prorrateo(params: Parametros, marcas = MARCAS): Record<string, number> {
  const base: Record<string, number> = {};
  let suma = 0;
  for (const m of marcas) {
    const v = parametro(params, `prorrateo_${m.valor.replace(/-/g, "_")}`, 1 / marcas.length);
    base[m.valor] = v;
    suma += v;
  }
  if (suma <= 0) return Object.fromEntries(marcas.map((m) => [m.valor, 1 / marcas.length]));
  return Object.fromEntries(marcas.map((m) => [m.valor, base[m.valor]! / suma]));
}

/** Suma montos por marca aplicando el prorrateo a lo compartido. */
export function repartirPorMarca(
  filas: { asignacion: string | null; monto: number }[],
  params: Parametros,
  marcas = MARCAS,
): Record<string, number> {
  const pesos = prorrateo(params, marcas);
  const acc: Record<string, number> = Object.fromEntries(marcas.map((m) => [m.valor, 0]));
  for (const f of filas) {
    const a = f.asignacion ?? "compartido";
    if (a in acc) {
      acc[a] = (acc[a] ?? 0) + f.monto;
    } else {
      for (const m of marcas) acc[m.valor] = (acc[m.valor] ?? 0) + f.monto * (pesos[m.valor] ?? 0);
    }
  }
  return acc;
}


/* -------------------------------------------------------------- Impuestos */

export const CONCEPTOS_IMPUESTO = [
  "IVA, PPM y retención de honorarios (F29)",
  "Cotizaciones previsionales (AFP, salud, cesantía, mutual)",
  "Impuesto único de 2ª categoría retenido",
  "Impuesto a la renta",
  "Patentes municipales",
  "Multas e intereses",
] as const;

export const esCotizacion = (concepto: string) => /cotizacion|2ª categor/i.test(concepto);
export const esF29 = (concepto: string) => /F29|IVA/i.test(concepto);
