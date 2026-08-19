import { useState, type ReactNode } from "react";
import { Link, useRouterState, useRouter } from "@tanstack/react-router";
import {
  ChevronsUpDown,
  Check,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { useStore } from "@/components/StoreContext";
import { useAuth } from "@/components/AuthContext";
import { navParaRol, navAgrupada, ROL_ETIQUETA, tituloDeRuta } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { RESORTE, RESORTE_RAPIDO, SALIDA } from "@/lib/motion";
import { useGlowCursor } from "@/components/motion";
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

function SelectorTienda({ compacto = false }: { compacto?: boolean }) {
  const { store, stores, setStoreId } = useStore();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "glass flex w-full items-center gap-3 text-left transition-colors hover:bg-white/[0.08]",
            compacto ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
          )}
          aria-label="Cambiar tienda activa"
        >
          <motion.span
            layout
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: store.accent, boxShadow: `0 0 10px ${store.hex}` }}
          />
          {!compacto && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Tienda activa
                </span>
                <span className="block truncate font-display text-sm font-medium">
                  {store.nombre}
                </span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="glass-flotante w-[14.5rem] border-0 bg-transparent p-1.5 text-foreground"
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

function ItemNavLink({
  item,
  activo,
  colapsado,
  onNavigate,
  grupoId,
}: {
  item: { to: string; label: string; icon: React.ComponentType<any> };
  activo: boolean;
  colapsado: boolean;
  onNavigate?: (() => void) | undefined;
  grupoId: string;
}) {
  const { store } = useStore();
  const [hover, setHover] = useState(false);

  return (
    <div className="relative">
      <Link
        to={item.to}
        onClick={onNavigate}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={cn(
          "relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition-colors duration-150",
          colapsado && "justify-center px-0",
          activo ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {activo && (
          <motion.span
            layoutId={grupoId}
            transition={RESORTE}
            className="absolute inset-0 rounded-xl border border-white/[0.09] bg-white/[0.07]"
            style={{ boxShadow: `0 0 26px -8px ${store.hex}` }}
          />
        )}
        {activo && (
          <motion.span
            layoutId={`${grupoId}-barra`}
            transition={RESORTE}
            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
            style={{ background: store.accent }}
          />
        )}
        <item.icon className="relative size-4 shrink-0" style={activo ? { color: store.accent } : {}} />
        {!colapsado && <span className="relative truncate">{item.label}</span>}
      </Link>

      {/* Tooltip de vidrio al estar colapsado */}
      <AnimatePresence>
        {colapsado && hover && (
          <motion.span
            initial={{ opacity: 0, x: -6, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -4, transition: SALIDA }}
            transition={RESORTE_RAPIDO}
            className="glass-flotante pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap px-2.5 py-1.5 text-[12px]"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItems({
  onNavigate,
  colapsado = false,
  grupoId = "nav-activo",
}: {
  onNavigate?: () => void;
  colapsado?: boolean;
  grupoId?: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { usuario } = useAuth();
  const { sueltos, grupos } = navAgrupada(usuario?.rol);

  const item = (it: (typeof sueltos)[number]) => (
    <motion.div
      key={it.to}
      variants={{ oculto: { opacity: 0, x: -6 }, visible: { opacity: 1, x: 0 } }}
      transition={RESORTE_RAPIDO}
    >
      <ItemNavLink
        item={it}
        activo={pathname === it.to}
        colapsado={colapsado}
        onNavigate={onNavigate}
        grupoId={grupoId}
      />
    </motion.div>
  );

  return (
    <motion.div
      initial="oculto"
      animate="visible"
      variants={{ oculto: {}, visible: { transition: { staggerChildren: 0.03 } } }}
      className="flex flex-col gap-0.5"
    >
      {sueltos.map(item)}
      {grupos.map((g) => (
        <div key={g.grupo} className="group/bloque mt-2 border-t border-white/[0.06] pt-2">
          {!colapsado && (
            <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/40 transition-colors duration-200 group-hover/bloque:text-muted-foreground">
              {g.grupo}
            </p>
          )}
          <div className="flex flex-col gap-0.5">{g.items.map(item)}</div>
        </div>
      ))}
    </motion.div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { store } = useStore();
  const { usuario, salir } = useAuth();
  const router = useRouter();
  const [navAbierto, setNavAbierto] = useState(false);
  const [colapsado, setColapsado] = useState(false);
  const titulo = tituloDeRuta(pathname);
  const glow = useGlowCursor();
  const [sobreSidebar, setSobreSidebar] = useState(false);

  const cerrarSesion = async () => {
    await salir();
    await router.navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar fijo de vidrio */}
      <motion.aside
        animate={{ width: colapsado ? "4.5rem" : "15.5rem" }}
        transition={RESORTE}
        onMouseEnter={() => setSobreSidebar(true)}
        onMouseLeave={() => setSobreSidebar(false)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          glow.x.set(e.clientX - r.left);
          glow.y.set(e.clientY - r.top);
        }}
        className="glass relative hidden h-screen shrink-0 flex-col overflow-hidden rounded-none border-y-0 border-l-0 p-3.5 min-[900px]:flex"
      >
        {/* Glow del acento difundido desde el cursor */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          animate={{ opacity: sobreSidebar ? 1 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ background: glow.fondo }}
        />

        <div className="relative flex items-center gap-2.5 px-1 py-2">
          <motion.span
            layout
            className="grid size-8 shrink-0 place-items-center rounded-xl font-display text-sm font-bold text-background"
            style={{ background: store.accent, boxShadow: `0 0 22px -6px ${store.hex}` }}
          >
            r
          </motion.span>
          <AnimatePresence initial={false}>
            {!colapsado && (
              <motion.span
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: SALIDA }}
                transition={RESORTE_RAPIDO}
                className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold leading-tight tracking-tight"
              >
                riff store <span style={{ color: store.accent }}>OS</span>
              </motion.span>
            )}
          </AnimatePresence>
          <button
            onClick={() => setColapsado((v) => !v)}
            aria-label={colapsado ? "Expandir menú" : "Colapsar menú"}
            className={cn(
              "rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground",
              colapsado && "absolute right-0 top-full mt-1",
            )}
          >
            {colapsado ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>

        <nav className="relative mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pr-1">
          <NavItems colapsado={colapsado} />
        </nav>

        <div className="relative mt-3 space-y-2">
          <SelectorTienda compacto={colapsado} />
          <div
            className={cn(
              "glass flex items-center gap-3 p-2.5",
              colapsado && "justify-center p-2",
            )}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 font-display text-[11px]">
              {iniciales(usuario?.nombre ?? "")}
            </span>
            {!colapsado && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{usuario?.nombre}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {usuario ? ROL_ETIQUETA[usuario.rol] : ""}
                  </span>
                </span>
                <button
                  onClick={() => void cerrarSesion()}
                  aria-label="Cerrar sesión"
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.07] hover:text-foreground"
                >
                  <LogOut className="size-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </motion.aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior de vidrio con morph del título */}
        <header className="glass z-20 flex shrink-0 items-center gap-3 rounded-none border-x-0 border-t-0 px-4 py-3 min-[900px]:px-7">
          <div className="min-w-0">
            <AnimatePresence mode="wait" initial={false}>
              <motion.h2
                key={titulo}
                initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8, filter: "blur(4px)", transition: SALIDA }}
                transition={RESORTE}
                className="truncate font-display text-[15px] font-semibold leading-tight"
              >
                {titulo}
              </motion.h2>
            </AnimatePresence>
            <p className="text-[11px] text-muted-foreground first-letter:uppercase">
              {FECHA.format(new Date())}
            </p>
          </div>
          <motion.span
            key={store.id}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={RESORTE}
            className="ml-auto hidden rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs sm:block"
            style={{ color: store.accent }}
          >
            {store.nombre}
          </motion.span>
        </header>

        {/* Área de contenido con scroll propio */}
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-6 min-[900px]:px-7 min-[900px]:pb-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: SALIDA }}
              transition={{ type: "spring", stiffness: 240, damping: 28, mass: 0.9 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Nav inferior en móvil */}
      <nav className="glass fixed inset-x-0 bottom-0 z-30 rounded-none border-x-0 border-b-0 min-[900px]:hidden">
        <AnimatePresence initial={false}>
          {navAbierto && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: SALIDA }}
              transition={RESORTE}
              className="overflow-hidden border-b border-white/[0.08]"
            >
              <div className="max-h-[60vh] overflow-y-auto p-2">
                <NavItems onNavigate={() => setNavAbierto(false)} grupoId="nav-movil-lista" />
                <div className="mt-2">
                  <SelectorTienda />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="grid grid-cols-5 items-center gap-1 px-2 py-2">
          {navParaRol(usuario?.rol)
            .slice(0, 4)
            .map((item) => {
              const on = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setNavAbierto(false)}
                  className="relative flex flex-col items-center gap-1 rounded-xl py-1 text-[10px]"
                  style={on ? { color: store.accent } : undefined}
                >
                  {on && (
                    <motion.span
                      layoutId="nav-movil"
                      transition={RESORTE}
                      className="absolute inset-0 rounded-xl bg-white/[0.06]"
                    />
                  )}
                  <item.icon className={cn("relative size-5", !on && "text-muted-foreground")} />
                  <span className={cn("relative", !on && "text-muted-foreground")}>
                    {item.label}
                  </span>
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
