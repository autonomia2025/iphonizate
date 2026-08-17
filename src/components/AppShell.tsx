import { useState, type ReactNode } from "react";
import { Link, useRouterState, useRouter } from "@tanstack/react-router";
import { ChevronsUpDown, Check, LogOut } from "lucide-react";
import { useStore } from "@/components/StoreContext";
import { useAuth } from "@/components/AuthContext";
import { navParaRol, ROL_ETIQUETA, tituloDeRuta } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const iniciales = (nombre: string) =>
  nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

const FECHA = new Intl.DateTimeFormat("es-CL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function SelectorTienda() {
  const { store, stores, setStoreId } = useStore();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="glass flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.08]">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: store.accent, boxShadow: `0 0 10px ${store.hex}` }}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Tienda activa
            </span>
            <span className="block truncate font-display text-sm font-medium">{store.nombre}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="glass w-[14.5rem] border-0 bg-transparent p-1.5 text-foreground"
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
            <span className="min-w-0 flex-1 truncate text-left">{s.nombre}</span>
            {s.id === store.id && <Check className="size-3.5" style={{ color: s.accent }} />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { store } = useStore();

  return (
    <>
      {NAV.map((item) => {
        const on = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition-colors",
              on
                ? "bg-white/[0.07] text-foreground accent-glow"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
            )}
          >
            {on && (
              <span
                className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
                style={{ background: store.accent }}
              />
            )}
            <item.icon className="size-4 shrink-0" style={on ? { color: store.accent } : undefined} />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { store } = useStore();
  const [navAbierto, setNavAbierto] = useState(false);
  const titulo = tituloDeRuta(pathname);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar fijo de vidrio */}
      <aside className="glass hidden h-screen w-[15.5rem] shrink-0 flex-col rounded-none border-y-0 border-l-0 p-3.5 min-[900px]:flex">
        <div className="flex items-center gap-2.5 px-1 py-2">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-xl font-display text-sm font-bold text-background"
            style={{ background: store.accent, boxShadow: `0 0 22px -6px ${store.hex}` }}
          >
            r
          </span>
          <span className="font-display text-[15px] font-semibold leading-tight tracking-tight">
            riff store <span style={{ color: store.accent }}>OS</span>
          </span>
        </div>

        <nav className="mt-3 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1">
          <NavItems />
        </nav>

        <div className="mt-3 space-y-2">
          <SelectorTienda />
          <div className="glass flex items-center gap-3 p-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 font-display text-[11px]">
              CM
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px]">Camila Muñoz</span>
              <span className="block text-[11px] text-muted-foreground">Administradora</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior de vidrio */}
        <header className="glass z-20 flex shrink-0 items-center gap-3 rounded-none border-x-0 border-t-0 px-4 py-3 min-[900px]:px-7">
          <div className="min-w-0">
            <h2 className="truncate font-display text-[15px] font-semibold leading-tight">
              {titulo}
            </h2>
            <p className="text-[11px] text-muted-foreground first-letter:uppercase">{FECHA.format(new Date())}</p>
          </div>
          <span
            className="ml-auto hidden rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs sm:block"
            style={{ color: store.accent }}
          >
            {store.nombre}
          </span>
        </header>

        {/* Área de contenido con scroll propio */}
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-6 min-[900px]:px-7 min-[900px]:pb-10">
          {children}
        </main>
      </div>

      {/* Nav inferior en móvil */}
      <nav className="glass fixed inset-x-0 bottom-0 z-30 rounded-none border-x-0 border-b-0 min-[900px]:hidden">
        {navAbierto && (
          <div className="max-h-[60vh] overflow-y-auto border-b border-white/[0.08] p-2">
            <div className="flex flex-col gap-0.5">
              <NavItems onNavigate={() => setNavAbierto(false)} />
            </div>
            <div className="mt-2">
              <SelectorTienda />
            </div>
          </div>
        )}
        <div className="grid grid-cols-5 items-center gap-1 px-2 py-2">
          {NAV.slice(0, 4).map((item) => {
            const on = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setNavAbierto(false)}
                className="flex flex-col items-center gap-1 rounded-xl py-1 text-[10px]"
                style={on ? { color: store.accent } : undefined}
              >
                <item.icon className={cn("size-5", !on && "text-muted-foreground")} />
                <span className={cn(!on && "text-muted-foreground")}>{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setNavAbierto((v) => !v)}
            className="flex flex-col items-center gap-1 rounded-xl py-1 text-[10px] text-muted-foreground"
          >
            <ChevronsUpDown className="size-5" />
            Más
          </button>
        </div>
      </nav>
    </div>
  );
}
