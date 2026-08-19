import type { AppRol } from "@/lib/nav";

export const ROLES_REPORTES: AppRol[] = ["direccion", "jefe_tienda", "administracion"];
export const puedeVerReportes = (rol?: AppRol | null) => !!rol && ROLES_REPORTES.includes(rol);

/** Roles que comparan todas las tiendas. */
export const ROLES_TODAS_TIENDAS: AppRol[] = ["direccion", "administracion"];
export const puedeVerTodasTiendas = (rol?: AppRol | null) =>
  !!rol && ROLES_TODAS_TIENDAS.includes(rol);

/* ---------- Rango de fechas ---------- */

export type Rango = { desde: string; hasta: string };

const iso = (d: Date) => {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

export const ATAJOS = [
  { valor: "hoy", label: "Hoy" },
  { valor: "semana", label: "Esta semana" },
  { valor: "mes", label: "Este mes" },
  { valor: "mesPasado", label: "Mes pasado" },
] as const;

export type Atajo = (typeof ATAJOS)[number]["valor"];

export const rangoDeAtajo = (atajo: Atajo): Rango => {
  const hoy = new Date();
  if (atajo === "hoy") return { desde: iso(hoy), hasta: iso(hoy) };
  if (atajo === "semana") {
    const dia = (hoy.getDay() + 6) % 7; // lunes = 0
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - dia);
    return { desde: iso(lunes), hasta: iso(hoy) };
  }
  if (atajo === "mes") {
    return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(hoy) };
  }
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
  return { desde: iso(inicio), hasta: iso(fin) };
};

export const desdeISO = (fecha: string) => new Date(`${fecha}T00:00:00`).toISOString();
export const hastaISO = (fecha: string) => new Date(`${fecha}T23:59:59.999`).toISOString();

/** Lista de días (YYYY-MM-DD) dentro del rango, máximo 400. */
export const diasDelRango = (rango: Rango) => {
  const dias: string[] = [];
  const cursor = new Date(`${rango.desde}T00:00:00`);
  const fin = new Date(`${rango.hasta}T00:00:00`);
  while (cursor <= fin && dias.length < 400) {
    dias.push(iso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
};

export const diaDeFecha = (f: string) => iso(new Date(f));

export const etiquetaDia = (dia: string) =>
  new Date(`${dia}T00:00:00`).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" });

/* ---------- Orden de tablas ---------- */

export type Direccion = "asc" | "desc";

export const ordenar = <T,>(filas: T[], clave: keyof T, dir: Direccion) =>
  [...filas].sort((a, b) => {
    const va = a[clave];
    const vb = b[clave];
    const cmp =
      typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va ?? "").localeCompare(String(vb ?? ""), "es-CL");
    return dir === "asc" ? cmp : -cmp;
  });

/* ---------- Exportar CSV ---------- */

const celda = (valor: unknown) => {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

/** CSV con separador ";" y BOM, listo para Excel en español. */
export const exportarCSV = (nombre: string, encabezados: string[], filas: unknown[][]) => {
  const cuerpo = [encabezados, ...filas].map((f) => f.map(celda).join(";")).join("\r\n");
  const blob = new Blob([`\uFEFF${cuerpo}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

export const promedio = (valores: number[]) =>
  valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : 0;

export const porcentaje = (parte: number, total: number) =>
  total > 0 ? Math.round((parte / total) * 1000) / 10 : 0;
