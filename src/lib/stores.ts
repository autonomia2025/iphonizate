export type Store = {
  id: string;
  nombre: string;
  /* acento en oklch para tokens */
  accent: string;
  accentSoft: string;
  hex: string;
};

export const STORES: Store[] = [
  {
    id: "black-pink-phone",
    nombre: "Black Pink Phone",
    hex: "#EC4899",
    accent: "oklch(0.653 0.213 354.3)",
    accentSoft: "oklch(0.653 0.213 354.3 / 0.18)",
  },
  {
    id: "riffstore",
    nombre: "Riffstore",
    hex: "#8B5CF6",
    accent: "oklch(0.627 0.203 293.4)",
    accentSoft: "oklch(0.627 0.203 293.4 / 0.18)",
  },
  {
    id: "iphonizate",
    nombre: "iPhonizate",
    hex: "#F59E0B",
    accent: "oklch(0.769 0.163 70.1)",
    accentSoft: "oklch(0.769 0.163 70.1 / 0.18)",
  },
  {
    id: "bodega",
    nombre: "Oficina Central",
    hex: "#7DD3FC",
    accent: "oklch(0.862 0.138 218.7)",
    accentSoft: "oklch(0.862 0.138 218.7 / 0.18)",
  },
];

/**
 * Datos de contacto que salen impresos en el comprobante.
 * Quedan vacíos a propósito: se completan con la información real de cada
 * tienda y lo que esté vacío simplemente no se imprime.
 */
export type ContactoTienda = {
  direccion?: string;
  telefono?: string;
  instagram?: string;
  rut?: string;
};

export const CONTACTO_TIENDA: Record<string, ContactoTienda> = {
  "black-pink-phone": {},
  riffstore: {},
  iphonizate: {},
  bodega: {},
};

export const GARANTIA_MESES = 6;

export const GARANTIA_TITULO = `Garantía de ${GARANTIA_MESES} meses por fallas de fábrica`;

export const GARANTIA_CONDICIONES = [
  "Cubre fallas internas del equipo: placa, batería, cámara, parlantes, carga y pantalla sin daño físico.",
  "No cubre daños por golpes, humedad o líquidos, ni equipos abiertos o reparados por terceros.",
  "No cubre accesorios ni bloqueos por olvido de clave o cuenta iCloud del cliente.",
  "Para hacerla efectiva presenta este comprobante en la tienda con el equipo y su IMEI.",
];

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export const formatCLP = (valor: number) => clp.format(Math.round(valor)).replace(/\s/g, "");

export const formatNumero = (valor: number) => new Intl.NumberFormat("es-CL").format(valor);
