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
    id: "pro-iphone",
    nombre: "Pro Phone",
    hex: "#16A34A",
    accent: "oklch(0.627 0.17 149.2)",
    accentSoft: "oklch(0.627 0.17 149.2 / 0.18)",
  },
  {
    id: "markt-store",
    nombre: "Markt Store",
    hex: "#DC2626",
    accent: "oklch(0.577 0.245 27.325)",
    accentSoft: "oklch(0.577 0.245 27.325 / 0.18)",
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
 * Datos de contacto que salen impresos en el comprobante de garantía.
 * Quedan vacíos a propósito: se completan con la información real de cada
 * tienda y lo que esté vacío simplemente no se imprime.
 */
export type ContactoTienda = {
  /** Frase corta bajo el nombre de la tienda */
  lema?: string;
  whatsapp?: string;
  correo?: string;
  web?: string;
  instagram?: string;
  direccion?: string;
  /** A quién y a qué sucursal de courier mandar los equipos desde otras ciudades */
  envio?: string;
  rut?: string;
};

export const CONTACTO_TIENDA: Record<string, ContactoTienda> = {
  "black-pink-phone": {},
  riffstore: {},
  iphonizate: {},
  "pro-iphone": {},
  "markt-store": {},
  bodega: {},
};

/** A dónde mandan los clientes de regiones sus equipos (igual para todas las tiendas) */
export const ENVIO_REGIONES = "Chilexpress, sucursal Coyancura 2244";

/** El mismo horario para todas las tiendas */
export const HORARIO_ATENCION = "Lunes a viernes de 10:00 a 19:00 · sábado de 11:00 a 15:00";

/** Meses de garantía de cada tienda (Riffstore da 12; el resto, 6) */
export const GARANTIA_MESES_TIENDA: Record<string, number> = {
  riffstore: 12,
  iphonizate: 6,
  "markt-store": 6,
  "pro-iphone": 6,
  "black-pink-phone": 6,
};

export const garantiaMeses = (slug?: string | null) => GARANTIA_MESES_TIENDA[slug ?? ""] ?? 6;

export const GARANTIA_CUBRE = [
  "Cualquier falla de funcionamiento del equipo que no venga de un daño externo.",
  "Pantalla, cámara, altavoces, micrófono, botones, carga y conectividad.",
  "Revisión sin costo y, si corresponde, reparación o reemplazo del equipo.",
];

export const GARANTIA_NO_CUBRE = [
  "Golpes, caídas y cualquier daño físico externo.",
  "Contacto con líquidos o humedad.",
  "Pantalla trizada o rayada por uso.",
  "Equipos abiertos o intervenidos por un técnico ajeno a la tienda.",
  "Accesorios de regalo (cargador, mica y case), que no tienen garantía.",
];

/** Términos del comprobante; el último ("Consultas") se agrega solo si la tienda tiene contacto. */
export const garantiaTerminos = (meses: number) => [
  "Esta garantía es personal e intransferible y la hace efectiva únicamente el titular indicado en este comprobante, presentándolo junto a su cédula de identidad y el mismo teléfono de contacto registrado.",
  `La cobertura es de ${meses} meses contados desde la fecha de venta, para todos los modelos, sin distinción.`,
  "La garantía no cubre daños por humedad, golpes, pantalla trizada ni ningún daño físico externo, ni equipos abiertos o intervenidos por terceros.",
  "La tienda decide, según disponibilidad, si repara o reemplaza el equipo. Si no es posible ninguna de las dos, se devuelve el dinero.",
  "El equipo debe entregarse con la sesión de iCloud cerrada y sin bloqueo de activación. Sin eso no se puede revisar.",
  `Esta garantía de ${meses} meses es voluntaria de la tienda y se suma a los derechos que la Ley 19.496 otorga al consumidor, sin reemplazarlos ni limitarlos.`,
];

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export const formatCLP = (valor: number) => clp.format(Math.round(valor)).replace(/\s/g, "");

export const formatNumero = (valor: number) => new Intl.NumberFormat("es-CL").format(valor);
