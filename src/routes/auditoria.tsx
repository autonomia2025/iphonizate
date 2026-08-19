import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { ROL_ETIQUETA, type AppRol } from "@/lib/nav";
import { fechaHoraCorta } from "@/lib/caja";
import {
  POR_PAGINA,
  diffDetalle,
  etiquetaCampo,
  puedeVerAuditoria,
  resumenDetalle,
  traducirAccion,
  valorLegible,
  type Detalle,
} from "@/lib/auditoria";

const DESC = "Registro de cambios de precio, stock y accesos.";

export const Route = createFileRoute("/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoría · riff store OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Auditoría · riff store OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditoriaPage,
});

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

const thBase =
  "px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground";

type FilaAuditoria = {
  id: string;
  accion: string;
  detalle: Detalle;
  usuario_id: string | null;
  rol: string | null;
  tienda_id: string | null;
  fecha: string;
};

function AuditoriaPage() {
  const { usuario } = useAuth();
  const autorizado = puedeVerAuditoria(usuario?.rol ?? null);

  const [usuarioFiltro, setUsuarioFiltro] = useState("todos");
  const [accionFiltro, setAccionFiltro] = useState("todas");
  const [tiendaFiltro, setTiendaFiltro] = useState("todas");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [texto, setTexto] = useState("");
  const [pagina, setPagina] = useState(0);
  const [abierta, setAbierta] = useState<FilaAuditoria | null>(null);

  const tiendas = useQuery({
    queryKey: ["tiendas-auditoria"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase.from("tiendas").select("id, nombre").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const usuarios = useQuery({
    queryKey: ["usuarios-auditoria"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase.from("usuarios").select("id, nombre").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const acciones = useQuery({
    queryKey: ["acciones-auditoria"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase.from("auditoria").select("accion").limit(2000);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((f) => f.accion))).sort();
    },
  });

  const busqueda = texto.trim().toLowerCase();
  const filtros = [usuarioFiltro, accionFiltro, tiendaFiltro, desde, hasta, busqueda, pagina] as const;

  const registros = useQuery({
    queryKey: ["auditoria", ...filtros],
    enabled: autorizado,
    queryFn: async () => {
      const armar = () => {
        let q = supabase
          .from("auditoria")
          .select("id, accion, detalle, usuario_id, rol, tienda_id, fecha", { count: "exact" })
          .order("fecha", { ascending: false });
        if (usuarioFiltro !== "todos") q = q.eq("usuario_id", usuarioFiltro);
        if (accionFiltro !== "todas") q = q.eq("accion", accionFiltro);
        if (tiendaFiltro === "general") q = q.is("tienda_id", null);
        else if (tiendaFiltro !== "todas") q = q.eq("tienda_id", tiendaFiltro);
        if (desde) q = q.gte("fecha", new Date(`${desde}T00:00:00`).toISOString());
        if (hasta) q = q.lte("fecha", new Date(`${hasta}T23:59:59.999`).toISOString());
        return q;
      };

      // El detalle es jsonb: el buscador de texto libre se aplica sobre una
      // ventana de registros recientes y luego se pagina en el cliente.
      if (busqueda) {
        const { data, error } = await armar().range(0, 1999);
        if (error) throw error;
        const todas = ((data ?? []) as unknown as FilaAuditoria[]).filter((f) =>
          JSON.stringify(f.detalle ?? {})
            .toLowerCase()
            .includes(busqueda),
        );
        const inicio = pagina * POR_PAGINA;
        return { filas: todas.slice(inicio, inicio + POR_PAGINA), total: todas.length };
      }

      const inicio = pagina * POR_PAGINA;
      const { data, error, count } = await armar().range(inicio, inicio + POR_PAGINA - 1);
      if (error) throw error;
      return { filas: (data ?? []) as unknown as FilaAuditoria[], total: count ?? 0 };
    },
  });


  const total = registros.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const nombreUsuario = (id?: string | null) =>
    id ? ((usuarios.data ?? []).find((u) => u.id === id)?.nombre ?? "—") : "Sistema";
  const nombreTienda = (id?: string | null) =>
    id ? ((tiendas.data ?? []).find((t) => t.id === id)?.nombre ?? "—") : "General";

  const diff = useMemo(() => (abierta ? diffDetalle(abierta.detalle) : []), [abierta]);

  const reiniciar = <T,>(setter: (v: T) => void) => (valor: T) => {
    setPagina(0);
    setter(valor);
  };

  if (!autorizado) {
    return (
      <div className="glass mx-auto max-w-lg p-8 text-center">
        <h1 className="font-display text-xl">Auditoría</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta pantalla es solo para dirección y administración.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[92rem] pb-10">
      <div>
        <h1 className="font-display text-2xl font-semibold">Auditoría</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {DESC} Los campos sensibles vienen filtrados desde la base de datos.
        </p>
      </div>

      {/* filtros */}
      <div className="glass mt-6 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48">
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Usuario
          </span>
          <select
            className={campo}
            aria-label="Filtrar por usuario"
            value={usuarioFiltro}
            onChange={(e) => reiniciar(setUsuarioFiltro)(e.target.value)}
          >
            <option value="todos" className="bg-[#16131F]">
              Todos
            </option>
            {(usuarios.data ?? []).map((u) => (
              <option key={u.id} value={u.id} className="bg-[#16131F]">
                {u.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-56">
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Tipo de acción
          </span>
          <select
            className={campo}
            aria-label="Filtrar por tipo de acción"
            value={accionFiltro}
            onChange={(e) => reiniciar(setAccionFiltro)(e.target.value)}
          >
            <option value="todas" className="bg-[#16131F]">
              Todas
            </option>
            {(acciones.data ?? []).map((a) => (
              <option key={a} value={a} className="bg-[#16131F]">
                {traducirAccion(a)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-44">
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Tienda
          </span>
          <select
            className={campo}
            aria-label="Filtrar por tienda"
            value={tiendaFiltro}
            onChange={(e) => reiniciar(setTiendaFiltro)(e.target.value)}
          >
            <option value="todas" className="bg-[#16131F]">
              Todas
            </option>
            <option value="general" className="bg-[#16131F]">
              Sin tienda
            </option>
            {(tiendas.data ?? []).map((t) => (
              <option key={t.id} value={t.id} className="bg-[#16131F]">
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Desde
          </span>
          <input
            type="date"
            aria-label="Desde"
            className={`${campo} num`}
            value={desde}
            onChange={(e) => reiniciar(setDesde)(e.target.value)}
          />
        </div>
        <div>
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Hasta
          </span>
          <input
            type="date"
            aria-label="Hasta"
            className={`${campo} num`}
            value={hasta}
            onChange={(e) => reiniciar(setHasta)(e.target.value)}
          />
        </div>
        <div className="min-w-56 flex-1">
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Buscar en el detalle
          </span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={`${campo} pl-9`}
              placeholder="IMEI, modelo, nombre…"
              aria-label="Buscar en el detalle"
              value={texto}
              onChange={(e) => reiniciar(setTexto)(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* tabla */}
      <div className="solid-panel mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                <th className={thBase}>Fecha y hora</th>
                <th className={thBase}>Usuario</th>
                <th className={thBase}>Rol</th>
                <th className={thBase}>Tienda</th>
                <th className={thBase}>Acción</th>
                <th className={thBase}>Resumen del cambio</th>
              </tr>
            </thead>
            <tbody>
              {(registros.data?.filas ?? []).map((f) => (
                <tr
                  key={f.id}
                  onClick={() => setAbierta(f)}
                  className={`cursor-pointer border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035] ${
                    abierta?.id === f.id ? "bg-white/[0.05]" : ""
                  }`}
                >
                  <td className="num whitespace-nowrap px-4 py-2.5">{fechaHoraCorta(f.fecha)}</td>
                  <td className="px-4 py-2.5">{nombreUsuario(f.usuario_id)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {f.rol ? (ROL_ETIQUETA[f.rol as AppRol] ?? f.rol) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{nombreTienda(f.tienda_id)}</td>
                  <td className="px-4 py-2.5">{traducirAccion(f.accion)}</td>
                  <td className="max-w-[28rem] truncate px-4 py-2.5 text-muted-foreground">
                    {resumenDetalle(f.accion, f.detalle)}
                  </td>
                </tr>
              ))}
              {(registros.data?.filas ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    {registros.isLoading ? "Cargando registros…" : "Sin registros para estos filtros"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* paginación */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {total === 0
            ? "Sin registros"
            : `Mostrando ${pagina * POR_PAGINA + 1}–${Math.min((pagina + 1) * POR_PAGINA, total)} de ${total}`}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            disabled={pagina === 0}
            aria-label="Página anterior"
            className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] transition-colors duration-200 hover:bg-white/[0.07] disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="num text-sm text-muted-foreground">
            {pagina + 1} / {paginas}
          </span>
          <button
            onClick={() => setPagina((p) => (p + 1 < paginas ? p + 1 : p))}
            disabled={pagina + 1 >= paginas}
            aria-label="Página siguiente"
            className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] transition-colors duration-200 hover:bg-white/[0.07] disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* panel lateral */}
      {abierta && (
        <>
          <button
            aria-label="Cerrar detalle"
            onClick={() => setAbierta(null)}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          />
          <aside className="glass fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col rounded-none border-y-0 border-r-0 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold">
                  {traducirAccion(abierta.accion)}
                </h2>
                <p className="num mt-1 text-xs text-muted-foreground">
                  {fechaHoraCorta(abierta.fecha)} · {nombreUsuario(abierta.usuario_id)} ·{" "}
                  {abierta.rol ? (ROL_ETIQUETA[abierta.rol as AppRol] ?? abierta.rol) : "—"} ·{" "}
                  {nombreTienda(abierta.tienda_id)}
                </p>
              </div>
              <button
                onClick={() => setAbierta(null)}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.07] hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-5 flex-1 overflow-y-auto">
              <div className="solid-panel overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8">
                      <th className={thBase}>Campo</th>
                      <th className={thBase}>Antes</th>
                      <th className={thBase}>Después</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.map((c) => (
                      <tr
                        key={c.campo}
                        className={`border-b border-white/5 last:border-0 ${
                          c.cambio ? "bg-[var(--accent-store-soft)]" : ""
                        }`}
                      >
                        <td className="px-4 py-2.5 align-top">
                          <span className={c.cambio ? "font-medium" : "text-muted-foreground"}>
                            {etiquetaCampo(c.campo)}
                          </span>
                        </td>
                        <td className="num max-w-[10rem] break-words px-4 py-2.5 align-top text-muted-foreground">
                          {abierta.detalle?.antes ? valorLegible(c.antes) : "—"}
                        </td>
                        <td
                          className={`num max-w-[10rem] break-words px-4 py-2.5 align-top ${
                            c.cambio ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {abierta.detalle?.despues ? valorLegible(c.despues) : "—"}
                        </td>
                      </tr>
                    ))}
                    {diff.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                          Sin detalle registrado
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Los campos resaltados son los que cambiaron. Costos, ganancias y PIN no se
                almacenan en la auditoría.
              </p>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
