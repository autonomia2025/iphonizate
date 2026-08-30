import { useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Plus, Trash2, X } from "lucide-react";
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

type Falta = { tipo: "pagos" | "nombre"; texto: string; key?: string };

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
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const sumado = useMemo(() => pagos.reduce((s, p) => s + aNumero(p.monto), 0), [pagos]);
  const diferencia = total - sumado;

  const faltas = useMemo<Falta[]>(() => {
    const lista: Falta[] = [];
    if (!pagos.length || diferencia > 0)
      lista.push({ tipo: "pagos", texto: `Falta cubrir ${formatCLP(Math.max(diferencia, total - sumado || total))} en pagos` });
    if (diferencia < 0) lista.push({ tipo: "pagos", texto: `Sobran ${formatCLP(-diferencia)}: revisa los montos` });
    const sinNombre = pagos.find(
      (p) =>
        (p.metodo === "transferencia" || p.metodo === "credito" || p.metodo === "partePago") &&
        !p.nombre.trim(),
    );
    if (sinNombre)
      lista.push({
        tipo: "nombre",
        texto:
          sinNombre.metodo === "partePago"
            ? "Falta describir el equipo recibido"
            : "Falta el nombre de quien transfirió",
        key: sinNombre.key,
      });
    return lista;
  }, [pagos, diferencia, total, sumado]);

  const bloqueado = faltas.length > 0;

  if (!abierto) return null;

  const enfocarMonto = (key: string) => {
    requestAnimationFrame(() => {
      contenedorRef.current
        ?.querySelector<HTMLInputElement>(`input[data-monto="${key}"]`)
        ?.focus();
    });
  };

  const agregar = (metodo: MetodoPago = "efectivo") => {
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setPagos((p) => [
      ...p,
      { key, metodo, monto: p.length === 0 ? String(total) : "", nombre: "" },
    ]);
    enfocarMonto(key);
  };

  const actualizar = (key: string, cambios: Partial<PagoFila>) =>
    setPagos((p) => p.map((f) => (f.key === key ? { ...f, ...cambios } : f)));

  const quitar = (key: string) => setPagos((p) => p.filter((f) => f.key !== key));

  const completar = (key: string) => {
    actualizar(key, { monto: String(Math.max(diferencia, 0)) });
    enfocarMonto(key);
  };

  const irAFalta = () => {
    const primera = faltas[0];
    if (!primera) return;
    const objetivo = primera.key
      ? contenedorRef.current?.querySelector<HTMLElement>(`[data-fila="${primera.key}"] input[data-nombre]`)
      : contenedorRef.current?.querySelector<HTMLElement>('input[data-monto][value=""], input[data-monto]:not([value])');
    const fallback =
      objetivo ??
      contenedorRef.current?.querySelector<HTMLElement>("input[data-monto]");
    if (fallback) {
      fallback.scrollIntoView({ behavior: "smooth", block: "center" });
      fallback.focus();
    }
    if (primera.key) {
      setFlashKey(primera.key);
      setTimeout(() => setFlashKey(null), 1200);
    }
  };

  const intentarConfirmar = () => {
    if (bloqueado) {
      irAFalta();
      return;
    }
    void confirmar();
  };

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
        _cliente: clienteId as unknown as string,
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
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm modal-rapido"
        onClick={onCerrar}
      />
      <div
        ref={contenedorRef}
        className="modal-rapido glass-flotante relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl p-6"
      >
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

          {pagos.map((p) => {
            const enCero = aNumero(p.monto) === 0;
            
            return (
              <div
                key={p.key}
                data-fila={p.key}
                className={`rounded-xl border p-3 transition-all duration-200 ${
                  enCero
                    ? "border-dashed border-white/15 bg-white/[0.02] opacity-60"
                    : "border-white/10 bg-white/[0.04]"
                } ${flashKey === p.key ? "ring-2 ring-amber-400/70" : ""}`}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
                  <select
                    className={campo}
                    value={p.metodo}
                    aria-label="Método de pago"
                    onChange={(e) =>
                      actualizar(p.key, { metodo: e.target.value as MetodoPago, nombre: "" })
                    }
                  >
                    {metodosRapidos.map((m) => (
                      <option key={m.valor} value={m.valor} className="bg-[#16131F]">
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <input
                    data-monto={p.key}
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
                    data-nombre
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
                      data-nombre
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

                {enCero && diferencia > 0 && (
                  <button
                    type="button"
                    onClick={() => completar(p.key)}
                    className="mt-2 text-xs font-medium text-[var(--accent-store)] underline-offset-2 transition-colors duration-200 hover:underline"
                  >
                    Completar con lo que falta ({formatCLP(diferencia)})
                  </button>
                )}
              </div>
            );
          })}

          <Button
            variant="ghost"
            onClick={() => agregar()}
            className="w-full gap-2 border border-white/10"
          >
            <Plus className="size-4" /> Agregar pago
          </Button>
        </div>

        <div className="mt-5 space-y-2 border-t border-white/8 pt-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Total de la venta</span>
            <span className="num text-foreground">{formatCLP(total)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Suma de los pagos</span>
            <span className="num text-foreground">{formatCLP(sumado)}</span>
          </div>
          {diferencia > 0 && (
            <p className="num flex justify-between font-medium text-amber-300">
              <span>Falta por cubrir</span>
              <span>{formatCLP(diferencia)}</span>
            </p>
          )}
          {diferencia < 0 && (
            <p className="num flex justify-between font-medium text-red-300">
              <span>Sobran (error de digitación)</span>
              <span>{formatCLP(-diferencia)}</span>
            </p>
          )}
          {diferencia === 0 && pagos.length > 0 && (
            <p className="flex items-center gap-1.5 font-medium text-emerald-300">
              <CheckCircle2 className="size-4" /> Pagos completos
            </p>
          )}
          {diferencia !== 0 && (
            <p className="text-xs text-muted-foreground">
              No hay ventas al fiado ni pagos parciales: para eso está Reservas.
            </p>
          )}
        </div>

        <div className="mt-4 flex items-end gap-3">
          <div className="min-h-10 flex-1 space-y-0.5 text-xs">
            {faltas.map((f, i) => (
              <p key={i} className="flex items-center gap-1.5 text-amber-300">
                <AlertCircle className="size-3.5 shrink-0" /> {f.texto}
              </p>
            ))}
            {!clienteId && (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                · Venta sin cliente asignado
              </p>
            )}
            {!faltas.length && clienteId && (
              <p className="flex items-center gap-1.5 text-emerald-300">
                <CheckCircle2 className="size-3.5 shrink-0" /> Todo listo para confirmar
              </p>
            )}
          </div>
          <Button
            onClick={intentarConfirmar}
            aria-disabled={bloqueado || guardando}
            className={`accent-glow h-12 shrink-0 bg-[var(--accent-store)] px-6 text-base text-white hover:bg-[var(--accent-store)]/90 ${
              bloqueado && !guardando ? "cursor-not-allowed opacity-40" : ""
            }`}
          >
            {guardando ? "Registrando..." : "Confirmar venta"}
          </Button>
        </div>
      </div>
    </div>
  );
}
