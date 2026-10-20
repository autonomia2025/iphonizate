import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useStore } from "@/components/StoreContext";
import type { EquipoMinimo } from "@/components/arqueo/HistorialEquipoModal";
import { textoEquipo } from "@/lib/arqueo";
import { cn } from "@/lib/utils";

export type CausaPendiente =
  "encontrado_bodega" | "otra_ubicacion" | "vendido_sin_registrar" | "cambio" | "error_registro";

const CAUSAS: { valor: CausaPendiente; titulo: string; ayuda: string }[] = [
  {
    valor: "encontrado_bodega",
    titulo: "Encontrado en bodega",
    ayuda: "Vuelve a Disponible en la bodega central.",
  },
  {
    valor: "otra_ubicacion",
    titulo: "Estaba en otra ubicación",
    ayuda: "Se anota el traslado que faltó y queda en esa ubicación.",
  },
  {
    valor: "vendido_sin_registrar",
    titulo: "Se vendió y no se registró",
    ayuda: "Se abre Vender con el equipo cargado para registrar la venta.",
  },
  {
    valor: "cambio",
    titulo: "Se cambió por otro equipo",
    ayuda: "Cambio o garantía no registrada: ambos equipos quedan vinculados.",
  },
  {
    valor: "error_registro",
    titulo: "Error de registro",
    ayuda: "IMEI mal ingresado o registro duplicado.",
  },
];

const campo =
  "h-9 w-full rounded-md border border-white/12 bg-[#16131F] px-3 text-sm text-foreground outline-none focus:border-[var(--accent-store)] focus:ring-2 focus:ring-[var(--accent-store)]/30";
const sinPrefijo = (m: string) => m.replace(/^.*?:\s*/, "");

