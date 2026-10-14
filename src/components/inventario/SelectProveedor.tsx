import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { CLAVE_PROVEEDORES, agregarProveedor, useProveedores } from "@/lib/proveedores";

const NUEVO = "__nuevo__";

/**
 * Proveedor elegido de la lista oficial, con "+ Agregar proveedor nuevo" al final. Así cada
 * proveedor se escribe siempre igual y después se puede buscar por él (por ejemplo, garantías).
 */
export function SelectProveedor({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  className: string;
}) {
  const queryClient = useQueryClient();
  const proveedores = useProveedores();
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const lista = proveedores.data ?? [];
  /* Un valor antiguo que no está en la lista (equipo viejo) se muestra igual para no perderlo */
  const opciones = value && !lista.includes(value) ? [value, ...lista] : lista;

  const agregar = async () => {
    if (nuevo.trim().length < 2) return;
    setGuardando(true);
    try {
      const nombre = await agregarProveedor(nuevo);
      await queryClient.invalidateQueries({ queryKey: CLAVE_PROVEEDORES });
      onChange(nombre);
      setAgregando(false);
      setNuevo("");
      toast.success(
        nombre.toLowerCase() === nuevo.trim().toLowerCase()
          ? `Proveedor "${nombre}" agregado`
          : `"${nuevo.trim()}" ya existía como "${nombre}": se eligió ese`,
      );
    } catch (e) {
      toast.error("No se pudo agregar el proveedor", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <select
        id={id}
        className={className}
        value={agregando ? NUEVO : value}
        onChange={(e) => {
          if (e.target.value === NUEVO) {
            setAgregando(true);
          } else {
            setAgregando(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">
          {proveedores.isLoading ? "Cargando proveedores…" : "Elige el proveedor"}
        </option>
        {opciones.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value={NUEVO}>+ Agregar proveedor nuevo</option>
      </select>
      {agregando && (
        <div className="mt-1.5 flex gap-2">
          <input
            autoFocus
            aria-label="Nombre del proveedor nuevo"
            className={className}
            placeholder="Nombre del proveedor nuevo"
            value={nuevo}
            maxLength={60}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void agregar();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void agregar()}
            disabled={guardando || nuevo.trim().length < 2}
            className="shrink-0 rounded-md border border-[var(--accent-store)]/50 px-3 text-sm text-foreground transition-colors duration-200 hover:bg-[var(--accent-store-soft)] disabled:opacity-50"
          >
            {guardando ? "…" : "Agregar"}
          </button>
        </div>
      )}
    </>
  );
}
