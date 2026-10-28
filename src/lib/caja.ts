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

// Siempre en hora de Chile, sin importar la zona horaria del equipo.
const ZONA = "America/Santiago";

export const hoyISO = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());

/** Diferencia (ms) entre la hora de Chile y UTC en un instante dado. */
const offsetChile = (d: Date) => {
  const p: { year: string; month: string; day: string; hour: string; minute: string; second: string } = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONA,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  ) as never;
  const comoUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return comoUTC - Math.floor(d.getTime() / 1000) * 1000;
};

/** Convierte "AAAA-MM-DD" + hora de Chile a un Date real. */
export const horaChile = (fecha: string, hora: string) => {
  const ingenua = new Date(`${fecha}T${hora}Z`);
  return new Date(ingenua.getTime() - offsetChile(ingenua));
};

export const inicioDia = (fecha: string) => horaChile(fecha, "00:00:00");
export const finDia = (fecha: string) => new Date(horaChile(fecha, "23:59:59").getTime() + 999);

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
