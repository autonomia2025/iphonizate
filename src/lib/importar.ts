import { CATEGORIAS, GB_OPCIONES, SERVICIOS, type ServicioTipo } from "@/lib/inventario";

export type CampoImportado =
  | "imei"
  | "modelo"
  | "gb"
  | "color"
  | "bateria"
  | "categoria"
  | "costo"
  | "proveedor"
  | "lote"
  | "ubicacion"
  | "email_vinculado"
  | "notas"
  | "arreglos"
  | "fecha";

export const CAMPOS: { campo: CampoImportado; label: string; obligatorio?: boolean; alias: string[] }[] =
  [
    { campo: "imei", label: "IMEI", obligatorio: true, alias: ["imei", "imei1", "serie imei", "codigo"] },
    { campo: "modelo", label: "Modelo", obligatorio: true, alias: ["modelo", "equipo", "producto", "descripcion"] },
    { campo: "gb", label: "Capacidad (GB)", alias: ["gb", "capacidad", "almacenamiento", "memoria"] },
    { campo: "color", label: "Color", alias: ["color"] },
    { campo: "bateria", label: "Batería %", alias: ["bateria", "batería", "salud bateria", "bateria %", "salud"] },
    { campo: "categoria", label: "Categoría", alias: ["categoria", "categoría", "condicion", "estado equipo", "tipo"] },
    { campo: "costo", label: "Costo", alias: ["costo", "costo compra", "precio compra", "valor compra", "compra"] },
    { campo: "proveedor", label: "Proveedor", alias: ["proveedor", "vendedor", "origen"] },
    { campo: "lote", label: "Lote", alias: ["lote", "batch"] },
    {
      campo: "ubicacion",
      label: "Ubicación (tienda)",
      obligatorio: true,
      alias: ["ubicacion", "ubicación", "tienda", "sucursal", "local", "bodega"],
    },
    { campo: "email_vinculado", label: "Email vinculado", alias: ["email", "correo", "email vinculado", "icloud"] },
    { campo: "notas", label: "Notas", alias: ["notas", "observaciones", "comentarios", "detalle"] },
    { campo: "arreglos", label: "Arreglos pendientes", alias: ["arreglos", "servicios", "reparaciones", "fallas"] },
    { campo: "fecha", label: "Fecha de ingreso", alias: ["fecha", "fecha ingreso", "ingreso", "fecha compra"] },
  ];

export type Mapeo = Partial<Record<CampoImportado, string>>;

const sinTildes = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export const normalizarTexto = sinTildes;

export function detectarMapeo(encabezados: string[]): Mapeo {
  const mapeo: Mapeo = {};
  const usados = new Set<string>();
  for (const { campo, alias } of CAMPOS) {
    const hit = encabezados.find((h) => {
      if (usados.has(h)) return false;
      const limpio = sinTildes(String(h));
      return alias.some((a) => limpio === sinTildes(a)) || alias.some((a) => limpio.includes(sinTildes(a)));
    });
    if (hit) {
      mapeo[campo] = hit;
      usados.add(hit);
    }
  }
  return mapeo;
}

/* ---------------- normalizadores de planilla sucia ---------------- */

export const normalizarImei = (valorCrudo: unknown) => {
  let texto = String(valorCrudo ?? "").trim();
  /* Excel a veces guarda IMEIs largos como 3.5486E+14 */
  if (/^\d(\.\d+)?e\+?\d+$/i.test(texto)) {
    const n = Number(texto);
    if (Number.isFinite(n)) texto = n.toFixed(0);
  }
  const digitos = texto.replace(/[^\d]/g, "");
  return { imei: digitos, sucio: digitos !== texto };
};

export const normalizarMonto = (valorCrudo: unknown) => {
  if (valorCrudo == null || valorCrudo === "") return { valor: null as number | null, sucio: false };
  if (typeof valorCrudo === "number") return { valor: Math.round(valorCrudo), sucio: false };
  const texto = String(valorCrudo).trim();
  const digitos = texto.replace(/[^\d]/g, "");
  if (!digitos) return { valor: null as number | null, sucio: true };
  return { valor: Number(digitos), sucio: digitos !== texto };
};

export const normalizarBateria = (valorCrudo: unknown) => {
  if (valorCrudo == null || valorCrudo === "") return { valor: null as number | null, sucio: false, error: false };
  const texto = String(valorCrudo).trim().replace(/%/g, "").replace(",", ".");
  const n = Number(texto);
  if (!Number.isFinite(n)) return { valor: null as number | null, sucio: false, error: true };
  /* "0.85" es 85% */
  const valor = n > 0 && n <= 1 ? Math.round(n * 100) : Math.round(n);
  if (valor < 0 || valor > 100) return { valor: null as number | null, sucio: false, error: true };
  const sucio = String(valorCrudo).trim() !== String(valor);
  return { valor, sucio, error: false };
};

