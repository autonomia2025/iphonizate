/**
 * Comprobante de venta: lee la venta completa, dibuja el PDF y lo guarda en el
 * bucket privado `comprobantes`. Todo esto corre solo en el servidor.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { STORES } from "@/lib/stores";
import { METODO_ETIQUETA, type MetodoPago } from "@/lib/pos";

const BUCKET = "comprobantes";

const clp = (valor: number) =>
  `$${new Intl.NumberFormat("es-CL").format(Math.round(valor || 0))}`;

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const hexARgb = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

const acentoTienda = (slug?: string | null) =>
  hexARgb(STORES.find((s) => s.id === slug)?.hex ?? "#F59E0B");

/** Quita lo que WinAnsi no sabe dibujar (emojis, comillas raras). */
const limpio = (t: string) =>
  (t ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\xFF]/g, "");

export type DatosComprobante = {
  ventaId: string;
  numero: string;
  fecha: string;
  anulada: boolean;
  conBoleta: boolean;
  recargo: number;
  total: number;
  tienda: { nombre: string; slug: string | null };
  cliente: { nombre: string; telefono: string | null; correo: string | null } | null;
  vendedor: string | null;
  lineas: { descripcion: string; detalle: string; monto: number }[];
  pagos: { metodo: string; nombre: string | null; monto: number }[];
};

type Admin = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

