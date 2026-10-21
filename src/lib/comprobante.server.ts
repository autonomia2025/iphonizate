/**
 * Comprobante de venta: lee la venta completa, dibuja el PDF y lo guarda en el
 * bucket privado `comprobantes`. Todo esto corre solo en el servidor.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import {
  CONTACTO_TIENDA,
  ENVIO_REGIONES,
  GARANTIA_CUBRE,
  GARANTIA_NO_CUBRE,
  HORARIO_ATENCION,
  STORES,
  garantiaMeses,
  garantiaTerminos,
} from "@/lib/stores";
import { CATEGORIA_ETIQUETA } from "@/lib/inventario";
import { METODO_ETIQUETA, type MetodoPago } from "@/lib/pos";

const BUCKET = "comprobantes";

const clp = (valor: number) =>
  `$${new Intl.NumberFormat("es-CL").format(Math.round(valor || 0))}`;

const hexARgb = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

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
  cliente: {
    nombre: string;
    telefono: string | null;
    correo: string | null;
    instagram: string | null;
  } | null;
  vendedor: string | null;
  lineas: { descripcion: string; detalle: string; monto: number }[];
  equipos: { modelo: string; condicion: string | null; imei: string; precio: number }[];
  accesorios: { nombre: string; precio: number }[];
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
          .select("nombre, telefono, correo, instagram")
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
          .select("id, imei, modelo, gb, color, categoria")
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
          instagram: cliente.data.instagram ?? null,
        }
      : null,
    vendedor: vendedor.data?.nombre ?? null,
    lineas,
    equipos: (items.data ?? [])
      .filter((i) => i.equipo_id)
      .map((i) => {
        const e = equipos.find((x) => x.id === i.equipo_id);
        return {
          modelo: e
            ? [e.modelo, e.gb ? `${e.gb} GB` : null, e.color].filter(Boolean).join(" ")
            : "Equipo",
          condicion: e?.categoria
            ? e.categoria === "sellado"
              ? "Nuevo sellado"
              : (CATEGORIA_ETIQUETA[e.categoria as keyof typeof CATEGORIA_ETIQUETA] ?? e.categoria)
            : null,
          imei: e?.imei ?? "",
          precio: Number(i.precio ?? 0),
        };
      }),
    accesorios: (items.data ?? [])
      .filter((i) => i.accesorio_id)
      .map((i) => ({
        nombre: accesorios.find((x) => x.id === i.accesorio_id)?.nombre ?? "Accesorio",
        precio: Number(i.precio ?? 0),
      })),
    pagos: (pagos.data ?? []).map((p) => ({
      metodo: METODO_ETIQUETA[p.metodo as MetodoPago] ?? String(p.metodo),
      nombre: p.nombre_pagador ?? null,
      monto: Number(p.monto ?? 0),
    })),
  };
}

/* ---------------------------------------------------------------- Fechas */

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

type Dia = { y: number; m: number; d: number };

/** Día calendario en Chile de una fecha ISO. */
const diaChile = (iso: string): Dia => {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(iso))
    .split("-")
    .map(Number);
  return { y: y!, m: m!, d: d! };
};

const diaTexto = ({ y, m, d }: Dia) => `${d} de ${MESES[m - 1]} de ${y}`;

/** Último día cubierto: misma fecha `meses` después, menos un día. */
const finGarantia = ({ y, m, d }: Dia, meses: number): Dia => {
  const f = new Date(Date.UTC(y, m - 1 + meses, d));
  f.setUTCDate(f.getUTCDate() - 1);
  return { y: f.getUTCFullYear(), m: f.getUTCMonth() + 1, d: f.getUTCDate() };
};

/** Mezcla un color con blanco: t=0 el color, t=1 blanco. */
const aclarar = (hex: string, t: number) => {
  const n = parseInt(hex.replace("#", ""), 16);
  const c = (v: number) => (v + (255 - v) * t) / 255;
  return rgb(c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255));
};

