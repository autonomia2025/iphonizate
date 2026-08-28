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
    nombre: "Bodega",
    hex: "#38BDF8",
    accent: "oklch(0.746 0.16 232.7)",
    accentSoft: "oklch(0.746 0.16 232.7 / 0.18)",
  },
];

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export const formatCLP = (valor: number) => clp.format(Math.round(valor)).replace(/\s/g, "");

export const formatNumero = (valor: number) => new Intl.NumberFormat("es-CL").format(valor);