export const normalizarGb = (valorCrudo: unknown) => {
  if (valorCrudo == null || valorCrudo === "") return { valor: null as number | null, sucio: false };
  const texto = sinTildes(String(valorCrudo));
  const n = Number(texto.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n === 0) return { valor: null as number | null, sucio: true };
  const valor = /tb/.test(texto) ? Math.round(n * 1024) : Math.round(n);
  const estandar = (GB_OPCIONES as readonly number[]).includes(valor);
  return { valor, sucio: !estandar || String(valorCrudo).trim() !== String(valor) };
};

export const normalizarCategoria = (valorCrudo: unknown) => {
  const texto = sinTildes(String(valorCrudo ?? ""));
  if (!texto) return { valor: "seminuevo" as (typeof CATEGORIAS)[number], sucio: false };
  const hit = CATEGORIAS.find((c) => texto.includes(c) || sinTildes(c) === texto);
  if (hit) return { valor: hit, sucio: false };
  if (/nuevo|sellad/.test(texto)) return { valor: "sellado" as const, sucio: true };
  if (/open/.test(texto)) return { valor: "openbox" as const, sucio: true };
  if (/reacond|refurb/.test(texto)) return { valor: "reacondicionado" as const, sucio: true };
  return { valor: "seminuevo" as const, sucio: true };
};

export const normalizarArreglos = (valorCrudo: unknown) => {
  const texto = sinTildes(String(valorCrudo ?? ""));
  if (!texto) return { tipos: [] as ServicioTipo[], sucio: false };
  const partes = texto.split(/[,;/|]+/).map((p) => p.trim()).filter(Boolean);
  const tipos: ServicioTipo[] = [];
  let sucio = false;
  for (const parte of partes) {
    const hit = SERVICIOS.find(
      (s) => parte === s.tipo || parte.includes(s.tipo) || sinTildes(s.label).includes(parte) || parte.includes(sinTildes(s.label)),
    );
    if (hit) {
      if (!tipos.includes(hit.tipo)) tipos.push(hit.tipo);
    } else {
      sucio = true;
      if (!tipos.includes("otro")) tipos.push("otro");
    }
  }
  return { tipos, sucio };
};

/* ---------------- validación fila por fila ---------------- */

export type FilaImportada = {
  linea: number;
  imei: string;
  modelo: string;
  gb: number | null;
  color: string | null;
  bateria: number | null;
  categoria: (typeof CATEGORIAS)[number];
  costo: number | null;
  proveedor: string | null;
  lote: string | null
  ubicacion_id: string | null;
  ubicacionTexto: string;
  email_vinculado: string | null;
  notas: string | null;
  arreglos: ServicioTipo[];
  errores: string[];
  avisos: string[];
};

export type Tienda = { id: string; nombre: string; es_bodega?: boolean | null };

