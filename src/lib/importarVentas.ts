import * as XLSX from "xlsx";

import {
  detectarColumnas,
  normalizarGb,
  normalizarImei,
  normalizarMonto,
  normalizarTexto,
  type Tienda,
} from "@/lib/importar";
import { METODO_ETIQUETA, type MetodoPago } from "@/lib/pos";

export type CampoVenta =
  | "numero"
  | "fecha"
  | "tienda"
  | "cliente"
  | "telefono"
  | "correo"
  | "vendedor"
  | "modelo"
  | "imei"
  | "gb"
  | "color"
  | "costo"
  | "precio"
  | "metodo"
  | "pagador";

/* El orden importa: costo va antes que precio para que "precio compra" no se tome como precio de venta */
export const CAMPOS_VENTA: {
  campo: CampoVenta;
  label: string;
  obligatorio?: boolean;
  ayuda?: string;
  alias: string[];
}[] = [
  {
    campo: "numero",
    label: "N° de venta",
    ayuda: "Filas con el mismo número se juntan en una sola venta",
    alias: [
      "n venta",
      "numero venta",
      "n° venta",
      "nro venta",
      "id venta",
      "folio",
      "boleta",
      "comprobante",
    ],
  },
  { campo: "fecha", label: "Fecha", obligatorio: true, alias: ["fecha", "fecha venta", "dia"] },
  { campo: "tienda", label: "Tienda", alias: ["tienda", "sucursal", "local"] },
  { campo: "cliente", label: "Cliente", alias: ["cliente", "nombre cliente", "comprador"] },
  {
    campo: "telefono",
    label: "Teléfono cliente",
    alias: ["telefono", "celular", "fono", "whatsapp"],
  },
  { campo: "correo", label: "Correo cliente", alias: ["correo", "email", "mail"] },
  {
    campo: "vendedor",
    label: "Vendedor",
    alias: ["vendedor", "vendedora", "atendido por", "ejecutivo"],
  },
  {
    campo: "modelo",
    label: "Modelo / producto",
    obligatorio: true,
    alias: ["modelo", "producto", "equipo", "articulo", "descripcion"],
  },
  { campo: "imei", label: "IMEI", alias: ["imei", "imei1", "serie imei"] },
  { campo: "gb", label: "Capacidad (GB)", alias: ["gb", "capacidad", "almacenamiento"] },
  { campo: "color", label: "Color", alias: ["color"] },
  {
    campo: "costo",
    label: "Costo",
    alias: ["costo", "precio compra", "valor compra", "costo compra"],
  },
  {
    campo: "precio",
    label: "Precio de venta",
    obligatorio: true,
    alias: ["precio venta", "precio", "valor venta", "valor", "monto", "total"],
  },
  {
    campo: "metodo",
    label: "Método de pago",
    ayuda: "Si no está, todo queda como efectivo",
    alias: ["metodo de pago", "metodo", "forma de pago", "medio de pago", "tipo de pago"],
  },
  {
    campo: "pagador",
    label: "Nombre de quien pagó",
    alias: ["nombre pagador", "pagador", "titular", "quien pago", "nombre transferencia"],
  },
];

export type MapeoVenta = Partial<Record<CampoVenta, string>>;

export const detectarMapeoVentas = (encabezados: string[]) =>
  detectarColumnas(encabezados, CAMPOS_VENTA);

/* ---------------- normalizadores ---------------- */

const aISO = (y: number, m: number, d: number) => {
  const fecha = new Date(Date.UTC(y, m - 1, d));
  if (fecha.getUTCFullYear() !== y || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d)
    return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/** Fecha de Excel (celda de fecha, número de serie o texto día/mes/año) a AAAA-MM-DD. */
export const normalizarFecha = (valorCrudo: unknown): string | null => {
  if (valorCrudo instanceof Date && !Number.isNaN(valorCrudo.getTime())) {
    /* SheetJS a veces entrega 23:59:59 del día anterior */
    const f = new Date(valorCrudo.getTime() + 60_000);
    return aISO(f.getFullYear(), f.getMonth() + 1, f.getDate());
  }
  if (typeof valorCrudo === "number" && valorCrudo > 20000 && valorCrudo < 80000) {
    const p = XLSX.SSF.parse_date_code(valorCrudo);
    return p ? aISO(p.y, p.m, p.d) : null;
  }
  const texto = String(valorCrudo ?? "").trim();
  let m = texto.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return aISO(Number(m[1]), Number(m[2]), Number(m[3]));
  /* En Chile la fecha va día/mes/año */
  m = texto.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = Number(m[3]);
    return aISO(y < 100 ? 2000 + y : y, Number(m[2]), Number(m[1]));
  }
  return null;
};