/** Elegir qué pasó con un equipo pendiente. La nota es opcional en todos los casos. */
export function ResolverPendienteModal({
  equipo,
  causaInicial = "encontrado_bodega",
  onCerrar,
  onResuelto,
}: {
  equipo: EquipoMinimo;
  causaInicial?: CausaPendiente;
  onCerrar: () => void;
  onResuelto: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { setStoreId } = useStore();
  const [causa, setCausa] = useState<CausaPendiente>(causaInicial);
  const [nota, setNota] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [estadoUbic, setEstadoUbic] = useState<"DISPONIBLE" | "EN_TECNICO">("DISPONIBLE");
  const [imeiOtro, setImeiOtro] = useState("");
  const [estadoCambio, setEstadoCambio] = useState<"ENTREGADO" | "GARANTIA">("ENTREGADO");
  const [accionError, setAccionError] = useState<"corregir_imei" | "baja_duplicado">(
    "corregir_imei",
  );
  const [imeiNuevo, setImeiNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const tiendas = useQuery({
    queryKey: ["tiendas-slug-bodega"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tiendas")
        .select("id, nombre, slug, es_bodega")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });
  const opcionesUbicacion = (tiendas.data ?? []).filter(
    (t) => causa !== "vendido_sin_registrar" || !t.es_bodega,
  );

  const datos = (): Record<string, string> | string => {
    switch (causa) {
      case "otra_ubicacion":
        if (!ubicacion) return "Elige la ubicación donde estaba";
        return { ubicacion_id: ubicacion, estado: estadoUbic };
      case "vendido_sin_registrar":
        if (!ubicacion) return "Elige la tienda donde se vendió";
        return { ubicacion_id: ubicacion };
      case "cambio":
        if (!/^\d{15}$/.test(imeiOtro))
          return "Escanea o escribe el IMEI del otro equipo (15 dígitos)";
        return { imei_otro: imeiOtro, estado: estadoCambio };
      case "error_registro":
        if (accionError === "corregir_imei") {
          if (!/^\d{15}$/.test(imeiNuevo)) return "Escribe el IMEI correcto (15 dígitos)";
          return { accion: "corregir_imei", imei_nuevo: imeiNuevo };
        }
        return { accion: "baja_duplicado" };
      default:
        return {};
    }
  };

  const guardar = async () => {
    const d = datos();
    if (typeof d === "string") {
      toast.error(d);
      return;
    }
    if (
      causa === "error_registro" &&
      accionError === "baja_duplicado" &&
      !window.confirm(
        `¿Dar de baja este registro (IMEI ${equipo.imei})?\n\nSe elimina del sistema por estar duplicado. Queda una copia en Auditoría.`,
      )
    )
      return;

    setGuardando(true);
    const { data, error } = await supabase.rpc("pendiente_resolver", {
      _equipo: equipo.id,
      _causa: causa,
      _datos: d,
      _nota: nota.trim(),
    });
    setGuardando(false);
    if (error) {
      toast.error("No se pudo resolver", { description: sinPrefijo(error.message) });
      return;
    }
    const r = (data ?? {}) as { abrir_venta?: boolean; imei?: string; tienda_slug?: string };
    toast.success("Pendiente resuelto", {
      description: CAUSAS.find((c) => c.valor === causa)?.titulo,
    });
    void queryClient.invalidateQueries({ queryKey: ["arqueo-pendientes"] });
    void queryClient.invalidateQueries({ queryKey: ["v_stock"] });
    onResuelto();
    onCerrar();

    /* Venta no registrada: se abre Vender en esa tienda con el equipo cargado */
    if (r.abrir_venta && r.imei) {
      if (r.tienda_slug) setStoreId(r.tienda_slug);
      void navigate({ to: "/vender", search: { imei: r.imei } });
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="modal-rapido glass max-h-[90vh] overflow-y-auto border-white/10 bg-white/5 backdrop-blur-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Resolver pendiente</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-sm text-muted-foreground">
          {textoEquipo(equipo)} · <span className="num">{equipo.imei}</span>
        </p>

        <div role="radiogroup" aria-label="Qué pasó" className="grid gap-2">
          {CAUSAS.map((c) => (
            <button
              key={c.valor}
              type="button"
              role="radio"
              aria-checked={causa === c.valor}
              onClick={() => {
                setCausa(c.valor);
                setUbicacion("");
              }}
              className={cn(
                "rounded-xl border px-4 py-2.5 text-left transition-all duration-200",
                causa === c.valor
                  ? "accent-glow border-[var(--accent-store)]/50 bg-[var(--accent-store-soft)]"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
              )}
            >
              <p className="text-sm font-medium">{c.titulo}</p>
              <p className="text-xs text-muted-foreground">{c.ayuda}</p>
            </button>
          ))}
        </div>

        {(causa === "otra_ubicacion" || causa === "vendido_sin_registrar") && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              {causa === "vendido_sin_registrar" ? "Tienda donde se vendió" : "Dónde estaba"}
              <select
                className={`${campo} mt-1`}
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
              >
                <option value="">Elige…</option>
                {opcionesUbicacion.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
            {causa === "otra_ubicacion" && (
              <label className="text-xs text-muted-foreground">
                Queda como
                <select
                  className={`${campo} mt-1`}
                  value={estadoUbic}
                  onChange={(e) => setEstadoUbic(e.target.value as "DISPONIBLE" | "EN_TECNICO")}
                >
                  <option value="DISPONIBLE">Disponible</option>
                  <option value="EN_TECNICO">Con el técnico</option>
                </select>
              </label>
            )}
          </div>
        )}

        {causa === "cambio" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              IMEI del otro equipo
              <input
                autoFocus
                inputMode="numeric"
                className={`${campo} num mt-1`}
                placeholder="Escanea o escribe"
                value={imeiOtro}
                onChange={(e) => setImeiOtro(e.target.value.replace(/\D/g, "").slice(0, 15))}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Este equipo queda como
              <select
                className={`${campo} mt-1`}
                value={estadoCambio}
                onChange={(e) => setEstadoCambio(e.target.value as "ENTREGADO" | "GARANTIA")}
              >
                <option value="ENTREGADO">Entregado (cambio)</option>
                <option value="GARANTIA">En garantía</option>
              </select>
            </label>
          </div>
        )}

        {causa === "error_registro" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["corregir_imei", "Corregir el IMEI"],
                  ["baja_duplicado", "Dar de baja el duplicado"],
                ] as const
              ).map(([valor, texto]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setAccionError(valor)}
                  className={cn(
                    "h-9 rounded-md border text-sm transition-all duration-200",
                    accionError === valor
                      ? "border-[var(--accent-store)]/50 bg-[var(--accent-store-soft)]"
                      : "border-white/12 bg-white/5 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {texto}
                </button>
              ))}
            </div>
            {accionError === "corregir_imei" ? (
              <label className="block text-xs text-muted-foreground">
                IMEI correcto (queda registrado el anterior)
                <input
                  autoFocus
                  inputMode="numeric"
                  className={`${campo} num mt-1`}
                  value={imeiNuevo}
                  onChange={(e) => setImeiNuevo(e.target.value.replace(/\D/g, "").slice(0, 15))}
                />
              </label>
            ) : (
              <p className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-2.5 text-xs text-amber-100">
                Se elimina este registro porque es un duplicado de otro equipo. Solo se puede si no
                tiene ventas, reservas ni garantías. Queda una copia en Auditoría.
              </p>
            )}
          </div>
        )}

        <label className="block text-xs text-muted-foreground">
          Nota (opcional)
          <input
            className={`${campo} mt-1`}
            value={nota}
            placeholder="Qué se encontró, dónde, quién…"
            onChange={(e) => setNota(e.target.value)}
          />
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button className="accent-glow" disabled={guardando} onClick={() => void guardar()}>
            {guardando
              ? "Guardando…"
              : causa === "vendido_sin_registrar"
                ? "Resolver y registrar la venta"
                : "Resolver"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
