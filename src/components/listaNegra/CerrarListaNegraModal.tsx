import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EtiquetasModal } from "@/components/inventario/EtiquetasModal";
import type { EquipoEtiqueta } from "@/lib/etiquetas";
import { formatCLP } from "@/lib/stores";
import type { FilaListaNegra } from "@/lib/listaNegra";
import {
  CamposEquipo,
  DATOS_EQUIPO_VACIO,
  datosEquipoJson,
  faltaEnDatos,
  type DatosEquipo,
} from "@/components/listaNegra/CamposEquipo";

export type ModoCierre = "vendido" | "cambiado";

const textoEquipo = (f: FilaListaNegra) =>
  [f.modelo, f.gb ? `${f.gb} GB` : null, f.color].filter(Boolean).join(" · ");

export function CerrarListaNegraModal({
  fila,
  modo,
  tiendas,
  puedeCostos,
  verGanancias,
  onCerrar,
  onHecho,
}: {
  fila: FilaListaNegra;
  modo: ModoCierre;
  tiendas: { id: string; nombre: string }[];
  puedeCostos: boolean;
  verGanancias: boolean;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const queryClient = useQueryClient();
  const [valor, setValor] = useState("");
  const [notas, setNotas] = useState("");
  const [recibido, setRecibido] = useState<DatosEquipo>({
    ...DATOS_EQUIPO_VACIO,
    ubicacion_id: fila.ubicacion_id ?? tiendas[0]?.id ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [etiqueta, setEtiqueta] = useState<EquipoEtiqueta | null>(null);

  const fallar = (texto: string) => {
    setError(texto);
    toast.error(
      modo === "vendido" ? "No se pudo marcar como vendido" : "No se pudo registrar el cambio",
      {
        description: texto,
      },
    );
  };

  const vender = async () => {
    if (!(Number(valor) > 0)) {
      fallar("Ingresa el valor de la venta.");
      return;
    }
    setGuardando(true);
    const { error: err } = await supabase.rpc("lista_negra_vender", {
      _id: fila.id,
      _valor: Number(valor),
      _notas: notas.trim(),
    });
    setGuardando(false);
    if (err) {
      fallar(err.message.replace(/^.*?:\s*/, ""));
      return;
    }
    toast.success("Equipo de lista negra vendido", {
      description: `${textoEquipo(fila)} · ${formatCLP(Number(valor))}`,
    });
    onHecho();
    onCerrar();
  };

  const cambiar = async () => {
    const falta = faltaEnDatos(recibido, { costoObligatorio: false });
    if (falta) {
      fallar(falta);
      return;
    }
    if (recibido.imei === fila.imei) {
      fallar("El equipo recibido debe ser otro teléfono, con otro IMEI.");
      return;
    }
    setGuardando(true);
    const { error: err } = await supabase.rpc("lista_negra_cambiar", {
      _id: fila.id,
      _equipo: datosEquipoJson(recibido),
    });
    setGuardando(false);
    if (err) {
      const crudo = err.message ?? "";
      const activo = crudo.match(/ya existe en estado activo \((\w+)\)/);
      fallar(
        activo
          ? `Ese IMEI ya está en el inventario (${activo[1]}).`
          : crudo.replace(/^.*?:\s*/, ""),
      );
      return;
    }
    toast.success("Cambio registrado", {
      description: `${recibido.modelo.trim()} · IMEI ${recibido.imei} entró al inventario como Disponible`,
    });
    void queryClient.invalidateQueries({ queryKey: ["v_stock"] });
    onHecho();
    /* Etiqueta del equipo recibido, que ya está en el inventario normal */
    setEtiqueta({
      imei: recibido.imei,
      modelo: recibido.modelo.trim(),
      gb: recibido.gb ? Number(recibido.gb) : null,
      color: recibido.color.trim() || null,
      etapa: "Disponible",
      bateria: recibido.bateria === "" ? null : Number(recibido.bateria),
      sim: recibido.sim || null,
    });
  };

  const resultado = fila.costo != null && Number(valor) > 0 ? Number(valor) - fila.costo : null;

  return (
    <>
      <Dialog open={!etiqueta} onOpenChange={(v) => !v && onCerrar()}>
        <DialogContent
          className={`modal-rapido glass max-h-[90vh] overflow-y-auto border-white/10 bg-white/5 backdrop-blur-2xl ${
            modo === "cambiado" ? "sm:max-w-3xl" : "sm:max-w-lg"
          }`}
        >
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              {modo === "vendido" ? "Marcar como vendido" : "Registrar cambio"}
            </DialogTitle>
          </DialogHeader>

          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <p className="text-sm font-medium">{textoEquipo(fila)}</p>
            <p className="num text-xs tracking-[0.04em] text-muted-foreground">
              {fila.imei} · {fila.tienda ?? "sin ubicación"}
              {puedeCostos && fila.costo != null ? ` · costo ${formatCLP(fila.costo)}` : ""}
            </p>
          </div>

          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void (modo === "vendido" ? vender() : cambiar());
            }}
          >
            {modo === "vendido" ? (
              <>
                <div>
                  <Label htmlFor="ln-valor">
                    Valor de la venta <span className="text-amber-300">obligatorio</span>
                  </Label>
                  <Input
                    id="ln-valor"
                    autoFocus
                    inputMode="numeric"
                    className="num mt-1"
                    placeholder="$0"
                    value={valor}
                    onChange={(e) => setValor(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  />
                  {valor && (
                    <p className="num mt-1 text-xs text-muted-foreground">
                      {formatCLP(Number(valor))}
                      {verGanancias && resultado != null && (
                        <span className={resultado < 0 ? "text-red-300" : "text-emerald-300"}>
                          {" "}
                          · {resultado < 0 ? "pérdida" : "ganancia"}{" "}
                          {formatCLP(Math.abs(resultado))}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="ln-notas-venta">Notas</Label>
                  <Textarea
                    id="ln-notas-venta"
                    className="mt-1 min-h-16"
                    placeholder="Opcional: a quién se vendió, cómo se pagó…"
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Datos del teléfono que se recibió a cambio. Entra solo al inventario normal como
                  Disponible{puedeCostos ? "" : ", con el costo del equipo de lista negra"}.
                </p>
                <CamposEquipo
                  valor={recibido}
                  onCambio={setRecibido}
                  tiendas={tiendas}
                  puedeCostos={puedeCostos}
                  costoObligatorio={false}
                  costoAyuda={
                    fila.costo != null
                      ? `Vacío: hereda ${formatCLP(fila.costo)} del equipo de lista negra`
                      : "Vacío: hereda el costo del equipo de lista negra"
                  }
                  etiquetaProveedor="Proveedor (de quién se recibió)"
                  conCategoria
                  abierto
                />
              </>
            )}

            {error && (
              <p className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onCerrar}>
                Cancelar
              </Button>
              <Button type="submit" className="accent-glow" disabled={guardando}>
                {guardando
                  ? "Guardando…"
                  : modo === "vendido"
                    ? "Marcar como vendido"
                    : "Registrar cambio e ingresar equipo"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <EtiquetasModal
        abierto={!!etiqueta}
        equipos={etiqueta ? [etiqueta] : []}
        onCerrar={onCerrar}
      />
    </>
  );
}