export const normalizarMetodo = (
  valorCrudo: unknown,
): { metodo: MetodoPago | null; aviso?: string; error?: string } => {
  const texto = normalizarTexto(String(valorCrudo ?? ""));
  if (!texto) return { metodo: "efectivo", aviso: "Sin método de pago: queda como efectivo" };
  const hits = new Set<MetodoPago>();
  if (/efectivo|cash|contado/.test(texto)) hits.add("efectivo");
  if (/transf|deposito/.test(texto)) hits.add("transferencia");
  if (/credito|debito|tarjeta|redcompra|webpay|pos\b|^tc$|^td$/.test(texto)) hits.add("credito");
  if (/parte|permuta|canje|^pp$/.test(texto)) hits.add("partePago");
  if (hits.size > 1) {
    return {
      metodo: null,
      error: `Método combinado ("${String(valorCrudo).trim()}"): deja uno solo en la fila`,
    };
  }
  const [metodo] = [...hits];
  if (!metodo)
    return { metodo: null, error: `Método de pago "${String(valorCrudo).trim()}" no reconocido` };
  if (metodo === "credito" && /debito|redcompra/.test(texto)) {
    return { metodo, aviso: "Débito se registra como Crédito (tarjeta)" };
  }
  return { metodo };
};

/* ---------------- agrupar filas en ventas ---------------- */

export type ItemImportado = {
  linea: number;
  modelo: string;
  imei: string | null;
  gb: number | null;
  color: string | null;
  precio: number;
  costo: number | null;
  metodo: MetodoPago;
  pagador: string | null;
};

export type VentaImportada = {
  clave: string;
  lineas: number[];
  fecha: string | null;
  tienda_id: string | null;
  tiendaTexto: string;
  cliente: { nombre: string; telefono: string | null; correo: string | null } | null;
  vendedor: string | null;
  items: ItemImportado[];
  total: number;
  errores: string[];
  avisos: string[];
};

/** Hash corto y estable para reconocer una venta si se vuelve a subir el mismo archivo. */
const hash = (texto: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};

const hoyChile = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });

