import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Download } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { armarCsv, descargarCsv } from "@/lib/importar";
import { formatCLP } from "@/lib/stores";
import { traerTodo } from "@/lib/traerTodo";
import { ESTADO_ETIQUETA, type EquipoEstado } from "@/lib/inventario";

type Borrado = {
  id: string;
  accion: string;
  fecha: string;
  usuario_id: string | null;
  detalle: {
    imei?: string;
    modelo?: string;
    estado?: string;
    total?: number;
    comprobante?: string;
    motivo?: string;
    equipos?: { imei?: string; modelo?: string }[];
    antes?: unknown;
  } | null;
};

type Volvio = {
  equipo_id: string;
  imei: string;
  modelo: string;
  estado: string;
  ubicacion: string | null;
  venta_fecha: string;
  comprobante: string | null;
  vendida_en: string | null;
  ultimo_evento: string | null;
  ultimo_evento_fecha: string | null;
  ultimo_evento_por: string | null;
};

type Pestana = "equipos" | "ventas" | "volvieron";

const fecha = (f?: string | null) =>
  f
    ? new Date(f).toLocaleString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const estadoTexto = (e?: string | null) => (e ? (ESTADO_ETIQUETA[e as EquipoEstado] ?? e) : "—");

/**
 * Informe para revisar a mano lo que se borró y los equipos vendidos que volvieron a stock.
 * Se lee en vivo desde la base, así que siempre está al día.
 */
