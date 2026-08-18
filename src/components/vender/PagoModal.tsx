import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import {
  METODOS,
  aNumero,
  type ItemCarrito,
  type MetodoPago,
  type PagoFila,
} from "@/lib/pos";

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

export type VentaConfirmada = {
  id: string;
  total: number;
  pagos: PagoFila[];
};

export function PagoModal({
  abierto,
  onCerrar,
  total,
  carrito,
  tiendaId,
  clienteId,
  conBoleta,
  onConfirmada,
}: {
  abierto: boolean;
  onCerrar: () => void;
  total: number;
  carrito: ItemCarrito[];
  tiendaId: string | null;
  clienteId: string | null;
  conBoleta: boolean;
  onConfirmada: (venta: VentaConfirmada) => void;
}) {
  const [pagos, setPagos] = useState<PagoFila[]>([]);
  const [guardando, setGuardando] = useState(false);

  const sumado = useMemo(() => pagos.reduce((s, p) => s + aNumero(p.monto), 0), [pagos]);
  const diferencia = total - sumado;
  const faltanNombres = pagos.some(
    (p) =>
      (p.metodo === "transferencia" || p.metodo === "credito" || p.metodo === "partePago") &&
      !p.nombre.trim(),
  );

  if (!abierto) return null;

  const agregar = () =>
    setPagos((p) => [
      ...p,
      {
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        metodo: "efectivo" as MetodoPago,
        monto: p.length === 0 ? String(total) : "",
        nombre: "",
      },
    ]);

  const actualizar = (key: string, cambios: Partial<PagoFila>) =>
    setPagos((p) => p.map((f) => (f.key === key ? { ...f, ...cambios } : f)));

  const quitar = (key: string) => setPagos((p) => p.filter((f) => f.key !== key));

  const confirmar = async () => {
    if (!tiendaId) {
      toast.error("No se pudo identificar la tienda activa");
      return;
    }
    setGuardando(true);
    try {
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
      const { data, error } = await supabase.rpc("registrar_venta", {
        _tienda: tiendaId,
        _cliente: clienteId,
        _con_boleta: conBoleta,
        _items: items,
        _pagos: pagos.map((p) => ({
          metodo: p.metodo,
          monto: aNumero(p.monto),
          nombre_pagador: p.nombre.trim() || null,
        })),
      });
      if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
      toast.success("Venta registrada");
      onConfirmada({ id: data as unknown as string, total, pagos });
      setPagos([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar la venta");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCerrar} />
      <div className="glass relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total a pagar</p>
            <p className="num font-display text-3xl font-semibold">{formatCLP(total)}</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {!pagos.length && (
            <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-muted-foreground">
              Agrega los pagos hasta cubrir el total. Puedes combinar varios métodos.
            </p>
          )}

          {pagos.map((p) => (
            <div key={p.key} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
                <select
                  className={campo}
                  value={p.metodo}
                  aria-label="Método de pago"
                  onChange={(e) =>
                    actualizar(p.key, { metodo: e.target.value as MetodoPago, nombre: "" })
                  }
                >
                  {METODOS.map((m) => (
                    <option key={m.valor} value={m.valor} className="bg-[#16131F]">
                      {m.label}
                    </option>
                  ))}
                </select>
                <input
                  className={`${campo} num text-right`}
                  value={p.monto}
                  inputMode="numeric"
                  placeholder="Monto"
                  aria-label="Monto"
                  onChange={(e) =>
                    actualizar(p.key, { monto: e.target.value.replace(/[^\d]/g, "") })
                  }
                />
                <button
                  type="button"
                  onClick={() => quitar(p.key)}
                  aria-label="Eliminar pago"
                  className="p-2 text-muted-foreground transition-colors duration-200 hover:text-red-300"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              {(p.metodo === "transferencia" || p.metodo === "credito") && (
                <input
                  className={`${campo} mt-2`}
                  value={p.nombre}
                  placeholder="Nombre de quien transfirió"
                  aria-label="Nombre de quien transfirió"
                  onChange={(e) => actualizar(p.key, { nombre: e.target.value })}
                />
              )}

              {p.metodo === "partePago" && (
                <>
                  <input
                    className={`${campo} mt-2`}
                    value={p.nombre}
                    placeholder="Equipo recibido y su valor (ej. iPhone 11 128GB negro · $180.000)"
                    aria-label="Equipo recibido como parte de pago"
                    onChange={(e) => actualizar(p.key, { nombre: e.target.value })}
                  />
                  <p className="mt-1.5 text-xs text-amber-300">
                    El equipo recibido debe ingresarse manualmente al inventario.
                  </p>
                </>
              )}
            </div>
          ))}

          <Button variant="ghost" onClick={agregar} className="w-full gap-2 border border-white/10">
            <Plus className="size-4" /> Agregar pago
          </Button>
        </div>

        <div className="mt-5 space-y-2 border-t border-white/8 pt-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Total de la venta</span>
            <span className="num text-foreground">{formatCLP(total)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Pagos ingresados</span>
            <span className="num text-foreground">{formatCLP(sumado)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {diferencia === 0 ? "Diferencia" : diferencia > 0 ? "Falta" : "Sobra"}
            </span>
            <span
              className={`num ${diferencia === 0 ? "text-emerald-300" : "text-red-300"}`}
            >
              {formatCLP(Math.abs(diferencia))}
            </span>
          </div>
          {diferencia !== 0 && (
            <p className="text-xs text-muted-foreground">
              No hay ventas al fiado ni pagos parciales: para eso está Reservas.
            </p>
          )}
        </div>

        <Button
          onClick={confirmar}
          disabled={guardando || diferencia !== 0 || !pagos.length || faltanNombres}
          className="accent-glow mt-4 h-12 w-full bg-[var(--accent-store)] text-base text-white hover:bg-[var(--accent-store)]/90 disabled:opacity-40"
        >
          {guardando ? "Registrando..." : "Confirmar venta"}
        </Button>
      </div>
    </div>
  );
}