export function validarFilas(
  filas: Record<string, unknown>[],
  mapeo: Mapeo,
  opciones: { tiendas: Tienda[]; imeisActivos: Set<string>; puedeCostos: boolean },
): FilaImportada[] {
  const vistos = new Set<string>();
  const resultado: FilaImportada[] = [];

  const dato = (fila: Record<string, unknown>, campo: CampoImportado) => {
    const col = mapeo[campo];
    return col ? fila[col] : undefined;
  };

  filas.forEach((fila, i) => {
    const vacia = Object.values(fila).every((v) => v == null || String(v).trim() === "");
    if (vacia) return;

    const errores: string[] = [];
    const avisos: string[] = [];

    const { imei, sucio: imeiSucio } = normalizarImei(dato(fila, "imei"));
    if (!imei) errores.push("Sin IMEI");
    else if (imei.length !== 15)
      errores.push(`IMEI de ${imei.length} dígitos (debe tener 15, no lo completamos solos)`);
    else if (vistos.has(imei)) errores.push("IMEI repetido dentro del archivo");
    else if (opciones.imeisActivos.has(imei)) errores.push("IMEI ya activo en el sistema: se omite");
    else if (imeiSucio) avisos.push("Limpiamos el IMEI (espacios, guiones o formato de Excel)");
    if (imei && imei.length === 15) vistos.add(imei);

    const modelo = String(dato(fila, "modelo") ?? "").trim();
    if (!modelo) errores.push("Sin modelo");

    const gb = normalizarGb(dato(fila, "gb"));
    if (gb.valor != null && gb.sucio) avisos.push(`Capacidad normalizada a ${gb.valor} GB: revísala`);

    const bateria = normalizarBateria(dato(fila, "bateria"));
    if (bateria.error) errores.push("Batería fuera de rango o ilegible");
    else if (bateria.sucio && bateria.valor != null) avisos.push(`Batería normalizada a ${bateria.valor}%`);

    const categoria = normalizarCategoria(dato(fila, "categoria"));
    if (categoria.sucio) avisos.push(`Categoría no reconocida: queda como ${categoria.valor}`);

    const costo = normalizarMonto(dato(fila, "costo"));
    if (costo.sucio && costo.valor != null) avisos.push(`Costo normalizado a ${costo.valor}`);
    if (costo.valor != null && !opciones.puedeCostos) avisos.push("Tu rol no importa costos: queda en 0");

    const ubicacionTexto = String(dato(fila, "ubicacion") ?? "").trim();
    const tienda = opciones.tiendas.find(
      (t) => sinTildes(t.nombre) === sinTildes(ubicacionTexto) || (!!ubicacionTexto && sinTildes(t.nombre).includes(sinTildes(ubicacionTexto))),
    );
    if (!ubicacionTexto) errores.push("Sin ubicación");
    else if (!tienda) errores.push(`La ubicación "${ubicacionTexto}" no existe en el sistema`);

    const arreglos = normalizarArreglos(dato(fila, "arreglos"));
    if (arreglos.sucio) avisos.push("Algún arreglo no se reconoció y quedó como Otro");

    const fecha = String(dato(fila, "fecha") ?? "").trim();
    if (mapeo.fecha && !fecha) avisos.push("Fila sin fecha: se usa la fecha de importación");

    resultado.push({
      linea: i + 2,
      imei,
      modelo,
      gb: gb.valor,
      color: String(dato(fila, "color") ?? "").trim() || null,
      bateria: bateria.valor,
      categoria: categoria.valor,
      costo: opciones.puedeCostos ? (costo.valor ?? 0) : 0,
      proveedor: String(dato(fila, "proveedor") ?? "").trim() || null,
      lote: String(dato(fila, "lote") ?? "").trim() || null,
      ubicacion_id: tienda?.id ?? null,
      ubicacionTexto,
      email_vinculado: String(dato(fila, "email_vinculado") ?? "").trim() || null,
      notas: String(dato(fila, "notas") ?? "").trim() || null,
      arreglos: arreglos.tipos,
      errores,
      avisos,
    });
  });

  return resultado;
}

export function csvRechazadas(filas: FilaImportada[]) {
  const enc = ["linea", "imei", "modelo", "gb", "color", "bateria", "ubicacion", "motivo"];
  const escapar = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cuerpo = filas.map((f) =>
    [f.linea, f.imei, f.modelo, f.gb ?? "", f.color ?? "", f.bateria ?? "", f.ubicacionTexto, f.errores.join(" · ")]
      .map(escapar)
      .join(","),
  );
  return [enc.join(","), ...cuerpo].join("\n");
}

export const descargarCsv = (nombre: string, contenido: string) => {
  const blob = new Blob([`\uFEFF${contenido}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
};

/* ---------------- CSV genérico (exportar / importar catálogos) ---------------- */

const escaparCsv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** Arma un CSV a partir de encabezados y filas ya ordenadas. */
export function armarCsv(encabezados: string[], filas: (unknown[])[]) {
  return [encabezados.join(","), ...filas.map((f) => f.map(escaparCsv).join(","))].join("\n");
}

/** Lee un CSV simple (con comillas) y devuelve objetos por encabezado normalizado. */
export function leerCsv(texto: string): Record<string, string>[] {
  const limpio = texto.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const filas: string[][] = [];
  let celda = "";
  let fila: string[] = [];
  let enComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i]!;
    if (enComillas) {
      if (ch === '"') {
        if (limpio[i + 1] === '"') {
          celda += '"';
          i += 1;
        } else enComillas = false;
      } else celda += ch;
      continue;
    }
    if (ch === '"') enComillas = true;
    else if (ch === "," || ch === ";") {
      fila.push(celda);
      celda = "";
    } else if (ch === "\n") {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += ch;
  }
  if (celda || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }

  const encabezados = (filas.shift() ?? []).map((h) => sinTildes(h));
  return filas
    .filter((f) => f.some((c) => c.trim() !== ""))
    .map((f) => {
      const obj: Record<string, string> = {};
      encabezados.forEach((h, i) => {
        obj[h] = (f[i] ?? "").trim();
      });
      return obj;
    });
}
