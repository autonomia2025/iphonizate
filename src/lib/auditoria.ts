import type { AppRol } from "@/lib/nav";

export const ROLES_AUDITORIA: AppRol[] = ["direccion", "administracion"];
export const puedeVerAuditoria = (rol?: AppRol | null) => !!rol && ROLES_AUDITORIA.includes(rol);

export const POR_PAGINA = 50;

type Op = "insert" | "update" | "delete";

/** Nombre legible de cada tabla, en singular. */
const TABLA_TEXTO: Record<string, { insert: string; update: string; delete: string }> = {
  equipos: { insert: "Ingresó un equipo", update: "Modificó un equipo", delete: "Eliminó un equipo" },
  ventas: { insert: "Registró una venta", update: "Modificó una venta", delete: "Eliminó una venta" },
  venta_items: {
    insert: "Agregó un ítem a una venta",
    update: "Modificó un ítem de venta",
    delete: "Quitó un ítem de una venta",
  },
  pagos: { insert: "Registró un pago", update: "Modificó un pago", delete: "Eliminó un pago" },
  reservas: { insert: "Creó una reserva", update: "Modificó una reserva", delete: "Eliminó una reserva" },
  reserva_items: {
    insert: "Agregó un ítem a una reserva",
    update: "Modificó un ítem de reserva",
    delete: "Quitó un ítem de una reserva",
  },
  garantias: { insert: "Ingresó una garantía", update: "Actualizó una garantía", delete: "Eliminó una garantía" },
  movimientos: { insert: "Trasladó un equipo", update: "Modificó un traslado", delete: "Eliminó un traslado" },
  servicios_equipo: {
    insert: "Creó un servicio técnico",
    update: "Actualizó un servicio técnico",
    delete: "Eliminó un servicio técnico",
  },
  tecnicos: { insert: "Creó un técnico", update: "Modificó un técnico", delete: "Eliminó un técnico" },
  accesorios: { insert: "Creó un accesorio", update: "Modificó un accesorio", delete: "Eliminó un accesorio" },
  accesorios_stock: {
    insert: "Cargó stock de accesorios",
    update: "Ajustó stock de accesorios",
    delete: "Eliminó stock de accesorios",
  },
  clientes: { insert: "Creó un cliente", update: "Modificó un cliente", delete: "Eliminó un cliente" },
  gastos: { insert: "Registró un gasto", update: "Modificó un gasto", delete: "Eliminó un gasto" },
  precios: { insert: "Creó un precio", update: "Actualizó un precio", delete: "Eliminó un precio" },
  usuarios: { insert: "Creó un usuario", update: "Modificó un usuario", delete: "Eliminó un usuario" },
  tareas: { insert: "Creó una tarea", update: "Actualizó una tarea", delete: "Eliminó una tarea" },
  metas: { insert: "Definió una meta", update: "Modificó una meta", delete: "Eliminó una meta" },
  cierres_caja: { insert: "Cerró la caja", update: "Modificó un cierre de caja", delete: "Eliminó un cierre de caja" },
  tiendas: { insert: "Creó una tienda", update: "Modificó una tienda", delete: "Eliminó una tienda" },
  equipos_historial: {
    insert: "Registró un evento del equipo",
    update: "Modificó un evento del equipo",
    delete: "Eliminó un evento del equipo",
  },
};

const OP_TEXTO: Record<Op, string> = {
  insert: "Creó",
  update: "Modificó",
  delete: "Eliminó",
};

/** "equipos.update" -> "Modificó un equipo" */
export const traducirAccion = (accion: string) => {
  const [tabla, op] = accion.split(".");
  const clave = (op ?? "").toLowerCase() as Op;
  const texto = tabla ? TABLA_TEXTO[tabla] : undefined;
  if (texto && texto[clave]) return texto[clave];
  const nombre = (tabla ?? accion).replace(/_/g, " ");
  return `${OP_TEXTO[clave] ?? "Cambió"} un registro en ${nombre}`;
};

export const TIPOS_ACCION = Object.keys(TABLA_TEXTO)
  .flatMap((tabla) => ["insert", "update", "delete"].map((op) => `${tabla}.${op}`))
  .sort();

