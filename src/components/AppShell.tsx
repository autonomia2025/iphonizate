import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Receipt,
  Package,
  Users,
  Wrench,
  BarChart3,
  Search,
  Bell,
  ChevronDown,
} from "lucide-react";
import { useStore } from "@/components/StoreContext";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const NAV = [
  { id: "resumen", label: "Resumen", icon: LayoutDashboard },
  { id: "ventas", label: "Ventas", icon: Receipt },
  { id: "inventario", label: "Inventario", icon: Package },
  { id: "servicios", label: "Servicio técnico", icon: Wrench },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "reportes", label: "Reportes", icon: BarChart3 },
];

function StoreSwitcher() {
  const { store, stores, setStoreId } = useStore();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="glass flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.08]">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: store.accent, boxShadow: `0 0 12px ${store.hex}` }}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-sm font-medium">{store.nombre}</span>
            <span className="block text-[11px] text-muted-foreground">Tienda activa</span>
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="glass w-[15rem] border-0 bg-transparent p-1.5 text-foreground"
      >
        {stores.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setStoreId(s.id);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-white/[0.07]",
              s.id === store.id && "bg-white/[0.06]",
            )}
          >
            <span className="size-2.5 rounded-full" style={{ background: s.accent }} />
            <span className="truncate">{s.nombre}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [activo, setActivo] = useState("resumen");
  const { store } = useStore();

  return (
    <div className="min-h-screen">
      {/* Sidebar escritorio */}
      <aside className="glass fixed left-0 top-0 z-30 hidden h-screen w-[16.5rem] flex-col gap-6 rounded-none border-y-0 border-l-0 p-4 min-[900px]:flex">
        <div className="flex items-center gap-2.5 px-1 pt-1">
          <span
            className="grid size-8 place-items-center rounded-xl font-display text-sm font-semibold text-background"
            style={{ background: store.accent }}
          >
            N
          </span>
          <span className="font-display text-base font-semibold tracking-tight">Nexus Retail</span>
        </div>

        <StoreSwitcher />

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const on = item.id === activo;
            return (
              <button
                key={item.id}
                onClick={() => setActivo(item.id)}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                  on
                    ? "bg-white/[0.07] text-foreground accent-glow"
                    : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                )}
              >
                {on && (
                  <span
                    className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full"
                    style={{ background: store.accent }}
                  />
                )}
                <item.icon
                  className="size-4"
                  style={on ? { color: store.accent } : undefined}
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="glass flex items-center gap-3 p-3">
          <span className="grid size-8 place-items-center rounded-full bg-white/10 font-display text-xs">
            CM
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm">Camila Muñoz</span>
            <span className="block text-[11px] text-muted-foreground">Administradora</span>
          </span>
        </div>
      </aside>

      <div className="min-[900px]:pl-[16.5rem]">
        {/* Barra superior */}
        <header className="glass sticky top-0 z-20 flex items-center gap-3 rounded-none border-x-0 border-t-0 px-4 py-3 min-[900px]:px-7">
          <div className="relative hidden flex-1 max-w-md sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Buscar boleta, cliente o IMEI…"
              className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-[var(--accent-store)] focus:ring-2 focus:ring-[var(--accent-store-soft)]"
            />
          </div>
          <span className="flex-1 font-display text-sm font-medium sm:hidden">Resumen</span>
          <div className="ml-auto flex items-center gap-2">
            <span
              className="hidden rounded-full border border-white/[0.08] px-3 py-1.5 text-xs sm:block"
              style={{ color: store.accent }}
            >
              {store.nombre}
            </span>
            <button className="grid size-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08]">
              <Bell className="size-4" />
            </button>
          </div>
        </header>

        <main className="px-4 pb-28 pt-6 min-[900px]:px-7 min-[900px]:pb-10">{children}</main>
      </div>

      {/* Nav inferior móvil */}
      <nav className="glass fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 rounded-none border-x-0 border-b-0 px-2 py-2 min-[900px]:hidden">
        {NAV.slice(0, 5).map((item) => {
          const on = item.id === activo;
          return (
            <button
              key={item.id}
              onClick={() => setActivo(item.id)}
              className="flex flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] transition-colors"
              style={on ? { color: store.accent } : undefined}
            >
              <item.icon className={cn("size-5", !on && "text-muted-foreground")} />
              <span className={cn(!on && "text-muted-foreground")}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
