import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCLP } from "@/lib/stores";
import { VerificarImeiPanel } from "@/components/inventario/VerificarImeiPanel";
import {
  CATEGORIAS,
  CATEGORIA_ETIQUETA,
  ESTADOS_ACTIVOS,
  ESTADO_ETIQUETA,
  GB_OPCIONES,
  SERVICIOS,
  type EquipoEstado,
  type ServicioTipo,
} from "@/lib/inventario";


type Tienda = { id: string; nombre: string };

type Props = {
  abierto: boolean;
  onCerrar: () => void;
  tiendas: Tienda[];
  tiendaPorDefecto?: string | null;
  puedeCostos: boolean;
  onGuardado: () => void;
};

const vacio = {
  imei: "",
  modelo: "",
  gb: "128",
  color: "",
  bateria: "",
  email_vinculado: "",
  categoria: "seminuevo",
  costo: "",
  proveedor: "",
  lote: "",
  ubicacion_id: "",
  notas: "",
};

const selectClase =
  "h-9 w-full rounded-md border border-white/12 bg-white/5 px-3 text-sm text-foreground outline-none focus:border-[var(--accent-store)] focus:ring-2 focus:ring-[var(--accent-store)]/30";

export function IngresarEquipoModal({
  abierto,
  onCerrar,
  tiendas,
  tiendaPorDefecto,
  puedeCostos,
  onGuardado,
}: Props) {
  const [form, setForm] = useState({ ...vacio });
  const [servicios, setServicios] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<
    | { tipo: "reingreso"; texto: string; historial: { evento: string; fecha: string }[] }
    | { tipo: "error"; texto: string }
    | null
  >(null);
  /* Riesgos bloqueantes detectados por imeicheck (iCloud activo, lista negra) */
  const [riesgos, setRiesgos] = useState<string[]>([]);
  const [aceptoRiesgo, setAceptoRiesgo] = useState(false);
  const imeiRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof typeof vacio, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!abierto) return;
    setForm((f) => ({ ...f, ubicacion_id: f.ubicacion_id || tiendaPorDefecto || tiendas[0]?.id || "" }));
    const t = setTimeout(() => imeiRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [abierto, tiendaPorDefecto, tiendas]);

  const imeiOk = /^\d{15}$/.test(form.imei);
  const serviciosMarcados = useMemo(() => Object.keys(servicios) as ServicioTipo[], [servicios]);

  const toggleServicio = (tipo: ServicioTipo) =>
    setServicios((s) => {
      const next = { ...s };
      if (tipo in next) delete next[tipo];
      else next[tipo] = "";
      return next;
    });

  const reiniciar = () => {
    setForm((f) => ({ ...vacio, ubicacion_id: f.ubicacion_id, categoria: f.categoria }));
    setServicios({});
    setTimeout(() => imeiRef.current?.focus(), 30);
  };

  const guardar = async () => {
    setAviso(null);
    if (!imeiOk) {
      setAviso({ tipo: "error", texto: "El IMEI debe tener exactamente 15 dígitos." });
      imeiRef.current?.focus();
      return;
    }
    if (!form.modelo.trim()) {
      setAviso({ tipo: "error", texto: "Indica el modelo del equipo." });
      return;
    }
    if (!form.ubicacion_id) {
      setAviso({ tipo: "error", texto: "Selecciona la ubicación del equipo." });
      return;
    }

    setGuardando(true);
    try {
      /* Chequeo previo por las vistas, nunca contra la tabla equipos */
      const { data: previo } = await supabase
        .from("v_stock")
        .select("id, estado, tienda")
        .eq("imei", form.imei)
        .maybeSingle();

      const estadoPrevio = previo?.estado as EquipoEstado | undefined;
      if (estadoPrevio && ESTADOS_ACTIVOS.includes(estadoPrevio)) {
        setAviso({
          tipo: "error",
          texto: `Ese IMEI ya está registrado y activo: ${ESTADO_ETIQUETA[estadoPrevio]} en ${previo?.tienda ?? "una tienda de la cadena"}. No se puede ingresar de nuevo hasta que se cierre su ciclo.`,
        });
        imeiRef.current?.focus();
        return;
      }
      const esReingreso = !!estadoPrevio;

      const estadoNuevo: EquipoEstado = serviciosMarcados.length ? "POR_REVISAR" : "DISPONIBLE";
      const { error } = await supabase.from("equipos").insert({
        imei: form.imei,
        modelo: form.modelo.trim(),
        gb: form.gb ? Number(form.gb) : null,
        color: form.color.trim() || null,
        bateria: form.bateria === "" ? null : Number(form.bateria),
        email_vinculado: form.email_vinculado.trim() || null,
        categoria: form.categoria as (typeof CATEGORIAS)[number],
        costo: puedeCostos && form.costo ? Number(form.costo) : 0,
        proveedor: form.proveedor.trim() || null,
        lote: form.lote.trim() || null,
        estado: estadoNuevo,
        ubicacion_id: form.ubicacion_id,
        notas: form.notas.trim() || null,
      });

      if (error) {
        const crudo = error.message ?? "";
        const m = crudo.match(/ya existe en estado activo \((\w+)\)/);
        setAviso({
          tipo: "error",
          texto: m
            ? `Ese IMEI ya está registrado y activo (${ESTADO_ETIQUETA[m[1] as EquipoEstado] ?? m[1]}). No se puede ingresar de nuevo.`
            : /permission|denied|row-level/i.test(crudo)
              ? "Tu rol no tiene permiso para ingresar equipos."
              : "No pudimos guardar el equipo. Revisa los datos e inténtalo otra vez.",
        });
        return;
      }

      const { data: fila } = await supabase
        .from("v_stock")
        .select("id")
        .eq("imei", form.imei)
        .maybeSingle();
      const equipoId = fila?.id ?? previo?.id ?? null;

      if (equipoId && serviciosMarcados.length) {
        await supabase.from("servicios_equipo").insert(
          serviciosMarcados.map((tipo) => ({
            equipo_id: equipoId,
            tipo,
            costo: puedeCostos ? Number(servicios[tipo] || 0) : 0,
          })),
        );
      }

      if (esReingreso && equipoId) {
        const { data: hist } = await supabase
          .from("equipos_historial")
          .select("evento, fecha")
          .eq("equipo_id", equipoId)
          .order("fecha", { ascending: false })
          .limit(12);
        setAviso({
          tipo: "reingreso",
          texto: `Reingreso registrado: este IMEI ya había pasado por la cadena (${ESTADO_ETIQUETA[estadoPrevio!]}). Se actualizó la ficha existente.`,
          historial: (hist ?? []) as { evento: string; fecha: string }[],
        });
      }

      toast.success(
        esReingreso ? "Reingreso guardado" : "Equipo ingresado",
        {
          description: `${form.modelo.trim()} · IMEI ${form.imei} · ${ESTADO_ETIQUETA[estadoNuevo]}`,
        },
      );
      onGuardado();
      reiniciar();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="modal-rapido glass max-h-[90vh] overflow-y-auto border-white/10 bg-white/5 backdrop-blur-2xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Ingresar equipo</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="imei">IMEI</Label>
              <Input
                id="imei"
                ref={imeiRef}
                inputMode="numeric"
                autoComplete="off"
                placeholder="15 dígitos o lector de código de barras"
                value={form.imei}
                onChange={(e) => set("imei", e.target.value.replace(/\D/g, "").slice(0, 15))}
                className="num mt-1 tracking-[0.08em]"
              />
              <p
                className={`mt-1 text-xs ${imeiOk ? "text-emerald-300" : form.imei ? "text-amber-300" : "text-muted-foreground"}`}
              >
                {form.imei.length}/15 dígitos
                {form.imei && !imeiOk ? " · falta completar" : imeiOk ? " · válido" : ""}
              </p>
            </div>
            <div>
              <Label htmlFor="modelo">Modelo</Label>
              <Input
                id="modelo"
                className="mt-1"
                placeholder="ej: iPhone 13 Pro"
                value={form.modelo}
                onChange={(e) => set("modelo", e.target.value)}
              />
            </div>
          </div>

          <VerificarImeiPanel
            imei={form.imei}
            onUsarModelo={(modelo) => set("modelo", modelo)}
            onRiesgos={setRiesgos}
            aceptoRiesgo={aceptoRiesgo}
            onAceptoRiesgo={setAceptoRiesgo}
          />



          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="gb">GB</Label>
              <select
                id="gb"
                className={`${selectClase} mt-1`}
                value={form.gb}
                onChange={(e) => set("gb", e.target.value)}
              >
                {GB_OPCIONES.map((gb) => (
                  <option key={gb} value={gb}>
                    {gb}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="color">Color</Label>
              <Input
                id="color"
                className="mt-1"
                placeholder="ej: Grafito"
                value={form.color}
                onChange={(e) => set("color", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="bateria">Batería %</Label>
              <Input
                id="bateria"
                inputMode="numeric"
                className="num mt-1"
                placeholder="0-100"
                value={form.bateria}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                  set("bateria", v === "" ? "" : String(Math.min(100, Number(v))));
                }}
              />
            </div>
            <div>
              <Label htmlFor="categoria">Categoría</Label>
              <select
                id="categoria"
                className={`${selectClase} mt-1`}
                value={form.categoria}
                onChange={(e) => set("categoria", e.target.value)}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIA_ETIQUETA[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className={puedeCostos ? "" : "sm:col-span-2"}>
              <Label htmlFor="email">Email vinculado</Label>
              <Input
                id="email"
                className="mt-1"
                placeholder="ej: cuenta@icloud.com"
                value={form.email_vinculado}
                onChange={(e) => set("email_vinculado", e.target.value)}
              />
            </div>
            {puedeCostos && (
              <div>
                <Label htmlFor="costo">Costo de compra</Label>
                <Input
                  id="costo"
                  inputMode="numeric"
                  className="num mt-1"
                  placeholder="$0"
                  value={form.costo}
                  onChange={(e) => set("costo", e.target.value.replace(/\D/g, "").slice(0, 10))}
                />
                {form.costo && (
                  <p className="num mt-1 text-xs text-muted-foreground">
                    {formatCLP(Number(form.costo))}
                  </p>
                )}
              </div>
            )}
            <div>
              <Label htmlFor="proveedor">Proveedor</Label>
              <Input
                id="proveedor"
                className="mt-1"
                value={form.proveedor}
                onChange={(e) => set("proveedor", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="lote">Lote</Label>
              <Input
                id="lote"
                className="mt-1"
                value={form.lote}
                onChange={(e) => set("lote", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ubicacion">Ubicación</Label>
              <select
                id="ubicacion"
                className={`${selectClase} mt-1`}
                value={form.ubicacion_id}
                onChange={(e) => set("ubicacion_id", e.target.value)}
              >
                {tiendas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="notas">Notas del estado físico</Label>
            <Textarea
              id="notas"
              className="mt-1 min-h-20"
              placeholder="ej: tiene un rayón en la esquina, mensaje de batería..."
              value={form.notas}
              onChange={(e) => set("notas", e.target.value)}
            />
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <p className="text-sm font-medium">¿Qué servicios necesita?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SERVICIOS.map((s) => {
                const activo = s.tipo in servicios;
                return (
                  <button
                    key={s.tipo}
                    type="button"
                    onClick={() => toggleServicio(s.tipo)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-all duration-200 ${
                      activo
                        ? "accent-glow border-[var(--accent-store)]/50 bg-[var(--accent-store-soft)] text-foreground"
                        : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

            {serviciosMarcados.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {serviciosMarcados.map((tipo) => (
                  <div key={tipo}>
                    <Label htmlFor={`costo-${tipo}`} className="text-xs">
                      Costo {SERVICIOS.find((s) => s.tipo === tipo)?.label}
                    </Label>
                    <Input
                      id={`costo-${tipo}`}
                      inputMode="numeric"
                      className="num mt-1"
                      placeholder="$0"
                      value={servicios[tipo] ?? ""}
                      onChange={(e) =>
                        setServicios((s) => ({
                          ...s,
                          [tipo]: e.target.value.replace(/\D/g, "").slice(0, 9),
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            <p className="mt-3 text-xs text-muted-foreground">
              Sin servicios marcados entrará directo como Disponible
            </p>
          </div>

          {aviso && (
            <div
              className={`rounded-xl border p-3 text-sm ${
                aviso.tipo === "error"
                  ? "border-red-400/25 bg-red-500/10 text-red-200"
                  : "border-sky-400/25 bg-sky-500/10 text-sky-100"
              }`}
            >
              <p>{aviso.texto}</p>
              {aviso.tipo === "reingreso" && aviso.historial.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-sky-100/80">
                  {aviso.historial.map((h, i) => (
                    <li key={i} className="flex justify-between gap-4">
                      <span>{h.evento}</span>
                      <span className="num">
                        {new Date(h.fecha).toLocaleDateString("es-CL")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCerrar}>
              Cerrar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar e ingresar otro"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