export const CAMPO_ETIQUETA: Record<string, string> = {
  id: "ID",
  imei: "IMEI",
  serie: "Serie",
  modelo: "Modelo",
  gb: "GB",
  color: "Color",
  bateria: "Batería %",
  email_vinculado: "Email vinculado",
  categoria: "Categoría",
  proveedor: "Proveedor",
  lote: "Lote",
  estado: "Estado",
  ubicacion_id: "Ubicación",
  tienda_id: "Tienda",
  fecha_ingreso: "Fecha de ingreso",
  notas: "Notas",
  updated_at: "Última actualización",
  created_at: "Creado",
  total: "Total",
  con_boleta: "Con boleta",
  recargo_boleta: "Recargo boleta",
  revision: "Revisión",
  anulada: "Anulada",
  fecha_anulacion: "Fecha de anulación",
  cliente_id: "Cliente",
  vendedor_id: "Vendedor",
  reserva_id: "Reserva",
  fecha: "Fecha",
  metodo: "Método",
  monto: "Monto",
  nombre_pagador: "Nombre del pagador",
  abono: "Abono",
  saldo: "Saldo",
  destino_abono: "Destino del abono",
  cliente_nombre: "Cliente",
  cliente_telefono: "Teléfono",
  falla: "Falla",
  resolucion: "Resolución",
  imei_entregado: "IMEI entregado",
  diferencia: "Diferencia",
  recibio_id: "Recibió",
  desde_id: "Origen",
  hacia_id: "Destino",
  usuario_id: "Usuario",
  equipo_id: "Equipo",
  accesorio_id: "Accesorio",
  cantidad: "Cantidad",
  minimo: "Mínimo",
  precio: "Precio",
  nombre: "Nombre",
  descripcion: "Descripción",
  telefono: "Teléfono",
  correo: "Correo",
  instagram: "Instagram",
  tipo: "Tipo",
  tecnico_id: "Técnico",
  asignado_at: "Asignado",
  listo_at: "Listo",
  titulo: "Título",
  urgencia: "Urgencia",
  asignado_id: "Asignado a",
  hecha: "Hecha",
  created_by: "Creada por",
  periodo: "Período",
  equipos_objetivo: "Objetivo de equipos",
  ganancia_objetivo: "Objetivo de ganancia",
  activo: "Activo",
  rol: "Rol",
  usuario: "Usuario",
  debe_cambiar_pin: "Debe cambiar PIN",
  intentos_fallidos: "Intentos fallidos",
  bloqueado_hasta: "Bloqueado hasta",
  slug: "Slug",
  es_bodega: "Es bodega",
  color_acento: "Color de acento",
  evento: "Evento",
  fecha_cierre: "Fecha de cierre",
};

export const etiquetaCampo = (campo: string) =>
  CAMPO_ETIQUETA[campo] ?? campo.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const ES_FECHA = /^\d{4}-\d{2}-\d{2}T/;

export const valorLegible = (valor: unknown): string => {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (typeof valor === "string" && ES_FECHA.test(valor)) {
    return new Date(valor).toLocaleString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (Array.isArray(valor)) return valor.length ? valor.map(valorLegible).join(", ") : "—";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
};

export type Detalle = { antes?: Record<string, unknown>; despues?: Record<string, unknown> } | null;

export type FilaDiff = {
  campo: string;
  antes: unknown;
  despues: unknown;
  cambio: boolean;
};

export const diffDetalle = (detalle: Detalle): FilaDiff[] => {
  const antes = detalle?.antes ?? null;
  const despues = detalle?.despues ?? null;
  const campos = Array.from(
    new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})]),
  ).filter((c) => c !== "id");
  return campos
    .map((campo) => {
      const a = antes ? antes[campo] : undefined;
      const d = despues ? despues[campo] : undefined;
      return {
        campo,
        antes: a,
        despues: d,
        cambio: !!antes && !!despues && JSON.stringify(a ?? null) !== JSON.stringify(d ?? null),
      };
    })
    .sort((x, y) => Number(y.cambio) - Number(x.cambio) || x.campo.localeCompare(y.campo, "es-CL"));
};

/** Resumen corto y legible del cambio para la fila de la tabla. */
export const resumenDetalle = (accion: string, detalle: Detalle) => {
  const fila = detalle?.despues ?? detalle?.antes ?? null;
  const partes: string[] = [];
  if (fila) {
    for (const clave of ["imei", "modelo", "nombre", "titulo", "categoria", "total", "monto", "precio"]) {
      const valor = fila[clave];
      if (valor !== null && valor !== undefined && valor !== "") {
        partes.push(`${etiquetaCampo(clave)}: ${valorLegible(valor)}`);
      }
      if (partes.length === 2) break;
    }
  }
  if (accion.endsWith(".update")) {
    const cambios = diffDetalle(detalle).filter((c) => c.cambio);
    if (cambios.length) {
      partes.push(
        `Cambió ${cambios
          .slice(0, 3)
          .map((c) => etiquetaCampo(c.campo).toLowerCase())
          .join(", ")}${cambios.length > 3 ? ` y ${cambios.length - 3} más` : ""}`,
      );
    }
  }
  return partes.join(" · ") || "Sin detalle";
};