/** Comprobante de garantía en una hoja A4, con el color y los meses de garantía de la tienda. */
export async function dibujarPdf(d: DatosComprobante): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  /* El número de venta no se muestra al cliente: solo se guarda en el sistema */
  doc.setTitle(`Comprobante de garantía · ${d.tienda.nombre}`);
  doc.setAuthor(d.tienda.nombre);

  const pagina = doc.addPage([595.28, 841.89]); // A4
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);

  const hex = STORES.find((s) => s.id === d.tienda.slug)?.hex ?? "#F59E0B";
  const acento = hexARgb(hex);
  const acentoTenue = aclarar(hex, 0.93);
  const acentoBorde = aclarar(hex, 0.55);
  const acentoTexto = aclarar(hex, 0.7);
  const tinta = rgb(0.05, 0.05, 0.05);
  const gris = rgb(0.42, 0.4, 0.47);
  const grisClaro = rgb(0.61, 0.64, 0.69);
  const linea = rgb(0.89, 0.88, 0.95);
  const fondoCampo = rgb(0.98, 0.98, 0.995);
  const blanco = rgb(1, 1, 1);

  const meses = garantiaMeses(d.tienda.slug);
  const contacto = CONTACTO_TIENDA[d.tienda.slug ?? ""] ?? {};
  const desde = diaChile(d.fecha);
  const hasta = finGarantia(desde, meses);

  const W = pagina.getWidth();
  const H = pagina.getHeight();
  const M = 30;
  const anchoUtil = W - 2 * M;
  const gap = 8;
  const col = (anchoUtil - gap) / 2;

  const texto = (t: string, x: number, y: number, size: number, font: PDFFont, color = tinta) =>
    pagina.drawText(limpio(t), { x, y, size, font, color });
  const ancho = (t: string, size: number, font: PDFFont) => font.widthOfTextAtSize(limpio(t), size);
  const aDerecha = (t: string, xDer: number, y: number, size: number, font: PDFFont, color = tinta) =>
    texto(t, xDer - ancho(t, size, font), y, size, font, color);
  const centrado = (t: string, xCentro: number, y: number, size: number, font: PDFFont, color = tinta) =>
    texto(t, xCentro - ancho(t, size, font) / 2, y, size, font, color);

  /** Parte un texto en líneas que caben en `max` puntos. */
  const envolver = (t: string, font: PDFFont, size: number, max: number) => {
    const out: string[] = [];
    let actual = "";
    for (const p of limpio(t).split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${p}` : p;
      if (actual && font.widthOfTextAtSize(prueba, size) > max) {
        out.push(actual);
        actual = p;
      } else actual = prueba;
    }
    if (actual) out.push(actual);
    return out;
  };

  /** Corta con "..." lo que no cabe en una sola línea. */
  const recortar = (t: string, size: number, font: PDFFont, max: number) => {
    let s = limpio(t);
    if (font.widthOfTextAtSize(s, size) <= max) return s;
    while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, size) > max) s = s.slice(0, -1);
    return `${s.trimEnd()}...`;
  };

  /* ---------------- Encabezado ---------------- */
  const altoCabeza = 72;
  pagina.drawRectangle({ x: 0, y: H - altoCabeza, width: W, height: altoCabeza, color: acento });
  texto(d.tienda.nombre, M, H - 36, 22, bold, blanco);
  if (contacto.lema) texto(contacto.lema, M, H - 52, 9, normal, acentoTexto);
  aDerecha("Comprobante de garantía", W - M, H - 30, 11.5, bold, blanco);
  const contactoCabeza = [contacto.whatsapp && `WhatsApp ${contacto.whatsapp}`, contacto.correo]
    .filter(Boolean)
    .join("  ·  ");
  if (contactoCabeza) aDerecha(contactoCabeza, W - M, H - 44, 8.5, normal, acentoTexto);

  /* ---------------- Franja de vigencia ---------------- */
  const altoFranja = 36;
  const yFranja = H - altoCabeza - altoFranja;
  pagina.drawRectangle({ x: 0, y: yFranja, width: W, height: altoFranja, color: acentoTenue });
  pagina.drawLine({ start: { x: 0, y: yFranja }, end: { x: W, y: yFranja }, thickness: 0.8, color: linea });

  const sello = `Garantía activa · ${meses} meses`;
  const anchoSello = ancho(sello, 9.5, bold) + 22;
  const ySello = yFranja + altoFranja / 2;
  const r = 9.5;
  pagina.drawCircle({ x: M + r, y: ySello, size: r, color: acento });
  pagina.drawCircle({ x: M + anchoSello - r, y: ySello, size: r, color: acento });
  pagina.drawRectangle({ x: M + r, y: ySello - r, width: anchoSello - 2 * r, height: 2 * r, color: acento });
  texto(sello, M + 11, ySello - 3.3, 9.5, bold, blanco);

  let x = M + anchoSello + 14;
  for (const [t, f] of [
    ["Desde ", normal],
    [diaTexto(desde), bold],
    [" hasta ", normal],
    [diaTexto(hasta), bold],
  ] as const) {
    texto(t, x, ySello - 3.3, 9.5, f, f === bold ? tinta : gris);
    x += ancho(t, 9.5, f);
  }
  if (d.anulada) aDerecha("VENTA ANULADA", W - M, ySello - 3.5, 11, bold, rgb(0.75, 0.12, 0.12));

  let y = yFranja - 20;

  /* ---------------- Piezas ---------------- */
  const seccion = (titulo: string) => {
    texto(titulo, M, y, 10, bold, acento);
    pagina.drawLine({ start: { x: M, y: y - 6 }, end: { x: W - M, y: y - 6 }, thickness: 1.4, color: linea });
    y -= 20;
  };

  const altoCampo = 29;
  const campo = (cx: number, w: number, etiqueta: string, valor: string, destacado = false) => {
    pagina.drawRectangle({
      x: cx,
      y: y - altoCampo,
      width: w,
      height: altoCampo,
      color: destacado ? acentoTenue : fondoCampo,
      borderColor: destacado ? acentoBorde : linea,
      borderWidth: 0.8,
    });
    texto(etiqueta, cx + 9, y - 10, 6.8, normal, grisClaro);
    texto(recortar(valor || "-", 10.5, bold, w - 18), cx + 9, y - 23, 10.5, bold);
  };
  const fila = (izq: [string, string, boolean?], der?: [string, string, boolean?]) => {
    if (der) {
      campo(M, col, izq[0], izq[1], izq[2]);
      campo(M + col + gap, col, der[0], der[1], der[2]);
    } else campo(M, anchoUtil, izq[0], izq[1], izq[2]);
    y -= altoCampo + 6;
  };

  const tamLista = 8.3;
  const altoLinea = 10.5;
  const medirCaja = (items: string[], w: number) =>
    items.reduce((h, it) => h + envolver(it, normal, tamLista, w - 30).length * altoLinea + 3, 26);
  const caja = (cx: number, w: number, h: number, titulo: string, items: string[], cubre: boolean) => {
    pagina.drawRectangle({
      x: cx,
      y: y - h,
      width: w,
      height: h,
      color: cubre ? acentoTenue : rgb(0.98, 0.98, 0.98),
      borderColor: cubre ? acentoBorde : linea,
      borderWidth: 0.8,
    });
    texto(titulo, cx + 11, y - 15, 8.8, bold, cubre ? acento : gris);
    let yy = y - 29;
    for (const it of items) {
      pagina.drawCircle({ x: cx + 15, y: yy + 2.6, size: 1.4, color: cubre ? acento : gris });
      for (const l of envolver(it, normal, tamLista, w - 30)) {
        texto(l, cx + 21, yy, tamLista, normal, tinta);
        yy -= altoLinea;
      }
      yy -= 3;
    }
  };
  const parCajas = (
    a: { titulo: string; items: string[]; cubre: boolean },
    b: { titulo: string; items: string[]; cubre: boolean },
  ) => {
    const h = Math.max(medirCaja(a.items, col), medirCaja(b.items, col));
    caja(M, col, h, a.titulo, a.items, a.cubre);
    caja(M + col + gap, col, h, b.titulo, b.items, b.cubre);
    y -= h + 14;
  };

  /* ---------------- Cliente ---------------- */
  seccion("Cliente");
  const c = d.cliente;
  const ig = c?.instagram ? `@${c.instagram.replace(/^@+/, "")}` : null;
  if (ig) fila(["Nombre completo", c?.nombre ?? "Sin cliente registrado"], ["Instagram", ig]);
  else fila(["Nombre completo", c?.nombre ?? "Sin cliente registrado"]);
  if (c?.correo) fila(["Teléfono", c?.telefono ?? "-"], ["Correo", c.correo]);
  else fila(["Teléfono", c?.telefono ?? "-"]);
  y -= 6;

  /* ---------------- Equipo ---------------- */
  seccion(d.equipos.length > 1 ? "Equipos" : "Equipo");
  if (d.equipos.length === 1) {
    const e = d.equipos[0]!;
    fila(["Modelo", e.modelo, true], ["Condición", e.condicion ?? "-", true]);
    fila(["IMEI", e.imei], ["Precio de venta", clp(e.precio)]);
  } else {
    d.equipos.forEach((e, i) => {
      fila(
        [`Equipo ${i + 1} · ${e.condicion ?? ""}`, e.modelo, true],
        ["IMEI · precio", `${e.imei} · ${clp(e.precio)}`],
      );
    });
  }
  if (d.accesorios.length) {
    fila(["Accesorios", d.accesorios.map((a) => `${a.nombre} (${clp(a.precio)})`).join(" · ")]);
  }
  /* Pago desglosado: cada método con su monto, y el total pagado al lado */
  const nombreMetodo = (m: string) => (m === "Crédito" ? "Tarjeta de crédito" : m);
  const pagos = d.pagos.length ? d.pagos : [{ metodo: "Sin registrar", nombre: null, monto: d.total }];
  const altoPago = Math.max(altoCampo, 17 + pagos.length * 13);
  pagina.drawRectangle({
    x: M,
    y: y - altoPago,
    width: col,
    height: altoPago,
    color: fondoCampo,
    borderColor: linea,
    borderWidth: 0.8,
  });
  texto(pagos.length > 1 ? "Forma de pago (desglose)" : "Forma de pago", M + 9, y - 10, 6.8, normal, grisClaro);
  pagos.forEach((pg, i) => {
    const yy = y - 23 - i * 13;
    texto(recortar(nombreMetodo(pg.metodo), 10, bold, col - 100), M + 9, yy, 10, bold);
    aDerecha(clp(pg.monto), M + col - 9, yy, 10, bold);
  });
  pagina.drawRectangle({
    x: M + col + gap,
    y: y - altoPago,
    width: col,
    height: altoPago,
    color: acentoTenue,
    borderColor: acentoBorde,
    borderWidth: 0.8,
  });
  texto(
    d.conBoleta && d.recargo > 0 ? "Total pagado (incluye boleta)" : "Total pagado",
    M + col + gap + 9,
    y - 10,
    6.8,
    normal,
    grisClaro,
  );
  texto(clp(d.total), M + col + gap + 9, y - 25, 14, bold);
  y -= altoPago + 6;
  y -= 6;

  /* ---------------- Cobertura ---------------- */
  seccion("Qué cubre esta garantía");
  parCajas(
    { titulo: `Cubierto durante ${meses} meses`, items: GARANTIA_CUBRE, cubre: true },
    { titulo: "Fuera de cobertura", items: GARANTIA_NO_CUBRE, cubre: false },
  );

  seccion("Cómo hacerla efectiva");
  parCajas(
    {
      titulo: "En tienda",
      items: [
        "Acércate a la tienda con este comprobante.",
        HORARIO_ATENCION,
        "La revisión toma al menos un día hábil, salvo que se resuelva en el momento.",
      ],
      cubre: true,
    },
    {
      titulo: "Desde otra ciudad",
      items: [
        "Escríbenos primero por WhatsApp para coordinar el envío.",
        `Despacha por pagar vía ${contacto.envio ?? ENVIO_REGIONES}.`,
        "La tienda cubre el flete de vuelta una vez revisado el equipo.",
      ],
      cubre: true,
    },
  );

  /* ---------------- Términos ---------------- */
  seccion("Términos y condiciones");
  const consultas = [contacto.whatsapp && `WhatsApp ${contacto.whatsapp}`, contacto.correo, contacto.web]
    .filter(Boolean)
    .join(" · ");
  const terminos = [...garantiaTerminos(meses), ...(consultas ? [`Consultas: ${consultas}`] : [])];
  const tamTerm = 6.9;
  const altoTerm = 8.6;
  const lineasTerm = terminos.map((t, i) => envolver(`${i + 1}. ${t}`, normal, tamTerm, col - 4));
  const mitad = Math.ceil(terminos.length / 2);
  const altoCol = (desdeI: number, hastaI: number) =>
    lineasTerm.slice(desdeI, hastaI).reduce((h, ls) => h + ls.length * altoTerm + 3, 0);
  const altoTerminos = Math.max(altoCol(0, mitad), altoCol(mitad, terminos.length));
  [lineasTerm.slice(0, mitad), lineasTerm.slice(mitad)].forEach((grupo, ci) => {
    let yy = y;
    const cx = M + ci * (col + gap);
    for (const ls of grupo) {
      for (const l of ls) {
        texto(l, cx, yy, tamTerm, normal, gris);
        yy -= altoTerm;
      }
      yy -= 3;
    }
  });
  y -= altoTerminos + 26;

  /* ---------------- Firmas ---------------- */
  const yFirma = Math.max(y, 72);
  [
    [d.vendedor ?? "", `Vendedor · ${d.tienda.nombre}`],
    [c?.nombre ?? "", "Firma del cliente"],
  ].forEach(([nombre, rotulo], i) => {
    const cx = M + i * (col + gap);
    pagina.drawLine({ start: { x: cx + 10, y: yFirma }, end: { x: cx + col - 10, y: yFirma }, thickness: 0.8, color: grisClaro });
    if (nombre) centrado(nombre, cx + col / 2, yFirma - 12, 9.5, bold);
    centrado(rotulo!, cx + col / 2, yFirma - 23, 7.5, normal, gris);
  });

  /* ---------------- Pie ---------------- */
  const altoPie = 32;
  pagina.drawRectangle({ x: 0, y: 0, width: W, height: altoPie, color: tinta });
  const pie = [contacto.whatsapp && `WhatsApp ${contacto.whatsapp}`, contacto.correo, contacto.web, contacto.instagram]
    .filter(Boolean)
    .join("  ·  ");
  texto(pie || d.tienda.nombre, M, 13, 8, normal, blanco);
  aDerecha(`Emitido ${diaTexto(desde)}`, W - M, 18, 7.5, normal, grisClaro);
  aDerecha("Documento generado electrónicamente", W - M, 8, 7.5, normal, grisClaro);

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
