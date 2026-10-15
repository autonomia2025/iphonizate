import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { METODOS, aNumero, type MetodoPago } from "@/lib/pos";

const campo =
  "h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25";

export type PagoCorregible = {
  id: string;
  metodo: MetodoPago;
  monto: number;
  nombre_pagador: string | null;
};

export type VentaACorregir = { id: string; pagos: PagoCorregible[] };

type Fila = { key: string; metodo: MetodoPago; monto: string; nombre: string };

/** Igual que al vender: todo lo que no es efectivo lleva a quién o qué se recibió. */
const pideNombre = (m: MetodoPago) => m !== "efectivo";

let siguiente = 0;
const nuevaClave = () => `fila-${++siguiente}`;

/**
 * Corrige cómo se pagó una venta: se puede cambiar el método, repartir el pago en varios
 * métodos y montos, agregar o quitar pagos. Los pagos nuevos deben sumar lo mismo que antes.
 * La base de datos lo rechaza si la caja de ese día ya se cerró, y la venta vuelve a quedar
 * pendiente en Revisión de pagos.
 */
export function CorregirPagoModal({
  venta,
  onCerrar,
  onGuardado,
}: {
  venta: VentaACorregir | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setFilas(
      (venta?.pagos ?? []).map((p) => ({
        key: nuevaClave(),
        metodo: p.metodo,
        monto: String(p.monto),
        nombre: p.nombre_pagador ?? "",
      })),
    );
  }, [venta]);

  const total = useMemo(() => (venta?.pagos ?? []).reduce((s, p) => s + p.monto, 0), [venta]);
  const suma = filas.reduce((s, f) => s + aNumero(f.monto), 0);
  const diferencia = total - suma;

  const faltaNombre = filas.some((f) => pideNombre(f.metodo) && !f.nombre.trim());
  const montoEnCero = filas.some((f) => aNumero(f.monto) <= 0);
  const firma = (lista: { metodo: string; monto: number; nombre: string }[]) =>
    JSON.stringify(
      lista.map((p) => [
        p.metodo,
        p.monto,
        pideNombre(p.metodo as MetodoPago) ? p.nombre.trim() : "",
      ]),
    );
  const sinCambios =
    firma(filas.map((f) => ({ metodo: f.metodo, monto: aNumero(f.monto), nombre: f.nombre }))) ===
    firma(
      (venta?.pagos ?? []).map((p) => ({
        metodo: p.metodo,
        monto: p.monto,
        nombre: p.nombre_pagador ?? "",
      })),
    );
  const puedeGuardar =
    !guardando &&
    filas.length > 0 &&
    diferencia === 0 &&
    !faltaNombre &&
    !montoEnCero &&
    !sinCambios;

  const actualizar = (key: string, cambios: Partial<Fila>) =>
    setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...cambios } : f)));

  const agregar = () =>
    setFilas((fs) => [
      ...fs,
      {
        key: nuevaClave(),
        metodo: "efectivo",
        monto: diferencia > 0 ? String(diferencia) : "",
        nombre: "",
      },
    ]);

  const guardar = async () => {
    if (!venta) return;
    setGuardando(true);
    const { error } = await supabase.rpc("reemplazar_pagos_venta", {
      _venta: venta.id,
      _pagos: filas.map((f) => ({
        metodo: f.metodo,
        monto: aNumero(f.monto),
        nombre_pagador: pideNombre(f.metodo) ? f.nombre.trim() : null,
      })),
    });
    setGuardando(false);
    if (error) {
      toast.error("No se pudo corregir el pago", {
        description: error.message.replace(/^.*?:\s*/, ""),
      });
      return;
    }
    toast.success("Forma de pago corregida", {
      description: "La venta volvió a quedar pendiente en Revisión de pagos.",
    });
    onGuardado();
    onCerrar();
  };

  return (
    <Dialog open={!!venta} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="glass border-white/10 bg-white/5 backdrop-blur-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Corregir forma de pago</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Puedes cambiar el método, repartir el pago en varios métodos o agregar uno. Los montos
          deben sumar {formatCLP(total)}. No se puede corregir si la caja de ese día ya está
          cerrada.
        </p>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {filas.map((f) => (
            <div key={f.key} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
              <div className="flex items-center gap-2">
                <select
                  className={campo}
                  value={f.metodo}
                  aria-label="Método de pago"
                  onChange={(e) => actualizar(f.key, { metodo: e.target.value as MetodoPago })}
                >
                  {METODOS.map((m) => (
                    <option key={m.valor} value={m.valor} className="bg-[#16131F]">
                      {m.label}
                    </option>
                  ))}
                </select>
                <input
                  className={`${campo} num max-w-36 text-right`}
                  inputMode="numeric"
                  value={f.monto ? formatCLP(aNumero(f.monto)) : ""}
                  placeholder="$0"
                  aria-label="Monto"
                  onChange={(e) => actualizar(f.key, { monto: e.target.value.replace(/\D/g, "") })}
                />
                <button
                  type="button"
                  aria-label="Quitar este pago"
                  disabled={filas.length === 1}
                  onClick={() => setFilas((fs) => fs.filter((x) => x.key !== f.key))}
                  className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors duration-200 hover:text-red-300 disabled:opacity-30"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              {pideNombre(f.metodo) && (
                <input
                  className={`${campo} mt-2`}
                  value={f.nombre}
                  placeholder={
                    f.metodo === "partePago" ? "Equipo recibido" : "Nombre de quien pagó"
                  }
                  aria-label="Nombre del pagador"
                  onChange={(e) => actualizar(f.key, { nombre: e.target.value })}
                />
              )}
            </div>
          ))}

          <Button
            type="button"
            variant="ghost"
            onClick={agregar}
            className="w-full gap-2 border border-white/10"
          >
            <Plus className="size-4" /> Agregar otro método
          </Button>
        </div>

        <div className="space-y-1 border-t border-white/8 pt-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Total a cubrir</span>
            <span className="num text-foreground">{formatCLP(total)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Suma de los pagos</span>
            <span className="num text-foreground">{formatCLP(suma)}</span>
          </div>
          {diferencia !== 0 && (
            <p
              className={`num flex justify-between font-medium ${diferencia > 0 ? "text-amber-300" : "text-red-300"}`}
            >
              <span>{diferencia > 0 ? "Falta" : "Sobra"}</span>
              <span>{formatCLP(Math.abs(diferencia))}</span>
            </p>
          )}
          {faltaNombre && (
            <p className="text-xs text-amber-300">
              Los pagos que no son en efectivo necesitan el nombre de quien pagó o el equipo
              recibido.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" disabled={!puedeGuardar} onClick={() => void guardar()}>
            {guardando ? "Guardando…" : "Guardar corrección"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
