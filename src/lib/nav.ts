import {
  ClipboardCheck,
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  PackageSearch,
  ArrowLeftRight,
  BookmarkCheck,
  ShieldCheck,
  Wrench,
  Banknote,
  ReceiptText,
  Headphones,
  Users,
  Tags,
  Wrench,
  Target,
  ListChecks,
  BarChart3,
  ScrollText,
  Settings,
  ScanLine,
  FileText,
  HandCoins,
  Landmark,
  CalendarClock,
  PieChart,
  IdCard,
  Wallet,
} from "lucide-react";

export type AppRol = "direccion" | "jefe_tienda" | "administracion" | "operaciones" | "vendedor";

const TODOS: AppRol[] = ["direccion", "jefe_tienda", "administracion", "operaciones", "vendedor"];

export const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: TODOS },
  {
    to: "/vender",
    label: "Vender",
    icon: ShoppingCart,
    roles: ["direccion", "jefe_tienda", "vendedor"] as AppRol[],
  },
  { to: "/stock", label: "Stock", icon: Boxes, roles: TODOS },
  { to: "/escanear", label: "Escanear", icon: ScanLine, roles: TODOS },
  {
    to: "/inventario",
    label: "Inventario",
    icon: PackageSearch,
    roles: ["direccion", "jefe_tienda", "administracion", "operaciones"] as AppRol[],
  },
  {
    to: "/movimientos",
    label: "Movimientos",
    icon: ArrowLeftRight,
    roles: ["direccion", "jefe_tienda", "administracion", "operaciones"] as AppRol[],
  },
  {
    to: "/reservas",
    label: "Reservas",
    icon: BookmarkCheck,
    roles: ["direccion", "jefe_tienda", "administracion", "vendedor"] as AppRol[],
  },
  { to: "/garantias", label: "Garantías", icon: ShieldCheck, roles: TODOS },
  {
    to: "/tecnico",
    label: "Técnico",
    icon: Wrench,
    roles: ["direccion", "jefe_tienda", "administracion", "operaciones"] as AppRol[],
  },
  {
    to: "/caja",
    label: "Caja",
    icon: Banknote,
    roles: ["direccion", "jefe_tienda", "administracion", "vendedor"] as AppRol[],
  },
  {
    to: "/comprobantes",
    label: "Comprobantes",
    icon: FileText,
    roles: ["direccion", "jefe_tienda", "administracion", "vendedor"] as AppRol[],
  },
  {
    to: "/revision",
    label: "Revisión de pagos",
    icon: ClipboardCheck,
    roles: ["direccion", "administracion"] as AppRol[],
  },
  {
    to: "/gastos",
    label: "Gastos",
    icon: ReceiptText,
    roles: ["direccion", "jefe_tienda", "administracion"] as AppRol[],
  },
  { to: "/accesorios", label: "Accesorios", icon: Headphones, roles: TODOS },
  {
    to: "/clientes",
    label: "Clientes",
    icon: Users,
    roles: ["direccion", "jefe_tienda", "administracion", "vendedor"] as AppRol[],
  },
  { to: "/precios", label: "Precios", icon: Tags, roles: TODOS },
  {
    to: "/costos-arreglo",
    label: "Costos de arreglo",
    icon: Wrench,
    roles: ["direccion", "jefe_tienda", "administracion"] as AppRol[],
  },
  {
    to: "/metas",
    label: "Metas",
    icon: Target,
    roles: TODOS,
  },
  { to: "/tareas", label: "Tareas", icon: ListChecks, roles: TODOS },
  {
    to: "/reportes",
    label: "Reportes",
    icon: BarChart3,
    roles: ["direccion", "jefe_tienda", "administracion"] as AppRol[],
  },
  {
    to: "/auditoria",
    label: "Auditoría",
    icon: ScrollText,
    roles: ["direccion", "administracion"] as AppRol[],
  },
  {
    to: "/finanzas/remuneraciones",
    label: "Remuneraciones",
    icon: HandCoins,
    roles: ["direccion", "administracion"] as AppRol[],
  },
  {
    to: "/finanzas/gastos",
    label: "Gastos fijos y variables",
    icon: Wallet,
    roles: ["direccion", "administracion"] as AppRol[],
  },
  {
    to: "/finanzas/impuestos",
    label: "Impuestos",
    icon: Landmark,
    roles: ["direccion", "administracion"] as AppRol[],
  },
  {
    to: "/finanzas/calendario",
    label: "Calendario de pagos",
    icon: CalendarClock,
    roles: ["direccion", "administracion"] as AppRol[],
  },
  {
    to: "/finanzas/resumen",
    label: "Resumen financiero",
    icon: PieChart,
    roles: ["direccion", "administracion"] as AppRol[],
  },
  {
    to: "/finanzas/personal",
    label: "Personal",
    icon: IdCard,
    roles: ["direccion", "administracion"] as AppRol[],
  },
  {
    to: "/configuracion",
    label: "Configuración",
    icon: Settings,
    roles: ["direccion", "administracion"] as AppRol[],
  },
] as const;

export const navParaRol = (rol: AppRol | null | undefined) =>
  NAV.filter((item) => (rol ? (item.roles as readonly AppRol[]).includes(rol) : false));

export const ROL_ETIQUETA: Record<AppRol, string> = {
  direccion: "Dirección",
  jefe_tienda: "Jefe de tienda",
  administracion: "Administración",
  operaciones: "Operaciones",
  vendedor: "Vendedor",
};

export const tituloDeRuta = (pathname: string) =>
  NAV.find((n) => n.to === pathname)?.label ?? "iPhonizate OS";

/* ---------------- Agrupación del sidebar ---------------- */

export type GrupoNav = "Operación" | "Inventario" | "Administración" | "Finanzas";

const GRUPO_POR_RUTA: Record<string, GrupoNav> = {
  "/vender": "Operación",
  "/reservas": "Operación",
  "/garantias": "Operación",
  "/clientes": "Operación",
  "/tareas": "Operación",
  "/escanear": "Inventario",
  "/stock": "Inventario",
  "/inventario": "Inventario",
  "/movimientos": "Inventario",
  "/tecnico": "Inventario",
  "/accesorios": "Inventario",
  "/precios": "Inventario",
  "/costos-arreglo": "Inventario",
  "/caja": "Administración",
  "/comprobantes": "Administración",
  "/revision": "Administración",
  "/gastos": "Administración",
  "/metas": "Administración",
  "/reportes": "Administración",
  "/auditoria": "Administración",
  "/configuracion": "Administración",
  "/finanzas/remuneraciones": "Finanzas",
  "/finanzas/gastos": "Finanzas",
  "/finanzas/impuestos": "Finanzas",
  "/finanzas/calendario": "Finanzas",
  "/finanzas/resumen": "Finanzas",
  "/finanzas/personal": "Finanzas",
};

export const ORDEN_GRUPOS: GrupoNav[] = [
  "Operación",
  "Inventario",
  "Administración",
  "Finanzas",
];

export type ItemNav = (typeof NAV)[number];

/** Nav del rol agrupada en bloques, con el Dashboard suelto arriba. */
export function navAgrupada(rol: AppRol | null | undefined) {
  const items = navParaRol(rol);
  const sueltos = items.filter((i) => !GRUPO_POR_RUTA[i.to]);
  const grupos = ORDEN_GRUPOS.map((grupo) => ({
    grupo,
    items: items.filter((i) => GRUPO_POR_RUTA[i.to] === grupo),
  })).filter((g) => g.items.length > 0);
  return { sueltos, grupos };
}
