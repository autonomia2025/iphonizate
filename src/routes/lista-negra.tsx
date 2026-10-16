import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, BadgeDollarSign, Plus, Search, ShieldOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { traerTodo } from "@/lib/traerTodo";
import { useAuth } from "@/components/AuthContext";
import { useStore } from "@/components/StoreContext";
import { PERMISOS, usePermisos, useVerGanancias } from "@/lib/permisos";
import { Button } from "@/components/ui/button";
import { Cascada, Cifra, EstadoVacio, SkeletonFilas, TarjetaViva } from "@/components/motion";
import { useInversion } from "@/components/inventario/useInversion";
import { IngresarListaNegraModal } from "@/components/listaNegra/IngresarListaNegraModal";
import {
  CerrarListaNegraModal,
  type ModoCierre,
} from "@/components/listaNegra/CerrarListaNegraModal";
import { formatCLP } from "@/lib/stores";
import { fechaLarga, puedeIngresarEquipos, puedeVerCostos, textoSim } from "@/lib/inventario";
import {
  ESTADOS_LISTA_NEGRA,
  ESTADO_LISTA_NEGRA_CLASE,
  ESTADO_LISTA_NEGRA_ETIQUETA,
  type EstadoListaNegra,
  type FilaListaNegra,
} from "@/lib/listaNegra";
import { cn } from "@/lib/utils";

const DESC =
  "Equipos con IMEI reportado: se ingresan como el inventario y se cierran vendidos o cambiados.";

export const Route = createFileRoute("/lista-negra")({
  head: () => ({
    meta: [
      { title: "Lista negra · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Lista negra · iPhonizate OS" },
      { property: "og:description", content: DESC },
    ],
  }),
  component: ListaNegraPage,
});

function Metrica({
  label,
  valor,
  formato,
  sub,
}: {
  label: string;
  valor: number;
  formato: (n: number) => string;
  sub?: string;
}) {
  return (
    <TarjetaViva className="p-5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <Cifra
        valor={valor}
        formato={formato}
        degradada
        className="mt-3 block text-[1.8rem] font-semibold leading-none"
      />
      {sub && <p className="mt-3 text-[11px] text-muted-foreground">{sub}</p>}
    </TarjetaViva>
  );
}

const contar = (n: number) => String(n);

