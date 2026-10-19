import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { crearPersona } from "@/lib/personas.functions";
import { ROL_ETIQUETA, type AppRol } from "@/lib/nav";

const campo =
  "h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-[var(--accent-store)]/60";

const ROLES_TODOS: AppRol[] = [
  "vendedor",
  "jefe_tienda",
  "operaciones",
  "administracion",
  "direccion",
];

/** "Matías Valenzuela" → "matias.valenzuela" */
const sugerirUsuario = (nombre: string) =>
  nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(".")
    .slice(0, 30);

const pinAlAzar = () => String(Math.floor(100000 + Math.random() * 900000));

const vacio = { nombre: "", usuario: "", rol: "vendedor" as AppRol, tiendaId: "", pin: "" };

/** Personas que entran al sistema: agregar con su tienda, rol y un PIN inicial. */
export function PanelPersonas({ rolPropio }: { rolPropio: AppRol | null }) {
  const crear = useServerFn(crearPersona);
  const [form, setForm] = useState({ ...vacio, pin: pinAlAzar() });
  const [usuarioTocado, setUsuarioTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [creada, setCreada] = useState<{ nombre: string; usuario: string; pin: string } | null>(
    null,
  );

  const rolesPermitidos =
    rolPropio === "direccion"
      ? ROLES_TODOS
      : ROLES_TODOS.filter((r) => r !== "direccion" && r !== "administracion");

  const tiendas = useQuery({
    queryKey: ["tiendas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tiendas")
        .select("id, nombre, es_bodega")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const personas = useQuery({
    queryKey: ["personas-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usuarios")
        .select("id, nombre, usuario, rol, tienda_id, activo")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const nombreTienda = (id?: string | null) =>
    (tiendas.data ?? []).find((t) => t.id === id)?.nombre ?? "—";

  const porTienda = useMemo(() => {
    const grupos = new Map<string, NonNullable<typeof personas.data>>();
    (personas.data ?? []).forEach((p) => {
      const clave = p.tienda_id ? nombreTienda(p.tienda_id) : "Sin tienda fija";
      grupos.set(clave, [...(grupos.get(clave) ?? []), p]);
    });
    return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas.data, tiendas.data]);

  const necesitaTienda = form.rol === "vendedor" || form.rol === "jefe_tienda";

  const guardar = async () => {
    if (form.nombre.trim().length < 2) return void toast.error("Escribe el nombre de la persona");
    if (!/^[a-z0-9._]{3,30}$/.test(form.usuario))
      return void toast.error(
        "El usuario debe tener entre 3 y 30 letras o números, sin espacios ni tildes",
      );
    if (necesitaTienda && !form.tiendaId) return void toast.error("Elige la tienda");
    if (!/^\d{6}$/.test(form.pin)) return void toast.error("El PIN debe tener 6 dígitos");

    setGuardando(true);
    try {
      const r = await crear({
        data: {
          nombre: form.nombre.trim(),
          usuario: form.usuario,
          rol: form.rol,
          tiendaId: form.tiendaId || null,
          pin: form.pin,
        },
      });
      if (!r.ok) {
        toast.error("No se pudo agregar a la persona", { description: r.mensaje });
        return;
      }
      setCreada({ nombre: form.nombre.trim(), usuario: r.usuario, pin: form.pin });
      toast.success(`${form.nombre.trim()} ya puede entrar al sistema`);
      setForm((f) => ({ ...vacio, rol: f.rol, tiendaId: f.tiendaId, pin: pinAlAzar() }));
      setUsuarioTocado(false);
      void personas.refetch();
    } catch (e) {
      toast.error("No se pudo agregar a la persona", {
        description: e instanceof Error ? e.message : "Inténtalo otra vez.",
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="glass p-5">
      <h2 className="font-display text-lg">Personas</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Quienes entran al sistema. Al agregar a alguien se le da un PIN inicial que deberá cambiar
        la primera vez que entre.
      </p>

      <div className="mt-4 grid gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs text-muted-foreground lg:col-span-2">
          Nombre
          <input
            className={`${campo} mt-1`}
            value={form.nombre}
            placeholder="ej: Josefa Rojas"
            onChange={(e) => {
              const nombre = e.target.value;
              setForm((f) => ({
                ...f,
                nombre,
                usuario: usuarioTocado ? f.usuario : sugerirUsuario(nombre),
              }));
            }}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Usuario para entrar
          <input
            className={`${campo} mt-1`}
            value={form.usuario}
            onChange={(e) => {
              setUsuarioTocado(true);
              setForm((f) => ({
                ...f,
                usuario: e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9._]/g, "")
                  .slice(0, 30),
              }));
            }}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Rol
          <select
            className={`${campo} mt-1 bg-[#16131F]`}
            value={form.rol}
            onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value as AppRol }))}
          >
            {rolesPermitidos.map((r) => (
              <option key={r} value={r}>
                {ROL_ETIQUETA[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Tienda {necesitaTienda ? "" : "(opcional)"}
          <select
            className={`${campo} mt-1 bg-[#16131F]`}
            value={form.tiendaId}
            onChange={(e) => setForm((f) => ({ ...f, tiendaId: e.target.value }))}
          >
            <option value="">{necesitaTienda ? "Elige la tienda" : "Sin tienda fija"}</option>
            {(tiendas.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          PIN inicial
          <div className="mt-1 flex gap-2">
            <input
              className={`${campo} num tracking-[0.2em]`}
              inputMode="numeric"
              value={form.pin}
              onChange={(e) =>
                setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))
              }
            />
            <button
              type="button"
              className="shrink-0 rounded-lg border border-white/10 px-2 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
              onClick={() => setForm((f) => ({ ...f, pin: pinAlAzar() }))}
            >
              Otro
            </button>
          </div>
        </label>
        <div className="flex items-end sm:col-span-2 lg:col-span-4 lg:justify-end">
          <button
            type="button"
            disabled={guardando}
            onClick={() => void guardar()}
            className="accent-glow h-9 rounded-lg bg-[var(--accent-store)] px-4 text-sm font-medium text-[#0F0D17] transition-opacity duration-200 disabled:opacity-60"
          >
            {guardando ? "Agregando…" : "Agregar persona"}
          </button>
        </div>
      </div>

      {creada && (
        <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          <p>
            Datos para que <b>{creada.nombre}</b> entre por primera vez (anótalos: el PIN no se
            vuelve a mostrar):
          </p>
          <p className="num mt-1">
            Usuario <b>{creada.usuario}</b> · PIN <b>{creada.pin}</b>
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {porTienda.map(([tienda, gente]) => (
          <div key={tienda} className="solid-panel p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{tienda}</p>
            <ul className="mt-2 space-y-1.5">
              {gente.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className={p.activo ? "" : "text-muted-foreground line-through"}>
                    {p.nombre}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.usuario} · {ROL_ETIQUETA[p.rol as AppRol] ?? p.rol}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
