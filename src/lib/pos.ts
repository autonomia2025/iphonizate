import type { AppRol } from "@/lib/nav";

export const RECARGO_BOLETA = 0.09;

export const ROLES_CON_GANANCIAS: AppRol[] = ["direccion", "jefe_tienda"];

export const puedeVerGanancias = (rol?: AppRol | null) =>
  !!rol && ROLES_CON_GANANCIAS.includes(rol);

export type ItemEquipo = {
  tipo: "equipo";
  id: string;
  imei: string;
  modelo: string;
  gb: number | null;
  color: string | null;
  bateria: number | null;
  precio: string;
  sugerido: number | null;
  costo: number | null;
};

export type ItemAccesorio = {
  tipo: "accesorio";
  id: string;
  nombre: string;
  cantidad: number;
  precio: string;
  sugerido: number | null;
  costo: number | null;
};

export type ItemCarrito = ItemEquipo | ItemAccesorio;

export const aNumero = (valor: string) => {
  const limpio = valor.replace(/[^\d]/g, "");
  return limpio ? Number(limpio) : 0;
};

export const claveModelo = (modelo?: string | null, gb?: number | null) =>
  `${(modelo ?? "").trim().toLowerCase()}:${gb ?? 0}`;
