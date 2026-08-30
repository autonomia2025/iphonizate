import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/stores";
import { aMonto } from "@/lib/caja";
import {
  ASIGNACIONES,
  TIPOS_PERSONAL,
  etiquetaAsignacion,
  etiquetaTipo,
  type PersonaFinanzas,
  type TipoPersonal,
} from "@/lib/finanzas";
import {
  EncabezadoFinanzas,
  SinAccesoFinanzas,
  campoFin,
  useFinanzas,
} from "@/components/finanzas/MarcoFinanzas";
import { cn } from "@/lib/utils";

const DESC =
  "Maestro de personas del holding: cargo, asignación, tipo de contrato, datos previsionales y montos de referencia.";

export const Route = createFileRoute("/finanzas/personal")({
  head: () => ({
    meta: [
      { title: "Personal · iPhonizate OS" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Personal · iPhonizate OS" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PersonalPage,
});

type Form = {
  nombre: string;
  cargo: string;
  area: string;
  asignacion: string;
  tipo: TipoPersonal;
  empresa_rut: string;
  rut: string;
  fecha_ingreso: string;
  afp: string;
  salud: string;
  sueldo_base: string;
  liquido_liquidacion: string;
  bonificacion_extra: string;
  bono_variable_referencia: string;
  estado: "activo" | "inactivo";
  revisar: boolean;
  notas: string;
};

const vacio: Form = {
  nombre: "",
  cargo: "",
  area: "",
  asignacion: "compartido",
  tipo: "sin_contrato",
  empresa_rut: "",
  rut: "",
  fecha_ingreso: "",
  afp: "",
  salud: "",
  sueldo_base: "",
  liquido_liquidacion: "",
  bonificacion_extra: "",
  bono_variable_referencia: "",
  estado: "activo",
  revisar: false,
  notas: "",
};

function PersonalPage() {
  const { autorizado } = useFinanzas("personal");
  const [editando, setEditando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Form>(vacio);
  const [guardando, setGuardando] = useState(false);
  const [verInactivos, setVerInactivos] = useState(false);

  const personal = useQuery({
    queryKey: ["finanzas-personal-full"],
    enabled: autorizado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal")
        .select(
          "id, nombre, cargo, area, asignacion, tipo, empresa_rut, rut, fecha_ingreso, afp, salud, sueldo_base, liquido_liquidacion, bonificacion_extra, bono_variable_referencia, estado, revisar, notas, usuario_id",
        )
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as unknown as PersonaFinanzas[];
    },
  });

  const filas = useMemo(
    () => (personal.data ?? []).filter((p) => verInactivos || p.estado === "activo"),
    [personal.data, verInactivos],
  );

  const totales = useMemo(
    () =>
      filas.reduce(
        (a, p) => ({
          liquido: a.liquido + Number(p.liquido_liquidacion),
          bonificacion: a.bonificacion + Number(p.bonificacion_extra),
          bono: a.bono + Number(p.bono_variable_referencia),
        }),
        { liquido: 0, bonificacion: 0, bono: 0 },
      ),
    [filas],
  );

  const abrirNuevo = () => {
    setEditando(null);
    setForm(vacio);
    setAbierto(true);
  };

  const abrirEdicion = (p: PersonaFinanzas) => {
    setEditando(p.id);
    setForm({
      nombre: p.nombre,
      cargo: p.cargo ?? "",
      area: p.area ?? "",
      asignacion: p.asignacion,
      tipo: p.tipo,
      empresa_rut: p.empresa_rut ?? "",
      rut: p.rut ?? "",
      fecha_ingreso: p.fecha_ingreso ?? "",
      afp: p.afp ?? "",
      salud: p.salud ?? "",
      sueldo_base: String(p.sueldo_base),
      liquido_liquidacion: String(p.liquido_liquidacion),
      bonificacion_extra: String(p.bonificacion_extra),
      bono_variable_referencia: String(p.bono_variable_referencia),
      estado: p.estado,
      revisar: p.revisar,
      notas: p.notas ?? "",
    });
    setAbierto(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) { toast.error("El nombre es obligatorio"); return; }
    setGuardando(true);
    const payload = {
      nombre: form.nombre.trim(),
      cargo: form.cargo.trim() || null,
      area: form.area.trim() || null,
      asignacion: form.asignacion,
      tipo: form.tipo,
      empresa_rut: form.empresa_rut.trim() || null,
      rut: form.rut.trim() || null,
      fecha_ingreso: form.fecha_ingreso || null,
      afp: form.afp.trim() || null,
      salud: form.salud.trim() || null,
      sueldo_base: aMonto(form.sueldo_base),
      liquido_liquidacion: aMonto(form.liquido_liquidacion),
      bonificacion_extra: aMonto(form.bonificacion_extra),
      bono_variable_referencia: aMonto(form.bono_variable_referencia),
      estado: form.estado,
      revisar: form.revisar,
      notas: form.notas.trim() || null,
    };
    const { error } = editando
      ? await supabase.from("personal").update(payload).eq("id", editando)
      : await supabase.from("personal").insert(payload);
    setGuardando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editando ? "Ficha actualizada" : "Persona agregada");
    setAbierto(false);
    void personal.refetch();
  };

  const cambiarEstado = async (p: PersonaFinanzas) => {
    const nuevo = p.estado === "activo" ? "inactivo" : "activo";
    const { error } = await supabase.from("personal").update({ estado: nuevo }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(
      nuevo === "inactivo"
        ? `${p.nombre} quedó inactivo. Sus meses anteriores no se tocan.`
        : `${p.nombre} está activo otra vez`,
    );
    void personal.refetch();
  };

  if (!autorizado) return <SinAccesoFinanzas />;

  return (
    <div className="mx-auto max-w-[100rem]">
      <EncabezadoFinanzas
        titulo="Personal"
        descripcion={DESC}
        acciones={
          <>
            <label className="glass flex items-center gap-2 px-3 py-2 text-[13px] text-muted-foreground">
              <input
                type="checkbox"
                checked={verInactivos}
                onChange={(e) => setVerInactivos(e.target.checked)}
                className="size-4 accent-[var(--accent-store)]"
              />
              Ver inactivos
            </label>
            <Button onClick={abrirNuevo}>
              <Plus className="size-4" /> Nueva persona
            </Button>
          </>
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="glass p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Personas</p>
          <p className="num mt-2 font-display text-2xl font-semibold">{filas.length}</p>
        </div>
        <div className="glass p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Líquido de referencia
          </p>
          <p className="num mt-2 font-display text-2xl font-semibold">
            {formatCLP(totales.liquido)}
          </p>
        </div>
        <div className="glass p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Bonificaciones
          </p>
          <p className="num mt-2 font-display text-2xl font-semibold">
            {formatCLP(totales.bonificacion)}
          </p>
        </div>
        <div className="glass p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Bonos de referencia
          </p>
          <p className="num mt-2 font-display text-2xl font-semibold">{formatCLP(totales.bono)}</p>
        </div>
      </div>

      <div className="solid-panel mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-3 font-medium">Persona</th>
                <th className="px-3 py-3 font-medium">Área</th>
                <th className="px-3 py-3 font-medium">Asignación</th>
                <th className="px-3 py-3 font-medium">Tipo</th>
                <th className="px-3 py-3 font-medium">RUT</th>
                <th className="px-3 py-3 font-medium">AFP / Salud</th>
                <th className="px-3 py-3 text-right font-medium">Líquido</th>
                <th className="px-3 py-3 text-right font-medium">Bonificación</th>
                <th className="px-3 py-3 text-right font-medium">Bono ref.</th>
                <th className="px-3 py-3 font-medium">Estado</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-white/5 transition-colors duration-200 last:border-0 hover:bg-white/[0.035]"
                >
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      {p.nombre}
                      {p.revisar && (
                        <span
                          title={p.notas ?? "Revisar los datos de esta persona"}
                          className="flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-warning"
                        >
                          <AlertTriangle className="size-3" /> revisar
                        </span>
                      )}
                    </span>
                    <span className="block text-[12px] text-muted-foreground">
                      {p.cargo ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.area ?? "—"}</td>
                  <td className="px-3 py-2.5">{etiquetaAsignacion(p.asignacion)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{etiquetaTipo(p.tipo)}</td>
                  <td className="num px-3 py-2.5 text-muted-foreground">{p.rut ?? "—"}</td>
                  <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                    {[p.afp, p.salud].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="num px-3 py-2.5 text-right">
                    {formatCLP(p.liquido_liquidacion)}
                  </td>
                  <td className="num px-3 py-2.5 text-right">{formatCLP(p.bonificacion_extra)}</td>
                  <td className="num px-3 py-2.5 text-right">
                    {formatCLP(p.bono_variable_referencia)}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => void cambiarEstado(p)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-wide transition-colors duration-200",
                        p.estado === "activo"
                          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                          : "border-white/10 bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]",
                      )}
                    >
                      {p.estado === "activo" ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      aria-label={`Editar ${p.nombre}`}
                      onClick={() => abrirEdicion(p)}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.07] hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">
                    {personal.isLoading ? "Cargando personal…" : "Sin personas cargadas"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {abierto && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="glass max-h-[88vh] w-full max-w-3xl overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-display text-lg font-semibold">
                {editando ? "Editar ficha" : "Nueva persona"}
              </h2>
              <button
                aria-label="Cerrar"
                onClick={() => setAbierto(false)}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-white/[0.07] hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["nombre", "Nombre"],
                  ["cargo", "Cargo"],
                  ["area", "Área"],
                  ["empresa_rut", "Empresa (RUT)"],
                  ["rut", "RUT"],
                  ["afp", "AFP"],
                  ["salud", "Salud"],
                ] as const
              ).map(([campo, label]) => (
                <label key={campo} className="block">
                  <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                    {label}
                  </span>
                  <input
                    className={campoFin}
                    value={form[campo]}
                    onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                  />
                </label>
              ))}

              <label className="block">
                <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                  Fecha de ingreso
                </span>
                <input
                  type="date"
                  className={`${campoFin} num`}
                  value={form.fecha_ingreso}
                  onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                  Asignación
                </span>
                <select
                  className={campoFin}
                  value={form.asignacion}
                  onChange={(e) => setForm({ ...form, asignacion: e.target.value })}
                >
                  {ASIGNACIONES.map((a) => (
                    <option key={a.valor} value={a.valor} className="bg-[#16131F]">
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                  Tipo
                </span>
                <select
                  className={campoFin}
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoPersonal })}
                >
                  {TIPOS_PERSONAL.map((t) => (
                    <option key={t.valor} value={t.valor} className="bg-[#16131F]">
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              {(
                [
                  ["sueldo_base", "Sueldo base"],
                  ["liquido_liquidacion", "Líquido de liquidación o boleta"],
                  ["bonificacion_extra", "Bonificación extra"],
                  ["bono_variable_referencia", "Bono variable de referencia"],
                ] as const
              ).map(([campo, label]) => (
                <label key={campo} className="block">
                  <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                    {label}
                  </span>
                  <input
                    className={`${campoFin} num`}
                    value={form[campo]}
                    onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                  />
                  <span className="num mt-1 block text-[11px] text-muted-foreground">
                    {formatCLP(aMonto(form[campo]))}
                  </span>
                </label>
              ))}

              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                  Notas
                </span>
                <textarea
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-[var(--accent-store)]/60 focus:ring-2 focus:ring-[var(--accent-store)]/25"
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.revisar}
                  onChange={(e) => setForm({ ...form, revisar: e.target.checked })}
                  className="size-4 accent-[var(--accent-store)]"
                />
                Marcar con aviso “revisar”
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.estado === "activo"}
                  onChange={(e) =>
                    setForm({ ...form, estado: e.target.checked ? "activo" : "inactivo" })
                  }
                  className="size-4 accent-[var(--accent-store)]"
                />
                Activo
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void guardar()} disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
