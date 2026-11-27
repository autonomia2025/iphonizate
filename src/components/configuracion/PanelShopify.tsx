import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  estadoShopify,
  guardarLinkShopify,
  leerShopify,
  redShopify,
} from "@/lib/shopify.functions";
import {
  TIENDAS_SHOPIFY,
  linkInstalacionValido,
  venceLink,
  type ConexionShopify,
  type TiendaShopify,
} from "@/lib/shopify";

const campo =
  "h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-[var(--accent-store)]/60";
const boton =
  "rounded-full border border-white/10 px-3 py-1 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground disabled:opacity-50";

const fecha = (v?: string | null) =>
  v ? new Date(v).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : "—";
const clp = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString("es-CL")}`);

const ESTADO: Record<ConexionShopify["estado"], { texto: string; clase: string }> = {
  pendiente: { texto: "Sin conectar", clase: "bg-white/10 text-muted-foreground" },
  conectada: { texto: "Conectada", clase: "bg-emerald-500/15 text-emerald-300" },
  desconectada: { texto: "Hay que reconectar", clase: "bg-amber-500/15 text-amber-300" },
};

/** Conexión de las tiendas Shopify: link de instalación, estado y lectura de productos y stock. */
export function PanelShopify() {
  const estado = useServerFn(estadoShopify);
  const guardar = useServerFn(guardarLinkShopify);
  const leer = useServerFn(leerShopify);
  const red = useServerFn(redShopify);

  const [editando, setEditando] = useState<{ tienda: TiendaShopify; link: string } | null>(null);
  const [leyendo, setLeyendo] = useState<TiendaShopify | null>(null);
  const [viendo, setViendo] = useState<TiendaShopify | null>(null);

  const conexiones = useQuery({
    queryKey: ["shopify-conexiones"],
    queryFn: async () => {
      const r = await estado();
      if (!r.ok) throw new Error(r.mensaje);
      return r.conexiones;
    },
  });

  const infoRed = useQuery({
    queryKey: ["shopify-red"],
    staleTime: Infinity,
    queryFn: async () => {
      const r = await red();
      if (!r.ok) throw new Error(r.mensaje);
      return r;
    },
  });

  /* Al volver de Shopify llega ?shopify=<tienda>&resultado=conectada|error */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const tienda = p.get("shopify");
    const resultado = p.get("resultado");
    if (!tienda || !resultado) return;
    const nombre = TIENDAS_SHOPIFY.find((t) => t.id === tienda)?.nombre ?? tienda;
    if (resultado === "conectada") toast.success(`${nombre} quedó conectada con Shopify`);
    else toast.error(`No se pudo conectar ${nombre}`, { description: "Inténtalo otra vez." });
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const guardarLink = async () => {
    if (!editando) return;
    if (editando.link.trim() && !linkInstalacionValido(editando.link)) {
      toast.error("Ese link no es de Shopify", { description: "Copia el link completo." });
      return;
    }
    const r = await guardar({ data: editando });
    if (!r.ok) return void toast.error(r.mensaje);
    toast.success("Link guardado");
    setEditando(null);
    void conexiones.refetch();
  };

  const leerAhora = async (tienda: TiendaShopify) => {
    setLeyendo(tienda);
    const r = await leer({ data: { tienda } });
    setLeyendo(null);
    if (!r.ok) toast.error("No se pudo leer Shopify", { description: r.mensaje });
    else
      toast.success(
        `Leídos ${r.variantes} productos y variantes (${r.stock.toLocaleString("es-CL")} unidades)`,
      );
    void conexiones.refetch();
  };

  return (
    <section className="glass p-5">
      <div className="flex items-start gap-3">
        <ShoppingBag className="mt-1 h-5 w-5 text-muted-foreground" />
        <div>
          <h2 className="font-display text-lg">Shopify</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Conecta cada tienda Shopify para que el sistema lea sus productos y su stock. Pega el
            link de instalación una vez y después usa{" "}
            <span className="text-foreground">Conectar Shopify</span>: se abre Shopify, se entra con
            la cuenta de la tienda y se aprieta Instalar.
          </p>
        </div>
      </div>

      {conexiones.isLoading && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </p>
      )}
      {conexiones.error && (
        <p className="mt-4 text-sm text-destructive">{conexiones.error.message}</p>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {(conexiones.data ?? []).map((c) => (
          <div key={c.tienda} className="solid-panel space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium">{c.nombre}</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO[c.estado].clase}`}>
                {ESTADO[c.estado].texto}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{c.shop}</p>

            {!c.secreto_configurado && (
              <p className="text-xs text-amber-300">
                Falta el secreto de esta tienda en el servidor. Sin él no se puede conectar.
              </p>
            )}

            {editando?.tienda === c.tienda ? (
              <div className="space-y-2">
                <input
                  autoFocus
                  className={campo}
                  placeholder="https://admin.shopify.com/…"
                  aria-label={`Link de instalación de ${c.nombre}`}
                  value={editando.link}
                  onChange={(e) => setEditando({ tienda: c.tienda, link: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && void guardarLink()}
                />
                <div className="flex gap-2">
                  <button type="button" className={boton} onClick={() => void guardarLink()}>
                    Guardar
                  </button>
                  <button type="button" className={boton} onClick={() => setEditando(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {c.link_instalacion ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!c.secreto_configurado}
                    onClick={() => window.location.assign(c.link_instalacion!)}
                  >
                    {c.estado === "conectada" ? "Volver a conectar" : "Conectar Shopify"}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Falta el link de instalación
                  </span>
                )}
                <button
                  type="button"
                  className={boton}
                  onClick={() => setEditando({ tienda: c.tienda, link: c.link_instalacion ?? "" })}
                >
                  {c.link_instalacion ? "Cambiar link" : "Pegar link"}
                </button>
                {c.estado !== "conectada" && <VenceLink link={c.link_instalacion} />}
              </div>
            )}

            {c.estado !== "pendiente" && (
              <div className="space-y-1 border-t border-white/8 pt-3 text-xs text-muted-foreground">
                <p>
                  Conectada el {fecha(c.conectada_en)} · Última lectura {fecha(c.ultima_lectura)}
                </p>
                <p>
                  <span className="text-foreground">{c.variantes}</span> productos y variantes ·{" "}
                  <span className="text-foreground">{c.stock.toLocaleString("es-CL")}</span>{" "}
                  unidades en stock
                </p>
                {c.ultimo_error && <p className="text-destructive">{c.ultimo_error}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    className={`${boton} inline-flex items-center gap-1`}
                    disabled={c.estado !== "conectada" || leyendo !== null}
                    onClick={() => void leerAhora(c.tienda)}
                  >
                    {leyendo === c.tienda ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Leer ahora
                  </button>
                  {c.variantes > 0 && (
                    <button
                      type="button"
                      className={boton}
                      onClick={() => setViendo(viendo === c.tienda ? null : c.tienda)}
                    >
                      {viendo === c.tienda ? "Ocultar productos" : "Ver productos"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {viendo && <TablaProductos tienda={viendo} />}

      <details className="mt-4 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Datos de red para la lista de IP permitidas</summary>
        <div className="mt-2 space-y-1">
          {infoRed.isLoading && <p>Consultando…</p>}
          {infoRed.error && <p>{infoRed.error.message}</p>}
          {infoRed.data && (
            <>
              <p>
                IP de salida del servidor:{" "}
                <span className="text-foreground">{infoRed.data.ip ?? "—"}</span>
              </p>
              <p>
                Red (ASN):{" "}
                <span className="text-foreground">
                  {infoRed.data.asn ? `AS${infoRed.data.asn}` : "—"}
                </span>{" "}
                {infoRed.data.organizacion}
              </p>
            </>
          )}
        </div>
      </details>
    </section>
  );
}

/** Los links de Shopify vencen: se avisa la fecha, y si ya venció, que hay que generar otro. */
function VenceLink({ link }: { link: string | null }) {
  const vence = venceLink(link);
  if (!vence) return null;
  const vencido = vence.getTime() < Date.now();
  return (
    <span className={`basis-full text-xs ${vencido ? "text-amber-300" : "text-muted-foreground"}`}>
      {vencido
        ? "El link venció: genera uno nuevo en Shopify (Distribution) y pégalo con Cambiar link."
        : `El link sirve hasta el ${vence.toLocaleDateString("es-CL", { dateStyle: "long" })}.`}
    </span>
  );
}

function TablaProductos({ tienda }: { tienda: TiendaShopify }) {
  const productos = useQuery({
    queryKey: ["shopify-variantes", tienda],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopify_variantes")
        .select("variante_id, producto, variante, sku, precio, stock, estado_producto")
        .eq("tienda", tienda)
        .order("producto")
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="solid-panel mt-4 max-h-[28rem] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[#16131F]">
          <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Producto</th>
            <th className="px-3 py-2 font-medium">Variante</th>
            <th className="px-3 py-2 font-medium">SKU</th>
            <th className="px-3 py-2 text-right font-medium">Precio</th>
            <th className="px-3 py-2 text-right font-medium">Stock</th>
          </tr>
        </thead>
        <tbody>
          {(productos.data ?? []).map((p) => (
            <tr key={p.variante_id} className="border-b border-white/5 last:border-0">
              <td className="px-3 py-2">
                {p.producto}
                {p.estado_producto && p.estado_producto !== "ACTIVE" && (
                  <span className="ml-2 text-xs text-muted-foreground">(no publicado)</span>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{p.variante ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{p.sku ?? "—"}</td>
              <td className="px-3 py-2 text-right">{clp(p.precio)}</td>
              <td className="px-3 py-2 text-right">{p.stock ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
