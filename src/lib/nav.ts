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
  Target,
  ListChecks,
  BarChart3,
  ScrollText,
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
    to: "/metas",
    label: "Metas",
    icon: Target,
    roles: ["direccion", "jefe_tienda", "administracion"] as AppRol[],
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
  NAV.find((n) => n.to === pathname)?.label ?? "riff store OS";
