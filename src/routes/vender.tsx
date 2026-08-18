import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { useStore } from "@/components/StoreContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NuevoClienteModal, type ClienteBasico } from "@/components/vender/NuevoClienteModal";
import { formatCLP } from "@/lib/stores";
import { ESTADO_ETIQUETA, puedeVerCostos, type EquipoEstado } from "@/lib/inventario";
import {
  RECARGO_BOLETA,
  aNumero,
  claveModelo,
  puedeVerGanancias,
  type ItemAccesorio,
  type ItemCarrito,
  type ItemEquipo,
} from "@/lib/pos";

const DESC = "Punto de venta para registrar equipos, accesorios y formas de pago.";

export const Route = createFileRoute("/vender")({
  head: () => ({
    meta: [
      { title: "Vender · riff store OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Vender · riff store OS" },
      { property: "og:description", content: DESC },
    ],
  }),
  component: VenderPage,
});

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

function VenderPage() {
  const { usuario } = useAuth();
  const { store } = useStore();
  const rol = usuario?.rol ?? null;
  const conCostos = puedeVerCostos(rol);
  const conGanancias = puedeVerGanancias(rol);

  const [pestana, setPestana] = useState<"equipos" | "accesorios">("equipos");
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [conBoleta, setConBoleta] = useState(false);

  const [clienteQ, setClienteQ] = useState("");
  const [cliente, setCliente] = useState<ClienteBasico | null>(null);
  const [modalCliente, setModalCliente] = useState(false);
  const buscadorRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    buscadorRef.current?.focus();
  }, []);

  const tiendas = useQuery({
    queryKey: ["tiendas-slug"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tiendas").select("id, nombre, slug");
      if (error) throw error;
      return data ?? [];
    },
  });

  const tiendaActiva = useMemo(
    () => (tiendas.data ?? []).find((t) => t.slug === store.id) ?? null,
    [tiendas.data, store.id],
  );
  const nombreTienda = (id?: string | null) =>
    (tiendas.data ?? []).find((t) => t.id === id)?.nombre ?? "otra tienda";

  const stock = useQuery({
    queryKey: ["v_stock-pos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_stock")
        .select("id, imei, modelo, gb, color, bateria, estado, ubicacion_id, fecha_ingreso")
        .order("fecha_ingreso", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const costos = useQuery({
    queryKey: ["v_equipos_full-pos"],
    enabled: conCostos,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_equipos_full").select("id, costo");
      if (error) throw error;
      return data ?? [];
    },
  });

  const precios = useQuery({
    queryKey: ["precios"],
    queryFn: async () => {
      const { data, error } = await supabase.from("precios").select("modelo, gb, precio");
      if (error) throw error;
      return data ?? [];
    },
  });

  const accesorios = useQuery({
    queryKey: ["accesorios-pos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accesorios")
        .select("id, nombre, categoria, modelo, precio, costo")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const stockAcc = useQuery({
    queryKey: ["accesorios_stock-pos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accesorios_stock")
        .select("accesorio_id, tienda_id, cantidad");
      if (error) throw error;
      return data ?? [];
    },
  });

  const mapaCosto = useMemo(() => {
    const m = new Map<string, number | null>();
    (costos.data ?? []).forEach((c) => c.id && m.set(c.id, c.costo ?? null));
    return m;
  }, [costos.data]);

  const mapaPrecio = useMemo(() => {
    const m = new Map<string, number>();
    (precios.data ?? []).forEach((p) => m.set(claveModelo(p.modelo, p.gb), p.precio));
    return m;
  }, [precios.data]);

  const disponibles = useMemo(
    () =>
      (stock.data ?? []).filter(
        (e) => e.estado === "DISPONIBLE" && e.ubicacion_id === tiendaActiva?.id,
      ),
    [stock.data, tiendaActiva?.id],
  );

  const listaEquipos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return disponibles;
    return disponibles.filter(
      (e) =>
        (e.modelo ?? "").toLowerCase().includes(q) ||
        (e.imei ?? "").includes(q) ||
        (e.color ?? "").toLowerCase().includes(q),
    );
  }, [disponibles, busqueda]);

  const listaAccesorios = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const stockMapa = new Map<string, number>();
    (stockAcc.data ?? []).forEach((s) => {
      if (s.tienda_id === tiendaActiva?.id) stockMapa.set(s.accesorio_id, s.cantidad);
    });
    return (accesorios.data ?? [])
      .filter((a) => !q || a.nombre.toLowerCase().includes(q) || (a.modelo ?? "").toLowerCase().includes(q))
      .map((a) => ({ ...a, stock: stockMapa.get(a.id) ?? 0 }));
  }, [accesorios.data, stockAcc.data, tiendaActiva?.id, busqueda]);

  /* clientes */
  const clientes = useQuery({
    queryKey: ["clientes-pos", clienteQ],
    enabled: clienteQ.trim().length >= 2 && !cliente,
    queryFn: async () => {
      const q = clienteQ.trim();
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nombre, telefono")
        .or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`)
        .limit(6);
      if (error) throw error;
      const ids = (data ?? []).map((c) => c.id);
      let compras = new Map<string, number>();
      if (ids.length) {
        const { data: ventas } = await supabase
          .from("ventas")
          .select("cliente_id")
          .in("cliente_id", ids)
          .eq("anulada", false);
        compras = (ventas ?? []).reduce((m, v) => {
          if (v.cliente_id) m.set(v.cliente_id, (m.get(v.cliente_id) ?? 0) + 1);
          return m;
        }, new Map<string, number>());
      }
      return (data ?? []).map((c) => ({ ...c, compras: compras.get(c.id) ?? 0 }));
    },
  });

  /* agregar al carrito */
  const agregarEquipo = (e: {
    id: string;
    imei?: string | null;
    modelo?: string | null;
    gb?: number | null;
    color?: string | null;
    bateria?: number | null;
  }) => {
    if (carrito.some((i) => i.tipo === "equipo" && i.id === e.id)) {
      toast.info("Ese IMEI ya está en el carrito");
      return;
    }
    const sugerido = mapaPrecio.get(claveModelo(e.modelo, e.gb ?? null)) ?? null;
    const item: ItemEquipo = {
      tipo: "equipo",
      id: e.id,
      imei: e.imei ?? "",
      modelo: e.modelo ?? "",
      gb: e.gb ?? null,
      color: e.color ?? null,
      bateria: e.bateria ?? null,
      precio: sugerido ? String(sugerido) : "",
      sugerido,
      costo: mapaCosto.get(e.id) ?? null,
    };
    setCarrito((c) => [...c, item]);
    if (!sugerido) toast.warning("Sin precio definido para ese modelo, ingrésalo a mano");
  };

  const agregarAccesorio = (a: {
    id: string;
    nombre: string;
    precio: number;
    costo?: number | null;
  }) => {
    setCarrito((c) => {
      const existe = c.find((i) => i.tipo === "accesorio" && i.id === a.id) as
        | ItemAccesorio
        | undefined;
      if (existe)
        return c.map((i) =>
          i.tipo === "accesorio" && i.id === a.id ? { ...i, cantidad: i.cantidad + 1 } : i,
        );
      const item: ItemAccesorio = {
        tipo: "accesorio",
        id: a.id,
        nombre: a.nombre,
        cantidad: 1,
        precio: String(a.precio ?? 0),
        sugerido: a.precio ?? null,
        costo: a.costo ?? null,
      };
      return [...c, item];
    });
  };

  const escanear = (valor: string) => {
    const imei = valor.replace(/\D/g, "");
    if (imei.length !== 15) return;
    const equipo = (stock.data ?? []).find((e) => e.imei === imei);
    if (!equipo || !equipo.id) {
      toast.error(`No existe ningún equipo con el IMEI ${imei}`);
      setBusqueda("");
      return;
    }
    if (equipo.estado !== "DISPONIBLE") {
      toast.error(
        `Ese equipo está ${ESTADO_ETIQUETA[(equipo.estado ?? "POR_REVISAR") as EquipoEstado].toLowerCase()} en ${nombreTienda(equipo.ubicacion_id)}`,
      );
      setBusqueda("");
      return;
    }
    if (equipo.ubicacion_id !== tiendaActiva?.id) {
      toast.warning(
        `Ese equipo está en ${nombreTienda(equipo.ubicacion_id)}. Puedes consultarlo, pero no venderlo desde ${store.nombre}: trasládalo primero.`,
      );
      setBusqueda("");
      return;
    }
    agregarEquipo({
      id: equipo.id,
      imei: equipo.imei,
      modelo: equipo.modelo,
      gb: equipo.gb,
      color: equipo.color,
      bateria: equipo.bateria,
    });
    setBusqueda("");
    buscadorRef.current?.focus();
  };

  const quitar = (item: ItemCarrito) =>
    setCarrito((c) => c.filter((i) => !(i.tipo === item.tipo && i.id === item.id)));

  const actualizar = (item: ItemCarrito, cambios: Record<string, unknown>) =>
    setCarrito((c) =>
      c.map((i) =>
        i.tipo === item.tipo && i.id === item.id ? ({ ...i, ...cambios } as ItemCarrito) : i,
      ),
    );

  /* totales */
  const itemsEquipo = carrito.filter((i): i is ItemEquipo => i.tipo === "equipo");
  const itemsAcc = carrito.filter((i): i is ItemAccesorio => i.tipo === "accesorio");
  const subEquipos = itemsEquipo.reduce((s, i) => s + aNumero(i.precio), 0);
  const subAcc = itemsAcc.reduce((s, i) => s + aNumero(i.precio) * i.cantidad, 0);
  const base = subEquipos + subAcc;
  const recargo = conBoleta ? Math.round(base * RECARGO_BOLETA) : 0;
  const total = base + recargo;
  const costoTotal =
    itemsEquipo.reduce((s, i) => s + (i.costo ?? 0), 0) +
    itemsAcc.reduce((s, i) => s + (i.costo ?? 0) * i.cantidad, 0);
  const margen = base - costoTotal;

  const todosConPrecio = itemsEquipo.every((i) => aNumero(i.precio) > 0);
  const puedeContinuar = carrito.length > 0 && todosConPrecio;

  return (
    <div className="mx-auto max-w-[92rem]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Vender</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Venta en <span className="text-foreground">{store.nombre}</span> · solo equipos
            disponibles en esta tienda
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        {/* IZQUIERDA */}
        <div>
          <div className="glass p-4">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={buscadorRef}
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  const limpio = e.target.value.replace(/\D/g, "");
                  if (limpio.length === 15 && pestana === "equipos") escanear(limpio);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    escanear(busqueda);
                  }
                }}
                placeholder="Buscar por modelo o IMEI..."
                className="num h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-4 text-base outline-none transition-all duration-200 placeholder:font-sans placeholder:text-sm placeholder:text-muted-foreground focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
              />
            </label>
            <div className="mt-4 flex gap-2">
              {(["equipos", "accesorios"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPestana(t)}
                  className={`rounded-full border px-4 py-1.5 text-xs capitalize transition-all duration-200 ${
                    pestana === t
                      ? "accent-glow border-[var(--accent-store)]/50 bg-[var(--accent-store-soft)] text-foreground"
                      : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="solid-panel mt-6 overflow-hidden">
            <div className="border-b border-white/8 px-4 py-2.5 text-xs uppercase tracking-wide text-muted-foreground">
              {pestana === "equipos"
                ? `Equipos disponibles en ${store.nombre}`
                : `Accesorios · stock en ${store.nombre}`}
            </div>
            <div className="max-h-[32rem] overflow-y-auto">
              {pestana === "equipos" ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Modelo</th>
                      <th className="px-4 py-3 text-right font-medium">GB</th>
                      <th className="px-4 py-3 font-medium">Color</th>
                      <th className="px-4 py-3 text-right font-medium">Batería %</th>
                      <th className="px-4 py-3 font-medium">IMEI</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {listaEquipos.map((e) => (
                      <tr
                        key={e.id}
                        className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                      >
                        <td className="px-4 py-2.5">{e.modelo}</td>
                        <td className="num px-4 py-2.5 text-right">{e.gb ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{e.color ?? "—"}</td>
                        <td className="num px-4 py-2.5 text-right">{e.bateria ?? "—"}</td>
                        <td className="num px-4 py-2.5 text-muted-foreground">
                          ···{(e.imei ?? "").slice(-5)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Agregar ${e.modelo}`}
                            onClick={() => e.id && agregarEquipo({ ...e, id: e.id })}
                            className="size-8 border border-white/10 hover:border-[var(--accent-store)]/50"
                          >
                            <Plus className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {!listaEquipos.length && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                          No hay equipos disponibles en esta tienda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Accesorio</th>
                      <th className="px-4 py-3 font-medium">Modelo</th>
                      <th className="px-4 py-3 text-right font-medium">Stock</th>
                      <th className="px-4 py-3 text-right font-medium">Precio</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {listaAccesorios.map((a) => (
                      <tr
                        key={a.id}
                        className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                      >
                        <td className="px-4 py-2.5">{a.nombre}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{a.modelo ?? "—"}</td>
                        <td
                          className={`num px-4 py-2.5 text-right ${a.stock <= 0 ? "text-red-300" : ""}`}
                        >
                          {a.stock}
                        </td>
                        <td className="num px-4 py-2.5 text-right">{formatCLP(a.precio)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Agregar ${a.nombre}`}
                            onClick={() => agregarAccesorio(a)}
                            className="size-8 border border-white/10 hover:border-[var(--accent-store)]/50"
                          >
                            <Plus className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {!listaAccesorios.length && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                          Sin accesorios en el catálogo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* DERECHA */}
        <div className="glass h-fit p-5">
          <h2 className="font-display text-lg">La venta</h2>

          {/* cliente */}
          <div className="mt-4">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Cliente
            </span>
            {cliente ? (
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                <div>
                  <p className="text-sm">{cliente.nombre}</p>
                  <p className="num text-xs text-muted-foreground">{cliente.telefono ?? "sin teléfono"}</p>
                </div>
                <button
                  type="button"
                  aria-label="Quitar cliente"
                  onClick={() => {
                    setCliente(null);
                    setClienteQ("");
                  }}
                  className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <>
                <input
                  className={campo}
                  value={clienteQ}
                  onChange={(e) => setClienteQ(e.target.value)}
                  placeholder="Buscar por nombre o teléfono"
                />
                {clienteQ.trim().length >= 2 && (
                  <div className="mt-2 space-y-1">
                    {(clientes.data ?? []).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCliente(c)}
                        className="flex w-full items-center justify-between rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-left text-sm transition-colors duration-200 hover:border-[var(--accent-store)]/40"
                      >
                        <span>
                          {c.nombre}
                          <span className="num ml-2 text-xs text-muted-foreground">
                            {c.telefono ?? ""}
                          </span>
                        </span>
                        {c.compras > 0 && (
                          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                            Recurrente · {c.compras} {c.compras === 1 ? "compra" : "compras"}
                          </span>
                        )}
                      </button>
                    ))}
                    {!clientes.isFetching && !(clientes.data ?? []).length && (
                      <p className="px-1 py-1 text-xs text-muted-foreground">
                        Sin resultados para “{clienteQ.trim()}”.
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs text-amber-300/80">Venta sin cliente asignado</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setModalCliente(true)}
                  >
                    <UserPlus className="size-3.5" /> Cliente nuevo
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* carrito */}
          <div className="mt-5 space-y-3">
            {!carrito.length && (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-sm text-muted-foreground">
                Escanea o agrega equipos y accesorios para armar la venta.
              </p>
            )}

            {itemsEquipo.map((i) => {
              const valor = aNumero(i.precio);
              const bajo = i.sugerido !== null && valor > 0 && valor < i.sugerido;
              return (
                <div
                  key={`eq-${i.id}`}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm">
                        {i.modelo} · {i.gb ?? "—"} GB · {i.color ?? "—"}
                      </p>
                      <p className="num text-xs text-muted-foreground">{i.imei}</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Quitar equipo"
                      onClick={() => quitar(i)}
                      className="text-muted-foreground transition-colors duration-200 hover:text-red-300"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <input
                    className={`${campo} num mt-2 text-right ${!valor ? "border-amber-400/50 ring-2 ring-amber-400/20" : ""}`}
                    value={i.precio}
                    inputMode="numeric"
                    placeholder="Precio a definir"
                    onChange={(e) => actualizar(i, { precio: e.target.value.replace(/[^\d]/g, "") })}
                  />
                  {bajo && (
                    <p className="mt-1.5 text-xs text-amber-300">
                      Bajo el sugerido {formatCLP(i.sugerido!)} · diferencia{" "}
                      {formatCLP(i.sugerido! - valor)}
                    </p>
                  )}
                  {!valor && (
                    <p className="mt-1.5 text-xs text-amber-300">Falta el precio de este equipo</p>
                  )}
                </div>
              );
            })}

            {itemsAcc.map((i) => {
              const valor = aNumero(i.precio);
              return (
                <div
                  key={`ac-${i.id}`}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm">
                      {i.nombre}
                      {valor === 0 && (
                        <span className="ml-2 rounded-full border border-sky-400/25 bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-300">
                          Incluido
                        </span>
                      )}
                    </p>
                    <button
                      type="button"
                      aria-label="Quitar accesorio"
                      onClick={() => quitar(i)}
                      className="text-muted-foreground transition-colors duration-200 hover:text-red-300"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
                    <input
                      className={`${campo} num text-center`}
                      value={i.cantidad}
                      inputMode="numeric"
                      aria-label="Cantidad"
                      onChange={(e) =>
                        actualizar(i, { cantidad: Math.max(1, aNumero(e.target.value) || 1) })
                      }
                    />
                    <input
                      className={`${campo} num text-right`}
                      value={i.precio}
                      inputMode="numeric"
                      aria-label="Precio"
                      onChange={(e) =>
                        actualizar(i, { precio: e.target.value.replace(/[^\d]/g, "") })
                      }
                    />
                  </div>
                  {valor === 0 && (
                    <p className="mt-1.5 text-xs text-sky-300/80">
                      Regalado: no suma al total y baja el margen.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* totales */}
          <div className="mt-5 space-y-2 border-t border-white/8 pt-4 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal equipos</span>
              <span className="num text-foreground">{formatCLP(subEquipos)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal accesorios</span>
              <span className="num text-foreground">{formatCLP(subAcc)}</span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-muted-foreground">Con boleta</span>
              <Switch checked={conBoleta} onCheckedChange={setConBoleta} aria-label="Con boleta" />
            </div>
            {conBoleta && (
              <div className="flex justify-between text-muted-foreground">
                <span>Recargo boleta (9%)</span>
                <span className="num text-foreground">{formatCLP(recargo)}</span>
              </div>
            )}

            <div className="flex items-baseline justify-between border-t border-white/8 pt-3">
              <span className="font-display text-base">Total</span>
              <span className="num font-display text-2xl font-semibold">{formatCLP(total)}</span>
            </div>

            {conGanancias && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Margen estimado</span>
                <span className={`num ${margen < 0 ? "text-red-300" : "text-emerald-300"}`}>
                  {formatCLP(margen)}
                </span>
              </div>
            )}
          </div>

          <Button
            disabled={!puedeContinuar}
            onClick={() => setModalPago(true)}
            className="accent-glow mt-5 h-12 w-full bg-[var(--accent-store)] text-base text-white hover:bg-[var(--accent-store)]/90 disabled:opacity-40"
          >
            Continuar al pago
          </Button>
        </div>
      </div>

      <NuevoClienteModal
        abierto={modalCliente}
        onCerrar={() => setModalCliente(false)}
        onCreado={(c) => setCliente(c)}
        nombreInicial={/^[\d+\s]+$/.test(clienteQ) ? "" : clienteQ}
        telefonoInicial={/^[\d+\s]+$/.test(clienteQ) ? clienteQ : ""}
      />

      <PagoModal
        abierto={modalPago}
        onCerrar={() => setModalPago(false)}
        total={total}
        carrito={carrito}
        tiendaId={tiendaActiva?.id ?? null}
        clienteId={cliente?.id ?? null}
        conBoleta={conBoleta}
        onConfirmada={(v) => {
          setModalPago(false);
          setVenta({
            id: v.id,
            total: v.total,
            recargo,
            conBoleta,
            cliente: cliente?.nombre ?? null,
            tienda: store.nombre,
            items: carrito,
            pagos: v.pagos,
          });
          void stock.refetch();
          void stockAcc.refetch();
        }}
      />
    </div>
  );
}
