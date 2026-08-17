import {
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

export const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/vender", label: "Vender", icon: ShoppingCart },
  { to: "/stock", label: "Stock", icon: Boxes },
  { to: "/inventario", label: "Inventario", icon: PackageSearch },
  { to: "/movimientos", label: "Movimientos", icon: ArrowLeftRight },
  { to: "/reservas", label: "Reservas", icon: BookmarkCheck },
  { to: "/garantias", label: "Garantías", icon: ShieldCheck },
  { to: "/tecnico", label: "Técnico", icon: Wrench },
  { to: "/caja", label: "Caja", icon: Banknote },
  { to: "/gastos", label: "Gastos", icon: ReceiptText },
  { to: "/accesorios", label: "Accesorios", icon: Headphones },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/precios", label: "Precios", icon: Tags },
  { to: "/metas", label: "Metas", icon: Target },
  { to: "/tareas", label: "Tareas", icon: ListChecks },
  { to: "/reportes", label: "Reportes", icon: BarChart3 },
  { to: "/auditoria", label: "Auditoría", icon: ScrollText },
] as const;

export const tituloDeRuta = (pathname: string) =>
  NAV.find((n) => n.to === pathname)?.label ?? "riff store OS";