function ListaNegraPage() {
  const { usuario } = useAuth();
  const { store } = useStore();
  const rol = usuario?.rol ?? null;
  const permisos = usePermisos();
  const conCostos = puedeVerCostos(rol) || permisos.tiene(PERMISOS.equiposCosto);
  const verGanancias = useVerGanancias(rol);
  const puedeOperar = puedeIngresarEquipos(rol);
  const queryClient = useQueryClient();

  const [estado, setEstado] = useState<EstadoListaNegra | null>("en_stock");
  const [busqueda, setBusqueda] = useState("");
  const [ingresarAbierto, setIngresarAbierto] = useState(false);
  const [cierre, setCierre] = useState<{ fila: FilaListaNegra; modo: ModoCierre } | null>(null);

  const tiendas = useQuery({
    queryKey: ["tiendas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tiendas")
        .select("id, nombre, es_bodega")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const tiendasSlug = useQuery({
    queryKey: ["tiendas-slug"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tiendas").select("id, nombre, slug");
      if (error) throw error;
      return data ?? [];
    },
  });
  const tiendaActiva = (tiendasSlug.data ?? []).find((t) => t.slug === store.id)?.id ?? null;

  const lista = useQuery({
    queryKey: ["v_lista_negra"],
    queryFn: async () => {
      const filas = await traerTodo((desde, hasta) =>
        supabase
          .from("v_lista_negra")
          .select(
            "id, imei, modelo, gb, color, bateria, sim, ubicacion_id, tienda, proveedor, lote, notas, estado, fecha_ingreso, ingresado_por, cerrado_at, cerrado_por, valor_venta, equipo_cambio_id, imei_cambio, modelo_cambio, costo",
          )
          .order("fecha_ingreso", { ascending: false })
          .order("id")
          .range(desde, hasta),
      );
      return filas as FilaListaNegra[];
    },
  });

  /* La inversión solo la ven quienes tienen el permiso (hoy Renato y Valentina) */
  const verInversion = conCostos && permisos.tiene(PERMISOS.inversionVer);
  const inversion = useInversion(verInversion);

  const recargar = () => {
    void lista.refetch();
    void queryClient.invalidateQueries({ queryKey: ["inversion_stock"] });
  };

  const conteos = useMemo(() => {
    const mapa = new Map<EstadoListaNegra, number>();
    (lista.data ?? []).forEach((f) => mapa.set(f.estado, (mapa.get(f.estado) ?? 0) + 1));
    return mapa;
  }, [lista.data]);

  const vendidos = useMemo(
    () => (lista.data ?? []).filter((f) => f.estado === "vendido"),
    [lista.data],
  );
  const recuperado = vendidos.reduce((s, f) => s + Number(f.valor_venta ?? 0), 0);
  const gananciaVendidos = vendidos.reduce(
    (s, f) => s + (f.costo != null ? Number(f.valor_venta ?? 0) - f.costo : 0),
    0,
  );

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (lista.data ?? []).filter((f) => {
      if (estado && f.estado !== estado) return false;
      if (!q) return true;
      return (
        f.imei.includes(q) ||
        (f.imei_cambio ?? "").includes(q) ||
        f.modelo.toLowerCase().includes(q) ||
        (f.color ?? "").toLowerCase().includes(q) ||
        (f.proveedor ?? "").toLowerCase().includes(q)
      );
    });
  }, [lista.data, estado, busqueda]);

  const columnas = conCostos ? 9 : 8;

  return (
    <div className="mx-auto max-w-[86rem]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Lista negra</h1>
          <p className="mt-1 text-sm text-muted-foreground">{DESC}</p>
        </div>
        {puedeOperar && (
          <Button onClick={() => setIngresarAbierto(true)} className="accent-glow gap-2">
            <Plus className="size-4" /> Ingresar a lista negra
          </Button>
        )}
      </div>

      <Cascada className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metrica
          label="En lista negra"
          valor={conteos.get("en_stock") ?? 0}
          formato={contar}
          sub="equipos sin vender ni cambiar"
        />
        {verInversion && inversion.data && (
          <>
            <Metrica
              label="Inversión lista negra"
              valor={inversion.data.listaNegra}
              formato={formatCLP}
              sub={`${inversion.data.listaNegraEquipos} equipos en stock`}
            />
            <Metrica
              label="Inversión total en stock"
              valor={inversion.data.total}
              formato={formatCLP}
              sub={`Inventario ${formatCLP(inversion.data.inventario)} + lista negra ${formatCLP(inversion.data.listaNegra)}`}
            />
          </>
        )}
        <Metrica
          label="Recuperado en ventas"
          valor={recuperado}
          formato={formatCLP}
          sub={
            verGanancias && conCostos && vendidos.length > 0
              ? `${vendidos.length} vendidos · ${gananciaVendidos < 0 ? "pérdida" : "ganancia"} ${formatCLP(Math.abs(gananciaVendidos))}`
              : `${vendidos.length} vendidos · ${conteos.get("cambiado") ?? 0} cambiados`
          }
        />
      </Cascada>

      <div className="glass mt-6 p-4">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Busca por IMEI, modelo, color o proveedor"
            className="num h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm outline-none transition-all duration-200 placeholder:font-sans placeholder:text-muted-foreground focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs uppercase tracking-wide text-muted-foreground">Estado</span>
          {ESTADOS_LISTA_NEGRA.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setEstado(s)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-all duration-200",
                estado === s
                  ? "accent-glow border-[var(--accent-store)]/50 bg-[var(--accent-store-soft)] text-foreground"
                  : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground",
              )}
            >
              {ESTADO_LISTA_NEGRA_ETIQUETA[s]} {conteos.get(s) ?? 0}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setEstado(null)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-all duration-200",
              !estado
                ? "accent-glow border-[var(--accent-store)]/50 bg-[var(--accent-store-soft)] text-foreground"
                : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground",
            )}
          >
            Todos {lista.data?.length ?? 0}
          </button>
        </div>
      </div>

      <div className="solid-panel mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Ingreso</th>
                <th className="px-4 py-3 font-medium">Equipo</th>
                <th className="px-4 py-3 text-right font-medium">Batería</th>
                <th className="px-4 py-3 font-medium">SIM</th>
                <th className="px-4 py-3 font-medium">Ubicación</th>
                <th className="px-4 py-3 font-medium">Proveedor</th>
                {conCostos && <th className="px-4 py-3 text-right font-medium">Costo</th>}
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {lista.isLoading && (
                <tr>
                  <td colSpan={columnas}>
                    <SkeletonFilas filas={5} columnas={columnas} />
                  </td>
                </tr>
              )}
              {!lista.isLoading && filas.length === 0 && (
                <tr>
                  <td colSpan={columnas}>
                    <EstadoVacio
                      icono={ShieldOff}
                      titulo={
                        lista.isError
                          ? "No se pudo cargar la lista negra"
                          : "No hay equipos que mostrar"
                      }
                      mensaje={
                        lista.isError
                          ? "Si es la primera vez, falta aplicar la migración de lista negra en la base."
                          : estado === "en_stock"
                            ? "Los equipos con IMEI reportado que ingreses aparecerán aquí."
                            : "Prueba con otro estado o búsqueda."
                      }
                    />
                  </td>
                </tr>
              )}
              {filas.map((f) => (
                <tr
                  key={f.id}
                  className="border-b border-white/5 align-top transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                >
                  <td className="num px-4 py-2.5 text-muted-foreground">
                    {fechaLarga(f.fecha_ingreso)}
                    {f.ingresado_por && (
                      <span className="block text-[11px]">{f.ingresado_por}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {f.modelo}
                    {f.gb ? <span className="num text-muted-foreground"> · {f.gb} GB</span> : null}
                    {f.color ? <span className="text-muted-foreground"> · {f.color}</span> : null}
                    <span className="num block text-[11px] tracking-[0.04em] text-muted-foreground">
                      {f.imei}
                    </span>
                    {f.notas && (
                      <span className="block max-w-xs truncate text-[11px] text-muted-foreground">
                        {f.notas}
                      </span>
                    )}
                  </td>
                  <td className="num px-4 py-2.5 text-right">
                    {f.bateria != null ? `${f.bateria}%` : "—"}
                  </td>
                  <td className="px-4 py-2.5">{textoSim(f.sim) ?? "—"}</td>
                  <td className="px-4 py-2.5">{f.tienda ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{f.proveedor ?? "—"}</td>
                  {conCostos && (
                    <td className="num px-4 py-2.5 text-right">
                      {f.costo != null ? formatCLP(f.costo) : "—"}
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${ESTADO_LISTA_NEGRA_CLASE[f.estado]}`}
                    >
                      {ESTADO_LISTA_NEGRA_ETIQUETA[f.estado]}
                    </span>
                    {f.estado === "vendido" && (
                      <span className="num mt-1 block text-[11px] text-muted-foreground">
                        en {formatCLP(Number(f.valor_venta ?? 0))}
                        {verGanancias && f.costo != null && (
                          <span
                            className={
                              Number(f.valor_venta ?? 0) - f.costo < 0
                                ? "text-red-300"
                                : "text-emerald-300"
                            }
                          >
                            {" "}
                            · {formatCLP(Number(f.valor_venta ?? 0) - f.costo)}
                          </span>
                        )}
                      </span>
                    )}
                    {f.estado === "cambiado" && (
                      <span className="num mt-1 block text-[11px] text-muted-foreground">
                        por {f.modelo_cambio ?? "equipo"} · {f.imei_cambio ?? "—"}
                      </span>
                    )}
                    {f.cerrado_at && (
                      <span className="num block text-[11px] text-muted-foreground">
                        {fechaLarga(f.cerrado_at)}
                        {f.cerrado_por ? ` · ${f.cerrado_por}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {f.estado === "en_stock" && puedeOperar ? (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => setCierre({ fila: f, modo: "vendido" })}
                        >
                          <BadgeDollarSign className="size-3.5" /> Vendido
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => setCierre({ fila: f, modo: "cambiado" })}
                        >
                          <ArrowLeftRight className="size-3.5" /> Cambiado
                        </Button>
                      </div>
                    ) : (
                      <span className="block text-right text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <IngresarListaNegraModal
        abierto={ingresarAbierto}
        onCerrar={() => setIngresarAbierto(false)}
        tiendas={tiendas.data ?? []}
        tiendaPorDefecto={tiendaActiva}
        puedeCostos={conCostos}
        onGuardado={recargar}
      />
      {cierre && (
        <CerrarListaNegraModal
          fila={cierre.fila}
          modo={cierre.modo}
          tiendas={tiendas.data ?? []}
          puedeCostos={conCostos}
          verGanancias={verGanancias}
          onCerrar={() => setCierre(null)}
          onHecho={recargar}
        />
      )}
    </div>
  );
}
