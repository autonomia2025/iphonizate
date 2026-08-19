import type { AppRol } from "@/lib/nav";
import type { MetodoPago } from "@/lib/pos";

export const ROLES_CAJA: AppRol[] = ["direccion", "jefe_tienda", "administracion"];
export const puedeCerrarCaja = (rol?: AppRol | null) => !!rol && ROLES_CAJA.includes(rol);

export const ROLES_GASTOS: AppRol[] = ["direccion", "jefe_tienda", "administracion"];
export const puedeGestionarGastos = (rol?: AppRol | null) => !!rol && ROLES_GASTOS.includes(rol);

export const ESTADOS_EN_CAJA = ["DISPONIBLE", "POR_REVISAR", "RESERVADO"] as const;

export const METODOS_CAJA: { valor: MetodoPago; label: string }[] = [
  { valor: "efectivo", label: "Efectivo" },
  { valor: "transferencia", label: "Transferencia" },
  { valor: "credito", label: "Crédito" },
  { valor: "partePago", label: "Parte de pago" },
];

export const CATEGORIAS_GASTO = [
  "Arriendo",
  "Remuneraciones",
  "Publicidad",
  "Servicios básicos",
  "Insumos",
  "Repuestos",
  "Comisiones",
  "Otro",
] as const;

export const hoyISO = () => {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

export const inicioDia = (fecha: string) => new Date(`${fecha}T00:00:00`);
export const finDia = (fecha: string) => new Date(`${fecha}T23:59:59.999`);

export const fechaCorta = (f: string) =>
  new Date(f).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });

export const fechaHoraCorta = (f: string) =>
  new Date(f).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const aMonto = (valor: string) => {
  const limpio = valor.replace(/[^\d]/g, "");
  return limpio ? Number(limpio) : 0;
};