/** Reúne todo lo que sale impreso en el comprobante. */
export async function armarDatos(
  supabaseAdmin: Admin,
  ventaId: string,
): Promise<DatosComprobante> {
  const { data: venta, error } = await supabaseAdmin
    .from("ventas")
    .select(
      "id, fecha, total, recargo_boleta, con_boleta, anulada, comprobante_numero, tienda_id, cliente_id, vendedor_id",
    )
    .eq("id", ventaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!venta) throw new Error("La venta no existe");

  const [tienda, cliente, vendedor, items, pagos] = await Promise.all([
    supabaseAdmin
      .from("tiendas")
      .select("nombre, slug")
      .eq("id", venta.tienda_id)
      .maybeSingle(),
    venta.cliente_id
      ? supabaseAdmin
          .from("clientes")
          .select("nombre, telefono, correo")
          .eq("id", venta.cliente_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    venta.vendedor_id
      ? supabaseAdmin
          .from("usuarios")
          .select("nombre")
          .eq("id", venta.vendedor_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin
      .from("venta_items")
      .select("precio, equipo_id, accesorio_id")
      .eq("venta_id", ventaId),
    supabaseAdmin
      .from("pagos")
      .select("metodo, monto, nombre_pagador")
      .eq("venta_id", ventaId),
  ]);

  const idsEquipos = (items.data ?? []).map((i) => i.equipo_id).filter(Boolean) as string[];
  const idsAcc = (items.data ?? []).map((i) => i.accesorio_id).filter(Boolean) as string[];

  const equipos = idsEquipos.length
    ? (
        await supabaseAdmin
          .from("equipos")
          .select("id, imei, modelo, gb, color")
          .in("id", idsEquipos)
      ).data ?? []
    : [];
  const accesorios = idsAcc.length
    ? (await supabaseAdmin.from("accesorios").select("id, nombre, modelo").in("id", idsAcc))
        .data ?? []
    : [];

  const lineas = (items.data ?? []).map((i) => {
    if (i.equipo_id) {
      const e = equipos.find((x) => x.id === i.equipo_id);
      return {
        descripcion: e ? `${e.modelo}${e.gb ? ` ${e.gb} GB` : ""}` : "Equipo",
        detalle: e ? `${e.color ?? "Color s/i"} · IMEI ${e.imei}` : "",
        monto: Number(i.precio ?? 0),
      };
    }
    const a = accesorios.find((x) => x.id === i.accesorio_id);
    return {
      descripcion: a?.nombre ?? "Accesorio",
      detalle: a?.modelo ?? "",
      monto: Number(i.precio ?? 0),
    };
  });

  return {
    ventaId,
    numero: venta.comprobante_numero ?? "",
    fecha: venta.fecha,
    anulada: !!venta.anulada,
    conBoleta: !!venta.con_boleta,
    recargo: Number(venta.recargo_boleta ?? 0),
    total: Number(venta.total ?? 0),
    tienda: {
      nombre: tienda.data?.nombre ?? "iPhonizate",
      slug: tienda.data?.slug ?? null,
    },
    cliente: cliente.data
      ? {
          nombre: cliente.data.nombre,
          telefono: cliente.data.telefono ?? null,
          correo: cliente.data.correo ?? null,
        }
      : null,
    vendedor: vendedor.data?.nombre ?? null,
    lineas,
    pagos: (pagos.data ?? []).map((p) => ({
      metodo: METODO_ETIQUETA[p.metodo as MetodoPago] ?? String(p.metodo),
      nombre: p.nombre_pagador ?? null,
      monto: Number(p.monto ?? 0),
    })),
  };
}

/** Dibuja el comprobante en una carta y devuelve los bytes del PDF. */
export async function dibujarPdf(d: DatosComprobante): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Comprobante ${d.numero}`);
  doc.setAuthor(d.tienda.nombre);

  const pagina = doc.addPage([595.28, 841.89]); // A4
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);

  const acento = acentoTienda(d.tienda.slug);
  const tinta = rgb(0.09, 0.09, 0.13);
  const gris = rgb(0.45, 0.45, 0.5);
  const linea = rgb(0.87, 0.87, 0.9);

  const M = 48;
  const ancho = pagina.getWidth();
  const derecha = ancho - M;
  let y = pagina.getHeight() - M;

  const texto = (
    p: PDFPage,
    t: string,
    x: number,
    yy: number,
    size: number,
    font: PDFFont,
    color = tinta,
  ) => p.drawText(limpio(t), { x, y: yy, size, font, color });

  const aDerecha = (t: string, yy: number, size: number, font: PDFFont, color = tinta) => {
    const s = limpio(t);
    texto(pagina, s, derecha - font.widthOfTextAtSize(s, size), yy, size, font, color);
  };

  /* Encabezado */
  pagina.drawRectangle({ x: 0, y: y - 12, width: ancho, height: 60 + 12, color: acento });
  texto(pagina, d.tienda.nombre, M, y + 18, 20, bold, rgb(1, 1, 1));
  texto(pagina, "Comprobante de venta", M, y + 2, 10, normal, rgb(1, 1, 1));
  {
    const n = limpio(`N° ${d.numero}`);
    texto(pagina, n, derecha - bold.widthOfTextAtSize(n, 13), y + 18, 13, bold, rgb(1, 1, 1));
    const f = limpio(fechaLarga(d.fecha));
    texto(pagina, f, derecha - normal.widthOfTextAtSize(f, 9), y + 3, 9, normal, rgb(1, 1, 1));
  }
  y -= 56;

  if (d.anulada) {
    texto(pagina, "VENTA ANULADA", M, y, 14, bold, rgb(0.8, 0.15, 0.15));
    y -= 24;
  }

  /* Cliente */
  texto(pagina, "CLIENTE", M, y, 8, bold, gris);
  y -= 15;
  texto(pagina, d.cliente?.nombre ?? "Sin cliente asignado", M, y, 12, bold);
  y -= 14;
  const contacto = [d.cliente?.telefono, d.cliente?.correo].filter(Boolean).join("  ·  ");
  if (contacto) {
    texto(pagina, contacto, M, y, 9, normal, gris);
    y -= 14;
  }
  if (d.vendedor) {
    texto(pagina, `Atendido por ${d.vendedor}`, M, y, 9, normal, gris);
    y -= 14;
  }

  y -= 10;
  pagina.drawLine({ start: { x: M, y }, end: { x: derecha, y }, thickness: 1, color: linea });
  y -= 22;

  /* Detalle */
  texto(pagina, "DETALLE", M, y, 8, bold, gris);
  aDerecha("MONTO", y, 8, bold, gris);
  y -= 18;

  for (const l of d.lineas) {
    texto(pagina, l.descripcion, M, y, 11, bold);
    aDerecha(clp(l.monto), y, 11, normal);
    y -= 13;
    if (l.detalle) {
      texto(pagina, l.detalle, M, y, 8.5, normal, gris);
      y -= 13;
    }
    y -= 5;
    if (y < 200) break;
  }

  y -= 6;
  pagina.drawLine({ start: { x: M, y }, end: { x: derecha, y }, thickness: 1, color: linea });
  y -= 20;

  if (d.conBoleta && d.recargo > 0) {
    texto(pagina, "Recargo boleta (9%)", M, y, 10, normal, gris);
    aDerecha(clp(d.recargo), y, 10, normal, gris);
    y -= 20;
  }

  texto(pagina, "TOTAL", M, y, 13, bold);
  aDerecha(clp(d.total), y, 18, bold, acento);
  y -= 34;

  /* Pagos */
  texto(pagina, "FORMAS DE PAGO", M, y, 8, bold, gris);
  y -= 16;
  for (const p of d.pagos) {
    texto(pagina, p.nombre ? `${p.metodo} · ${p.nombre}` : p.metodo, M, y, 10, normal);
    aDerecha(clp(p.monto), y, 10, normal);
    y -= 16;
  }

  /* Pie */
  const pie = 74;
  pagina.drawLine({
    start: { x: M, y: pie + 30 },
    end: { x: derecha, y: pie + 30 },
    thickness: 1,
    color: linea,
  });
  texto(
    pagina,
    "Garantía de 3 meses por fallas de fábrica. Presenta este comprobante en la tienda.",
    M,
    pie + 14,
    8.5,
    normal,
    gris,
  );
  texto(pagina, `${d.tienda.nombre} · iPhonizate OS`, M, pie, 8.5, normal, gris);

  return await doc.save();
}

/**
 * Genera (o regenera) el comprobante de una venta, lo guarda en el bucket y
 * deja la ruta y el número en la venta. Devuelve la ruta y un enlace firmado.
 */
export async function generarYGuardar(ventaId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: previa } = await supabaseAdmin
    .from("ventas")
    .select("comprobante_numero")
    .eq("id", ventaId)
    .maybeSingle();

  let numero = previa?.comprobante_numero ?? null;
  if (!numero) {
    const { data: seq } = await supabaseAdmin.rpc("siguiente_comprobante");
    numero = (seq as unknown as string) ?? `V-${Date.now()}`;
  }

  const datos = await armarDatos(supabaseAdmin, ventaId);
  datos.numero = numero;

  const bytes = await dibujarPdf(datos);
  const ruta = `${ventaId}/${numero}.pdf`;

  const { error: subida } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(ruta, bytes, { contentType: "application/pdf", upsert: true });
  if (subida) throw new Error(subida.message);

  await supabaseAdmin
    .from("ventas")
    .update({ comprobante_numero: numero, comprobante_ruta: ruta })
    .eq("id", ventaId);

  const url = await enlaceFirmado(ruta);
  return { numero, ruta, url, datos };
}

/** Enlace de descarga temporal (30 días). */
export async function enlaceFirmado(ruta: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(ruta, 60 * 60 * 24 * 30);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