export function armarVentas(
  filas: Record<string, unknown>[],
  mapeo: MapeoVenta,
  opciones: { tiendas: Tienda[]; tiendaPorDefecto: string | null; puedeCostos: boolean },
): VentaImportada[] {
  const dato = (fila: Record<string, unknown>, campo: CampoVenta) => {
    const col = mapeo[campo];
    return col ? fila[col] : undefined;
  };
  const texto = (fila: Record<string, unknown>, campo: CampoVenta) =>
    String(dato(fila, campo) ?? "").trim();

  const hoy = hoyChile();
  const imeisVistos = new Map<string, number>();
  const grupos = new Map<string, VentaImportada>();
  const repetidas = new Map<string, number>();

  filas.forEach((fila, i) => {
    const vacia = Object.values(fila).every((v) => v == null || String(v).trim() === "");
    if (vacia) return;
    const linea = i + 2;
    const errores: string[] = [];
    const avisos: string[] = [];

    const fecha = normalizarFecha(dato(fila, "fecha"));
    if (!texto(fila, "fecha") && !(dato(fila, "fecha") instanceof Date)) errores.push("Sin fecha");
    else if (!fecha) errores.push(`Fecha "${texto(fila, "fecha")}" no reconocida`);
    else if (fecha > hoy) errores.push("La fecha está en el futuro");

    const tiendaTexto = mapeo.tienda ? texto(fila, "tienda") : "";
    let tiendaId: string | null = null;
    if (tiendaTexto) {
      const t = opciones.tiendas.find(
        (x) =>
          normalizarTexto(x.nombre) === normalizarTexto(tiendaTexto) ||
          normalizarTexto(x.nombre).includes(normalizarTexto(tiendaTexto)),
      );
      if (t) tiendaId = t.id;
      else errores.push(`La tienda "${tiendaTexto}" no existe en el sistema`);
    } else if (opciones.tiendaPorDefecto) {
      tiendaId = opciones.tiendaPorDefecto;
    } else {
      errores.push("Sin tienda");
    }

    const modelo = texto(fila, "modelo");
    if (!modelo) errores.push("Sin modelo o producto");

    let imei: string | null = null;
    if (texto(fila, "imei")) {
      const n = normalizarImei(dato(fila, "imei"));
      if (n.imei.length !== 15) errores.push(`IMEI de ${n.imei.length} dígitos (debe tener 15)`);
      else if (imeisVistos.has(n.imei))
        errores.push(`IMEI repetido en la fila ${imeisVistos.get(n.imei)}`);
      else {
        imei = n.imei;
        imeisVistos.set(n.imei, linea);
        if (/e\+?\d/i.test(texto(fila, "imei"))) {
          avisos.push("El IMEI venía en formato científico de Excel: revisa que esté completo");
        }
      }
    }

    const precio = normalizarMonto(dato(fila, "precio"));
    if (!precio.valor) errores.push("Sin precio de venta");

    const costo = opciones.puedeCostos ? normalizarMonto(dato(fila, "costo")).valor : null;
    const gb = normalizarGb(dato(fila, "gb"));

    const metodo = mapeo.metodo
      ? normalizarMetodo(dato(fila, "metodo"))
      : normalizarMetodo("efectivo");
    if (metodo.error) errores.push(metodo.error);
    if (metodo.aviso) avisos.push(metodo.aviso);

    const item: ItemImportado = {
      linea,
      modelo,
      imei,
      gb: gb.valor,
      color: texto(fila, "color") || null,
      precio: precio.valor ?? 0,
      costo,
      metodo: metodo.metodo ?? "efectivo",
      pagador: texto(fila, "pagador") || null,
    };

    const numero = texto(fila, "numero");
    const clienteNombre = texto(fila, "cliente");
    const contenido = [fecha, tiendaId, clienteNombre, modelo, imei, item.precio, item.metodo].join(
      "|",
    );
    /* grupo: filas que forman una misma venta; clave: marca que evita importarla dos veces */
    let grupo: string;
    let clave: string;
    if (numero) {
      grupo = `${tiendaId ?? tiendaTexto}:${numero}`;
      clave = `imp:${tiendaId ?? tiendaTexto}:${fecha}:${numero}`;
    } else {
      /* dos filas idénticas en el mismo archivo son dos ventas distintas */
      const base = hash(contenido);
      const n = (repetidas.get(base) ?? 0) + 1;
      repetidas.set(base, n);
      clave = `imp:${fecha}:${base}:${n}`;
      grupo = clave;
    }

    const existente = numero ? grupos.get(grupo) : undefined;
    if (existente) {
      if (fecha && existente.fecha && fecha !== existente.fecha) {
        errores.push(`Misma venta N° ${numero} con otra fecha (${existente.fecha})`);
      }
      existente.lineas.push(linea);
      existente.items.push(item);
      existente.total += item.precio;
      existente.errores.push(...errores.map((e) => `Fila ${linea}: ${e}`));
      existente.avisos.push(...avisos.map((a) => `Fila ${linea}: ${a}`));
      return;
    }

    grupos.set(grupo, {
      clave,
      lineas: [linea],
      fecha,
      tienda_id: tiendaId,
      tiendaTexto: tiendaTexto || opciones.tiendas.find((t) => t.id === tiendaId)?.nombre || "",
      cliente: clienteNombre
        ? {
            nombre: clienteNombre,
            telefono: texto(fila, "telefono") || null,
            correo: texto(fila, "correo") || null,
          }
        : null,
      vendedor: texto(fila, "vendedor") || null,
      items: [item],
      total: item.precio,
      errores,
      avisos,
    });
  });

  return [...grupos.values()];
}

/** Lo que recibe importar_ventas en la base de datos. */
export const paraEnviar = (v: VentaImportada) => {
  const pagos = new Map<
    string,
    { metodo: MetodoPago; monto: number; nombre_pagador: string | null }
  >();
  for (const it of v.items) {
    const k = `${it.metodo}|${it.pagador ?? ""}`;
    const p = pagos.get(k);
    if (p) p.monto += it.precio;
    else pagos.set(k, { metodo: it.metodo, monto: it.precio, nombre_pagador: it.pagador });
  }
  return {
    clave: v.clave,
    tienda_id: v.tienda_id,
    fecha: v.fecha,
    vendedor: v.vendedor,
    cliente: v.cliente,
    items: v.items.map((it) => ({
      imei: it.imei,
      modelo: it.modelo,
      gb: it.gb,
      color: it.color,
      precio: it.precio,
      costo: it.costo,
    })),
    pagos: [...pagos.values()],
  };
};

export const metodosDeVenta = (v: VentaImportada) =>
  [...new Set(v.items.map((it) => METODO_ETIQUETA[it.metodo]))].join(" + ");

export function csvVentasRechazadas(ventas: VentaImportada[]) {
  const enc = ["filas", "fecha", "tienda", "cliente", "productos", "total", "motivo"];
  const escapar = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cuerpo = ventas.map((v) =>
    [
      v.lineas.join(" "),
      v.fecha ?? "",
      v.tiendaTexto,
      v.cliente?.nombre ?? "",
      v.items.map((it) => [it.modelo, it.imei].filter(Boolean).join(" ")).join(" / "),
      v.total,
      v.errores.join(" · "),
    ]
      .map(escapar)
      .join(","),
  );
  return [enc.join(","), ...cuerpo].join("\n");
}