export function RevisionBorrados({
  nombreUsuario,
}: {
  nombreUsuario: (id?: string | null) => string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("equipos");

  const borrados = useQuery({
    queryKey: ["revision-borrados"],
    queryFn: async () =>
      (await traerTodo((d, h) =>
        supabase
          .from("auditoria")
          .select("id, accion, fecha, usuario_id, detalle")
          .in("accion", ["equipo_eliminado", "venta_eliminada"])
          .order("fecha", { ascending: false })
          .order("id")
          .range(d, h),
      )) as unknown as Borrado[],
  });

  const equipos = useMemo(
    /* Las filas con "antes" son la copia completa que agregó la protección: el registro
       legible de esa misma eliminación es la otra fila */
    () => (borrados.data ?? []).filter((b) => b.accion === "equipo_eliminado" && !b.detalle?.antes),
    [borrados.data],
  );
  const ventas = useMemo(
    () => (borrados.data ?? []).filter((b) => b.accion === "venta_eliminada"),
    [borrados.data],
  );

  /* ¿Los IMEI borrados se volvieron a ingresar después? */
  const imeisBorrados = useMemo(
    () => [...new Set(equipos.map((b) => b.detalle?.imei).filter((i): i is string => !!i))],
    [equipos],
  );
  const reingresados = useQuery({
    queryKey: ["revision-reingresados", imeisBorrados],
    enabled: imeisBorrados.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_stock")
        .select("imei, estado, tienda")
        .in("imei", imeisBorrados);
      if (error) throw error;
      return new Map((data ?? []).map((e) => [e.imei ?? "", e]));
    },
  });

  const volvieron = useQuery({
    queryKey: ["revision-volvieron"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("equipos_con_venta_activa");
      if (error) throw error;
      return (data ?? []) as Volvio[];
    },
  });

  const descargar = () => {
    const hoy = new Date().toISOString().slice(0, 10);
    if (pestana === "equipos") {
      descargarCsv(
        `equipos-eliminados-${hoy}.csv`,
        armarCsv(
          ["eliminado", "por", "imei", "modelo", "estado al borrar", "hoy en el sistema"],
          equipos.map((b) => {
            const hoyEn = b.detalle?.imei ? reingresados.data?.get(b.detalle.imei) : undefined;
            return [
              fecha(b.fecha),
              nombreUsuario(b.usuario_id),
              b.detalle?.imei ?? "",
              b.detalle?.modelo ?? "",
              estadoTexto(b.detalle?.estado),
              hoyEn
                ? `Reingresado: ${estadoTexto(hoyEn.estado)} en ${hoyEn.tienda ?? "—"}`
                : "No está",
            ];
          }),
        ),
      );
    } else if (pestana === "ventas") {
      descargarCsv(
        `ventas-eliminadas-${hoy}.csv`,
        armarCsv(
          ["eliminada", "por", "comprobante", "total", "motivo", "equipos"],
          ventas.map((b) => [
            fecha(b.fecha),
            nombreUsuario(b.usuario_id),
            b.detalle?.comprobante ?? "",
            b.detalle?.total ?? "",
            b.detalle?.motivo ?? "Sin motivo",
            (b.detalle?.equipos ?? [])
              .map((e) => `${e.modelo ?? ""} ${e.imei ?? ""}`.trim())
              .join(" / "),
          ]),
        ),
      );
    } else {
      descargarCsv(
        `equipos-vendidos-que-volvieron-${hoy}.csv`,
        armarCsv(
          [
            "imei",
            "modelo",
            "estado hoy",
            "ubicación hoy",
            "vendido el",
            "comprobante",
            "vendido en",
            "último cambio",
            "por",
            "cuándo",
          ],
          (volvieron.data ?? []).map((v) => [
            v.imei,
            v.modelo,
            estadoTexto(v.estado),
            v.ubicacion ?? "",
            fecha(v.venta_fecha),
            v.comprobante ?? "",
            v.vendida_en ?? "",
            v.ultimo_evento ?? "",
            v.ultimo_evento_por ?? "",
            fecha(v.ultimo_evento_fecha),
          ]),
        ),
      );
    }
  };

  const pestanas: { id: Pestana; label: string; total: number }[] = [
    { id: "equipos", label: "Equipos eliminados", total: equipos.length },
    { id: "ventas", label: "Ventas eliminadas", total: ventas.length },
    {
      id: "volvieron",
      label: "Vendidos que volvieron a stock",
      total: volvieron.data?.length ?? 0,
    },
  ];

  const th = "px-3 py-2 font-medium";
  const td = "px-3 py-2";

  return (
    <section className="glass mt-6 p-4">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={abierto}
      >
        <span>
          <span className="font-display text-base font-semibold">Revisión de borrados</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {equipos.length} equipos y {ventas.length} ventas eliminados ·{" "}
            {volvieron.data?.length ?? 0} equipos vendidos que hoy figuran en stock
          </span>
        </span>
        <ChevronDown
          className={`size-4 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}
        />
      </button>

      {abierto && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {pestanas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPestana(p.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors duration-200 ${
                    pestana === p.id
                      ? "border-[var(--accent-store)]/60 bg-[var(--accent-store-soft)] text-foreground"
                      : "border-white/10 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label} <span className="num opacity-70">{p.total}</span>
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="gap-2" onClick={descargar}>
              <Download className="size-4" /> Descargar CSV
            </Button>
          </div>

          {pestana === "volvieron" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Equipos con una venta vigente que hoy no figuran como vendidos. Puede ser correcto
              (garantía o devolución) o un error (se reingresó el IMEI de un equipo vendido). Revisa
              cada uno.
            </p>
          )}

          <div className="solid-panel mt-3 max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#16131F]">
                {pestana === "equipos" && (
                  <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className={th}>Eliminado</th>
                    <th className={th}>Por</th>
                    <th className={th}>Equipo</th>
                    <th className={th}>Estado al borrar</th>
                    <th className={th}>Hoy en el sistema</th>
                  </tr>
                )}
                {pestana === "ventas" && (
                  <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className={th}>Eliminada</th>
                    <th className={th}>Por</th>
                    <th className={th}>Comprobante</th>
                    <th className={`${th} text-right`}>Total</th>
                    <th className={th}>Motivo</th>
                    <th className={th}>Equipos</th>
                  </tr>
                )}
                {pestana === "volvieron" && (
                  <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className={th}>Equipo</th>
                    <th className={th}>Hoy</th>
                    <th className={th}>Venta</th>
                    <th className={th}>Último cambio</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {pestana === "equipos" &&
                  equipos.map((b) => {
                    const hoyEn = b.detalle?.imei
                      ? reingresados.data?.get(b.detalle.imei)
                      : undefined;
                    return (
                      <tr key={b.id} className="border-b border-white/5 last:border-0">
                        <td className={`num ${td} text-muted-foreground`}>{fecha(b.fecha)}</td>
                        <td className={td}>{nombreUsuario(b.usuario_id)}</td>
                        <td className={td}>
                          {b.detalle?.modelo ?? "—"}
                          <span className="num block text-xs text-muted-foreground">
                            {b.detalle?.imei}
                          </span>
                        </td>
                        <td className={`${td} text-muted-foreground`}>
                          {estadoTexto(b.detalle?.estado)}
                        </td>
                        <td className={td}>
                          {hoyEn ? (
                            <span className="text-amber-300">
                              Reingresado: {estadoTexto(hoyEn.estado)} en {hoyEn.tienda ?? "—"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">No está</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                {pestana === "ventas" &&
                  ventas.map((b) => (
                    <tr key={b.id} className="border-b border-white/5 align-top last:border-0">
                      <td className={`num ${td} text-muted-foreground`}>{fecha(b.fecha)}</td>
                      <td className={td}>{nombreUsuario(b.usuario_id)}</td>
                      <td className={`num ${td}`}>{b.detalle?.comprobante ?? "—"}</td>
                      <td className={`num ${td} text-right`}>
                        {b.detalle?.total != null ? formatCLP(Number(b.detalle.total)) : "—"}
                      </td>
                      <td className={td}>
                        {b.detalle?.motivo ?? (
                          <span className="text-muted-foreground">Sin motivo</span>
                        )}
                      </td>
                      <td className={`${td} text-xs text-muted-foreground`}>
                        {(b.detalle?.equipos ?? []).length
                          ? (b.detalle?.equipos ?? []).map((e, i) => (
                              <span key={`${e.imei ?? ""}-${i}`} className="block">
                                {e.modelo} <span className="num">{e.imei}</span>
                              </span>
                            ))
                          : "No se registró (eliminada antes del cambio)"}
                      </td>
                    </tr>
                  ))}
                {pestana === "volvieron" &&
                  (volvieron.data ?? []).map((v) => (
                    <tr
                      key={v.equipo_id}
                      className="border-b border-white/5 align-top last:border-0"
                    >
                      <td className={td}>
                        {v.modelo}
                        <span className="num block text-xs text-muted-foreground">{v.imei}</span>
                      </td>
                      <td className={td}>
                        {estadoTexto(v.estado)}
                        <span className="block text-xs text-muted-foreground">
                          {v.ubicacion ?? "—"}
                        </span>
                      </td>
                      <td className={td}>
                        <span className="num">{v.comprobante ?? "—"}</span>
                        <span className="block text-xs text-muted-foreground">
                          {fecha(v.venta_fecha)} · {v.vendida_en ?? "—"}
                        </span>
                      </td>
                      <td className={`${td} text-xs`}>
                        {v.ultimo_evento ?? "—"}
                        <span className="block text-muted-foreground">
                          {v.ultimo_evento_por ?? "?"} · {fecha(v.ultimo_evento_fecha)}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {borrados.isLoading && <p className="p-4 text-sm text-muted-foreground">Cargando…</p>}
            {borrados.isError && (
              <p className="p-4 text-sm text-red-300">
                No se pudo cargar la auditoría de borrados.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
