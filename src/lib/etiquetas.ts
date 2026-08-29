/* Etiquetas con código de barras Code 128 para Brother QL-800 (impresión desde el navegador). */

const PATRONES = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112",
];

const INICIO_B = 104;
const PARADA = 106;

/** Barras del Code 128B: ancho en módulos, alternando barra/espacio desde barra. */
export function code128b(texto: string): number[] {
  const codigos: number[] = [INICIO_B];
  let suma = INICIO_B;
  [...texto].forEach((ch, i) => {
    const punto = ch.charCodeAt(0);
    const valor = punto >= 32 && punto <= 126 ? punto - 32 : 0;
    codigos.push(valor);
    suma += valor * (i + 1);
  });
  codigos.push(suma % 103);
  codigos.push(PARADA);
  return codigos.flatMap((c) => [...PATRONES[c]!].map(Number));
}

/** Zona muda mínima exigida por el estándar (10 módulos a cada lado). */
export const QUIET_ZONE_MODULOS = 10;
/** Ancho de módulo mínimo legible por pistola (mm). */
export const MODULO_MINIMO_MM = 0.33;

export type MedidaEtiqueta = { ancho: number; alto: number };

export const TAMANOS = [
  { id: "dk-11201", label: "29 × 90 mm · DK-11201", ancho: 90, alto: 29 },
  { id: "dk-11204", label: "17 × 54 mm · DK-11204", ancho: 54, alto: 17 },
  { id: "dk-11208", label: "38 × 90 mm · DK-11208", ancho: 90, alto: 38 },
  { id: "dk-11209", label: "29 × 62 mm · DK-11209", ancho: 62, alto: 29 },
  { id: "dk-22205", label: "62 × 50 mm · DK-22205 (continua)", ancho: 62, alto: 50 },
] as const;

export const TAMANO_POR_DEFECTO = TAMANOS[0];
const CLAVE_LS = "riff.etiquetas.tamano";

export function leerTamanoGuardado(): MedidaEtiqueta {
  if (typeof window === "undefined") return { ancho: TAMANO_POR_DEFECTO.ancho, alto: TAMANO_POR_DEFECTO.alto };
  try {
    const raw = window.localStorage.getItem(CLAVE_LS);
    if (raw) {
      const v = JSON.parse(raw) as MedidaEtiqueta;
      if (v?.ancho > 10 && v?.alto > 8) return { ancho: v.ancho, alto: v.alto };
    }
  } catch {
    /* sin preferencia guardada */
  }
  return { ancho: TAMANO_POR_DEFECTO.ancho, alto: TAMANO_POR_DEFECTO.alto };
}

export function guardarTamano(medida: MedidaEtiqueta) {
  try {
    window.localStorage.setItem(CLAVE_LS, JSON.stringify(medida));
  } catch {
    /* almacenamiento no disponible */
  }
}

export type EquipoEtiqueta = {
  imei: string;
  modelo?: string | null;
  gb?: number | null;
  color?: string | null;
  /** Etapa del flujo (ingreso, traslado, técnico…) que se imprime bajo el IMEI. */
  etapa?: string | null;
};

const fechaCorta = () =>
  new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit" });

/** Ancho de módulo real: se reparte el ancho útil y nunca baja del mínimo legible. */
export function anchoModulo(medida: MedidaEtiqueta, modulos: number) {
  const util = medida.ancho - 6; // 3 mm de margen físico por lado
  const calculado = util / (modulos + QUIET_ZONE_MODULOS * 2);
  return Math.max(MODULO_MINIMO_MM, Number(calculado.toFixed(4)));
}

export function svgCodigoBarras(imei: string, medida: MedidaEtiqueta) {
  const barras = code128b(imei);
  const modulos = barras.reduce((a, b) => a + b, 0);
  const modulo = anchoModulo(medida, modulos);
  const anchoTotal = (modulos + QUIET_ZONE_MODULOS * 2) * modulo;
  const altoBarras = Math.max(8, Math.min(medida.alto * 0.5, 16));

  let x = QUIET_ZONE_MODULOS * modulo;
  const rects: string[] = [];
  barras.forEach((ancho, i) => {
    const w = ancho * modulo;
    if (i % 2 === 0) {
      rects.push(
        `<rect x="${x.toFixed(3)}" y="0" width="${w.toFixed(3)}" height="${altoBarras}" fill="#000"/>`,
      );
    }
    x += w;
  });

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${anchoTotal.toFixed(2)}mm" height="${altoBarras}mm" viewBox="0 0 ${anchoTotal.toFixed(3)} ${altoBarras}" shape-rendering="crispEdges">${rects.join("")}</svg>`,
    modulo,
    anchoTotal,
    legible: modulo >= MODULO_MINIMO_MM && anchoTotal <= medida.ancho,
  };
}

const escapar = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function descripcionEquipo(e: EquipoEtiqueta) {
  return [e.modelo ?? "Equipo", e.gb ? `${e.gb}GB` : null, e.color].filter(Boolean).join(" · ");
}

export function htmlEtiquetas(equipos: EquipoEtiqueta[], medida: MedidaEtiqueta) {
  const cuerpo = equipos
    .map((e) => {
      const { svg } = svgCodigoBarras(e.imei, medida);
      return `<section class="etiqueta">
        <div class="barra">${svg}</div>
        <div class="texto">
          <div class="modelo">${escapar(descripcionEquipo(e))}</div>
          <div class="imei">${escapar(e.imei)}</div>
        </div>
      </section>`;
    })
    .join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas</title>
<style>
  @page { size: ${medida.ancho}mm ${medida.alto}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; -webkit-print-color-adjust: exact; }
  .etiqueta {
    width: ${medida.ancho}mm; height: ${medida.alto}mm;
    padding: 1.5mm 3mm; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 0.8mm;
    page-break-after: always; break-after: page; overflow: hidden;
  }
  .etiqueta:last-child { page-break-after: auto; break-after: auto; }
  .barra { line-height: 0; }
  .texto { text-align: center; line-height: 1.15; }
  .modelo { font-size: 7.5pt; font-weight: 700; }
  .imei { font-size: 8pt; font-family: "Courier New", monospace; letter-spacing: 0.4pt; }
</style></head><body>${cuerpo}</body></html>`;
}

/** Manda las etiquetas al diálogo de impresión del sistema (la QL-800 aparece como impresora normal). */
export function imprimirEtiquetas(equipos: EquipoEtiqueta[], medida: MedidaEtiqueta) {
  if (equipos.length === 0) return;
  const marco = document.createElement("iframe");
  marco.setAttribute("aria-hidden", "true");
  marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(marco);
  const doc = marco.contentWindow?.document;
  if (!doc) {
    marco.remove();
    return;
  }
  doc.open();
  doc.write(htmlEtiquetas(equipos, medida));
  doc.close();
  const lanzar = () => {
    marco.contentWindow?.focus();
    marco.contentWindow?.print();
    setTimeout(() => marco.remove(), 1000);
  };
  if (marco.contentWindow?.document.readyState === "complete") setTimeout(lanzar, 120);
  else marco.onload = () => setTimeout(lanzar, 120);
}
