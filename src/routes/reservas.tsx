import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { useStore } from "@/components/StoreContext";
import { Button } from "@/components/ui/button";
import { NuevoClienteModal, type ClienteBasico } from "@/components/vender/NuevoClienteModal";
import { PagoFilasModal, type PagoPlano } from "@/components/reservas/PagoFilasModal";
import { formatCLP } from "@/lib/stores";
import { ESTADO_ETIQUETA, type EquipoEstado } from "@/lib/inventario";
import {
  aNumero,
  claveModelo,
  type ItemAccesorio,
  type ItemCarrito,
  type ItemEquipo,
} from "@/lib/pos";
import type { AppRol } from "@/lib/nav";

const DESC = "Equipos apartados con abono: crea reservas, cobra el saldo o cancélalas.";

export const Route = createFileRoute("/reservas")({
  head: () => ({
    meta: [
      { title: "Reservas · riff store OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Reservas · riff store OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReservasPage,
});

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

const ROLES_QUE_CANCELAN: AppRol[] = ["direccion", "jefe_tienda", "administracion"];

const dias = (fecha: string) =>
  Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000);

const fechaCorta = (f: string) =>
  new Date(f).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });

function ReservasPage() {
  const { usuario } = useAuth();
  const { store } = useStore();
  const rol = usuario?.rol ?? null;
  const puedeCancelar = !!rol && ROLES_QUE_CANCELAN.includes(rol);

  const [pestana, setPestana] = useState<"equipos" | "accesorios">("equipos");
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [clienteQ, setClienteQ] = useState("");
  const [cliente, setCliente] = useState<ClienteBasico | null>(null);
  const [modalCliente, setModalCliente] = useState(false);
  const [abono, setAbono] = useState("");
  const [modalAbono, setModalAbono] = useState(false);
  const [completando, setCompletando] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [destinoAbono, setDestinoAbono] = useState<"devuelto" | "retenido">("devuelto");
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
    queryKey: ["v_stock-reservas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_stock")
        .select("id, imei, modelo, gb, color, bateria, estado, ubicacion_id, fecha_ingreso")
        .order("fecha_ingreso", { ascending: false });
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
        .from("v_accesorios")
        .select("id, nombre, categoria, modelo, precio, costo")
        .order("nombre");
      if (error) throw error;
      return (data ?? []).map((a) => ({
        id: a.id as string,
        nombre: a.nombre ?? "",
        categoria: a.categoria,
        modelo: a.modelo,
        precio: a.precio ?? 0,
        costo: a.costo,
      }));
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

  const reservas = useQuery({
    queryKey: ["reservas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservas")
        .select(
          "id, total, abono, saldo, estado, destino_abono, fecha, tienda_id, cliente_id, clientes(nombre, telefono), reserva_items(id, precio, equipo_id, accesorio_id, equipos(imei, modelo, gb, color), accesorios(nombre))",
        )
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

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
      .filter(
        (a) => !q || a.nombre.toLowerCase().includes(q) || (a.modelo ?? "").toLowerCase().includes(q),
      )
      .map((a) => ({ ...a, stock: stockMapa.get(a.id) ?? 0 }));
  }, [accesorios.data, stockAcc.data, tiendaActiva?.id, busqueda]);

  const clientes = useQuery({
    queryKey: ["clientes-reservas", clienteQ],
    enabled: clienteQ.trim().length >= 2 && !cliente,
    queryFn: async () => {
      const q = clienteQ.trim();
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nombre, telefono")
        .or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`)
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  /* carrito */
  const agregarEquipo = (e: {
    id: string;
    imei?: string | null;
    modelo?: string | null;
    gb?: number | null;
    color?: string | null;
    bateria?: number | null;
  }) => {
    if (carrito.some((i) => i.tipo === "equipo" && i.id === e.id)) {
      toast.info("Ese IMEI ya está en la reserva");
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
      costo: null,
    };
    setCarrito((c) => [...c, item]);
    if (!sugerido) toast.warning("Sin precio definido para ese modelo, ingrésalo a mano");
  };

  const agregarAccesorio = (a: { id: string; nombre: string; precio: number }) =>
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
        costo: null,
      };
      return [...c, item];
    });

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
        `Ese equipo está en ${nombreTienda(equipo.ubicacion_id)}: trasládalo antes de reservarlo desde ${store.nombre}.`,
      );
      setBusqueda("");
      return;
    }
    agregarEquipo({ ...equipo, id: equipo.id });
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

  const itemsEquipo = carrito.filter((i): i is ItemEquipo => i.tipo === "equipo");
  const itemsAcc = carrito.filter((i): i is ItemAccesorio => i.tipo === "accesorio");
  const total =
    itemsEquipo.reduce((s, i) => s + aNumero(i.precio), 0) +
    itemsAcc.reduce((s, i) => s + aNumero(i.precio) * i.cantidad, 0);
  const montoAbono = aNumero(abono);
  const saldo = Math.max(0, total - montoAbono);
  const abonoValido = montoAbono > 0 && montoAbono < total;
  const todosConPrecio = itemsEquipo.every((i) => aNumero(i.precio) > 0);
  const puedeReservar = carrito.length > 0 && todosConPrecio && !!cliente && abonoValido;

  const refrescar = () => {
    void reservas.refetch();
    void stock.refetch();
    void stockAcc.refetch();
  };

  const confirmarReserva = async (pagos: PagoPlano[]) => {
    if (!tiendaActiva?.id || !cliente) throw new Error("Falta la tienda o el cliente");
    const items = carrito.map((i) =>
      i.tipo === "equipo"
        ? { tipo: "equipo", equipo_id: i.id, precio: aNumero(i.precio) }
        : {
            tipo: "accesorio",
            accesorio_id: i.id,
            cantidad: i.cantidad,
            precio: aNumero(i.precio),
          },
    );
    const { error } = await supabase.rpc("crear_reserva", {
      _tienda: tiendaActiva.id,
      _cliente: cliente.id,
      _items: items,
      _abono: montoAbono,
      _pagos: pagos,
    });
    if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
    toast.success("Reserva creada: los equipos quedaron apartados");
    setModalAbono(false);
    setCarrito([]);
    setCliente(null);
    setClienteQ("");
    setAbono("");
    setBusqueda("");
    refrescar();
    setTimeout(() => buscadorRef.current?.focus(), 50);
  };

  const reservaEnCurso = useMemo(
    () => (reservas.data ?? []).find((r) => r.id === completando) ?? null,
    [reservas.data, completando],
  );

  const completarReserva = async (pagos: PagoPlano[]) => {
    if (!completando) return;
    const { error } = await supabase.rpc("completar_reserva", {
      _reserva: completando,
      _pagos: pagos,
    });
    if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
    toast.success("Reserva completada: la venta quedó registrada");
    setCompletando(null);
    refrescar();
  };

  const cancelarReserva = async () => {
    if (!cancelando) return;
    const { error } = await supabase.rpc("cancelar_reserva", {
      _reserva: cancelando,
      _destino_abono: destinoAbono,
    });
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    toast.success(
      destinoAbono === "devuelto"
        ? "Reserva cancelada: el abono se devuelve al cliente"
        : "Reserva cancelada: el abono queda retenido",
    );
    setCancelando(null);
    setDestinoAbono("devuelto");
    refrescar();
  };

  const activas = (reservas.data ?? []).filter((r) => r.estado === "activa");
  const historial = (reservas.data ?? []).filter((r) => r.estado !== "activa");

  const descItems = (r: (typeof activas)[number]) =>
    (r.reserva_items ?? []).map((it) =>
      it.equipos
        ? `${it.equipos.modelo}${it.equipos.gb ? ` · ${it.equipos.gb} GB` : ""}${it.equipos.color ? ` · ${it.equipos.color}` : ""}`
        : (it.accesorios?.nombre ?? "Ítem"),
    );

  return (
    <div className="mx-auto max-w-[92rem]">
      <div>
        <h1 className="font-display text-2xl font-semibold">Reservas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Equipos apartados con abono en <span className="text-foreground">{store.nombre}</span> ·
          no cuentan como venta hasta completarse
        </p>
      </div>

      {/* ZONA 1 — NUEVA RESERVA */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
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
            <div className="max-h-[26rem] overflow-y-auto">
              {pestana === "equipos" ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Modelo</th>
                      <th className="px-4 py-3 text-right font-medium">GB</th>
                      <th className="px-4 py-3 font-medium">Color</th>
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
                        <td className="num px-4 py-2.5 text-muted-foreground">
                          ···{(e.imei ?? "").slice(-5)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Reservar ${e.modelo}`}
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
                        <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
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
                        <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
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

        {/* panel de la reserva */}
        <div className="glass h-fit p-5">
          <h2 className="font-display text-lg">Nueva reserva</h2>

          <div className="mt-4">
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Cliente (obligatorio)
            </span>
            {cliente ? (
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                <div>
                  <p className="text-sm">{cliente.nombre}</p>
                  <p className="num text-xs text-muted-foreground">{cliente.telefono ?? "—"}</p>
                </div>
                <button
                  type="button"
                  aria-label="Quitar cliente"
                  onClick={() => setCliente(null)}
                  className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    className={campo}
                    value={clienteQ}
                    placeholder="Nombre o teléfono"
                    onChange={(e) => setClienteQ(e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    aria-label="Nuevo cliente"
                    onClick={() => setModalCliente(true)}
                    className="size-10 shrink-0 border border-white/10 p-0"
                  >
                    <UserPlus className="size-4" />
                  </Button>
                </div>
                {!!clientes.data?.length && (
                  <div className="mt-2 space-y-1">
                    {clientes.data.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCliente(c as ClienteBasico)}
                        className="w-full rounded-lg border border-white/8 px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-white/[0.05]"
                      >
                        {c.nombre}
                        <span className="num ml-2 text-xs text-muted-foreground">
                          {c.telefono ?? ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {!carrito.length && (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-muted-foreground">
                Escanea o agrega los equipos y accesorios a apartar.
              </p>
            )}

            {itemsEquipo.map((i) => {
              const valor = aNumero(i.precio);
              const bajo = i.sugerido !== null && valor > 0 && valor < i.sugerido;
              return (
                <div key={`eq-${i.id}`} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
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
                    aria-label="Precio del equipo"
                    onChange={(e) => actualizar(i, { precio: e.target.value.replace(/[^\d]/g, "") })}
                  />
                  {bajo && (
                    <p className="mt-1.5 text-xs text-amber-300">
                      Bajo el sugerido {formatCLP(i.sugerido!)} · diferencia{" "}
                      {formatCLP(i.sugerido! - valor)}
                    </p>
                  )}
                </div>
              );
            })}

            {itemsAcc.map((i) => (
              <div key={`ac-${i.id}`} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm">
                    {i.nombre}
                    {aNumero(i.precio) === 0 && (
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
                    onChange={(e) => actualizar(i, { precio: e.target.value.replace(/[^\d]/g, "") })}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-2 border-t border-white/8 pt-4 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-base">Total</span>
              <span className="num font-display text-2xl font-semibold">{formatCLP(total)}</span>
            </div>
            <div>
              <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                Abono
              </span>
              <input
                className={`${campo} num text-right`}
                value={abono}
                inputMode="numeric"
                placeholder="0"
                aria-label="Abono"
                onChange={(e) => setAbono(e.target.value.replace(/[^\d]/g, ""))}
              />
              {!!total && !!montoAbono && !abonoValido && (
                <p className="mt-1.5 text-xs text-amber-300">
                  El abono debe ser mayor que cero y menor que el total. Si cubre todo, registra una
                  venta.
                </p>
              )}
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Saldo pendiente</span>
              <span className="num text-foreground">{formatCLP(saldo)}</span>
            </div>
          </div>

          <Button
            disabled={!puedeReservar}
            onClick={() => setModalAbono(true)}
            className="accent-glow mt-5 h-12 w-full bg-[var(--accent-store)] text-base text-white hover:bg-[var(--accent-store)]/90 disabled:opacity-40"
          >
            Cobrar el abono
          </Button>
        </div>
      </div>

      {/* ZONA 2 — ACTIVAS */}
      <section className="mt-10">
        <h2 className="font-display text-lg">Reservas activas</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activas.map((r) => {
            const d = dias(r.fecha);
            const vieja = d > 7;
            return (
              <div
                key={r.id}
                className={`glass p-4 ${vieja ? "border-amber-400/40 ring-1 ring-amber-400/20" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-base">{r.clientes?.nombre ?? "Sin cliente"}</p>
                    <p className="num text-xs text-muted-foreground">
                      {r.clientes?.telefono ?? "—"} · {nombreTienda(r.tienda_id)}
                    </p>
                  </div>
                  <span
                    className={`num shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                      vieja
                        ? "border-amber-400/30 bg-amber-500/15 text-amber-200"
                        : "border-white/10 bg-white/[0.05] text-muted-foreground"
                    }`}
                  >
                    {d} {d === 1 ? "día" : "días"}
                  </span>
                </div>

                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {descItems(r).map((t, idx) => (
                    <li key={idx}>· {t}</li>
                  ))}
                </ul>

                <div className="mt-3 space-y-1 border-t border-white/8 pt-3 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Total</span>
                    <span className="num text-foreground">{formatCLP(r.total)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Abonado</span>
                    <span className="num text-emerald-300">{formatCLP(r.abono)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Saldo</span>
                    <span className="num font-display text-base">{formatCLP(r.saldo)}</span>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button
                    onClick={() => setCompletando(r.id)}
                    className="accent-glow h-10 flex-1 bg-[var(--accent-store)] text-white hover:bg-[var(--accent-store)]/90"
                  >
                    Completar venta
                  </Button>
                  {puedeCancelar && (
                    <Button
                      variant="ghost"
                      onClick={() => setCancelando(r.id)}
                      className="h-10 border border-white/10 text-muted-foreground hover:text-red-300"
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {!activas.length && (
            <p className="glass px-4 py-10 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
              No hay reservas activas.
            </p>
          )}
        </div>
      </section>

      {/* ZONA 3 — HISTORIAL */}
      <section className="mt-10">
        <h2 className="font-display text-lg">Historial</h2>
        <div className="solid-panel mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Tienda</th>
                  <th className="px-4 py-3 font-medium">Equipos</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">Abono</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Abono cancelado</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                  >
                    <td className="num px-4 py-2.5 text-muted-foreground">{fechaCorta(r.fecha)}</td>
                    <td className="px-4 py-2.5">{r.clientes?.nombre ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {nombreTienda(r.tienda_id)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {descItems(r).join(" · ") || "—"}
                    </td>
                    <td className="num px-4 py-2.5 text-right">{formatCLP(r.total)}</td>
                    <td className="num px-4 py-2.5 text-right">{formatCLP(r.abono)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${
                          r.estado === "completada"
                            ? "border-emerald-400/25 bg-emerald-500/15 text-emerald-300"
                            : "border-red-400/25 bg-red-500/15 text-red-300"
                        }`}
                      >
                        {r.estado === "completada" ? "Completada" : "Cancelada"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.destino_abono === "devuelto"
                        ? "Devuelto al cliente"
                        : r.destino_abono === "retenido"
                          ? "Retenido"
                          : "—"}
                    </td>
                  </tr>
                ))}
                {!historial.length && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      Todavía no hay reservas cerradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <NuevoClienteModal
        abierto={modalCliente}
        onCerrar={() => setModalCliente(false)}
        onCreado={(c) => setCliente(c)}
        nombreInicial={/^[\d+\s]+$/.test(clienteQ) ? "" : clienteQ}
        telefonoInicial={/^[\d+\s]+$/.test(clienteQ) ? clienteQ : ""}
      />

      <PagoFilasModal
        abierto={modalAbono}
        onCerrar={() => setModalAbono(false)}
        titulo="Abono a cobrar"
        etiquetaMonto="Abono de la reserva"
        total={montoAbono}
        textoBoton="Confirmar reserva"
        nota="El abono entra a caja, pero no cuenta como ingreso por venta hasta completar la reserva."
        onConfirmar={confirmarReserva}
      />

      <PagoFilasModal
        abierto={!!reservaEnCurso}
        onCerrar={() => setCompletando(null)}
        titulo="Saldo pendiente a cobrar"
        etiquetaMonto="Saldo de la reserva"
        total={reservaEnCurso?.saldo ?? 0}
        textoBoton="Completar venta"
        nota={
          reservaEnCurso
            ? `El abono de ${formatCLP(reservaEnCurso.abono)} ya está pagado y forma parte del total de ${formatCLP(reservaEnCurso.total)}.`
            : undefined
        }
        onConfirmar={completarReserva}
      />

      {cancelando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setCancelando(null)}
          />
          <div className="glass relative z-10 w-full max-w-md rounded-2xl p-6">
            <h3 className="font-display text-lg">Cancelar la reserva</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Los equipos vuelven a estar disponibles y la reserva queda registrada como cancelada.
            </p>
            <span className="mt-4 mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              ¿Qué pasa con el abono?
            </span>
            <div className="flex gap-2">
              {(
                [
                  { valor: "devuelto", label: "Se devuelve al cliente" },
                  { valor: "retenido", label: "Se retiene" },
                ] as const
              ).map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  onClick={() => setDestinoAbono(o.valor)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm transition-all duration-200 ${
                    destinoAbono === o.valor
                      ? "accent-glow border-[var(--accent-store)]/50 bg-[var(--accent-store-soft)]"
                      : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="mt-5 flex gap-2">
              <Button
                variant="ghost"
                onClick={() => setCancelando(null)}
                className="h-11 flex-1 border border-white/10"
              >
                Volver
              </Button>
              <Button
                onClick={cancelarReserva}
                className="h-11 flex-1 bg-red-500/90 text-white hover:bg-red-500"
              >
                Cancelar reserva
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
