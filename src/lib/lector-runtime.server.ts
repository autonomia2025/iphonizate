/**
 * Manifiesto del entorno del lector (sin Homebrew).
 *
 * El instalador que corre en el Mac no sabe leer JSON (no queremos depender de
 * python3 ni de jq), así que este módulo resuelve TODO en el servidor y devuelve
 * un manifiesto de texto, una pieza por línea, que se parsea con `awk`.
 *
 * Fuentes:
 *  - formulae.brew.sh: versiones y sha256 de los "bottles" ya compilados para Mac
 *    (se descargan directo de ghcr.io con curl, sin instalar Homebrew).
 *  - nodejs.org: tarball oficial de Node (firmado y notarizado por Apple).
 */

/** Herramientas de lectura + su cierre de dependencias dinámicas. */
export const FORMULAS = [
  "libplist",
  "libimobiledevice-glue",
  "libusbmuxd",
  "libtatsu",
  "libtasn1",
  "openssl@3",
  "libimobiledevice",
] as const;

/** Nombre de macOS por versión mayor, de más nuevo a más antiguo. */
const NOMBRES_MACOS: Array<{ mayor: number; tag: string }> = [
  { mayor: 26, tag: "tahoe" },
  { mayor: 15, tag: "sequoia" },
  { mayor: 14, tag: "sonoma" },
  { mayor: 13, tag: "ventura" },
  { mayor: 12, tag: "monterey" },
  { mayor: 11, tag: "big_sur" },
];

export type Arquitectura = "arm64" | "x86_64";

/**
 * Etiquetas de bottle aceptables, en orden de preferencia: la del propio macOS y
 * después las anteriores (un bottle de Sonoma corre sin problemas en Sequoia).
 */
export function cascadaEtiquetas(arch: Arquitectura, mayorMacos: number): string[] {
  const desde = NOMBRES_MACOS.findIndex((n) => mayorMacos >= n.mayor);
  const nombres = (desde === -1 ? NOMBRES_MACOS : NOMBRES_MACOS.slice(desde)).map((n) => n.tag);
  const prefijo = arch === "arm64" ? "arm64_" : "";
  return [...nombres.map((n) => `${prefijo}${n}`), "all"];
}

type ArchivoBottle = { url: string; sha256: string };

type Formula = {
  nombre: string;
  version: string;
  archivos: Record<string, ArchivoBottle>;
};

const CACHE_MS = 30 * 60_000;
const cache = new Map<string, { hasta: number; valor: unknown }>();

async function conCache<T>(clave: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(clave);
  if (hit && hit.hasta > Date.now()) return hit.valor as T;
  const valor = await fn();
  cache.set(clave, { hasta: Date.now() + CACHE_MS, valor });
  return valor;
}

async function traerFormula(nombre: string): Promise<Formula> {
  return conCache(`formula:${nombre}`, async () => {
    const r = await fetch(`https://formulae.brew.sh/api/formula/${nombre}.json`);
    if (!r.ok) throw new Error(`No pude leer la fórmula ${nombre} (${r.status})`);
    const d = (await r.json()) as {
      versions: { stable: string };
      revision?: number;
      bottle: { stable: { files: Record<string, ArchivoBottle> } };
    };
    const revision = d.revision ? `_${d.revision}` : "";
    return {
      nombre,
      version: `${d.versions.stable}${revision}`,
      archivos: d.bottle.stable.files,
    };
  });
}

/** `https://ghcr.io/v2/homebrew/core/openssl/3/blobs/sha256:…` → `homebrew/core/openssl/3` */
function repoDesdeUrl(url: string): string | null {
  const m = url.match(/ghcr\.io\/v2\/(.+?)\/blobs\//);
  return m?.[1] ?? null;
}

async function traerNode(): Promise<{ version: string; archivos: Record<string, string> }> {
  return conCache("node", async () => {
    const rIndex = await fetch("https://nodejs.org/dist/index.json");
    if (!rIndex.ok) throw new Error("No pude leer las versiones de Node");
    const lista = (await rIndex.json()) as Array<{ version: string; lts: string | false }>;
    const version = lista.find((v) => v.lts)?.version;
    if (!version) throw new Error("No encontré una versión LTS de Node");

    const rSumas = await fetch(`https://nodejs.org/dist/${version}/SHASUMS256.txt`);
    if (!rSumas.ok) throw new Error("No pude leer los checksums de Node");
    const texto = await rSumas.text();
    const archivos: Record<string, string> = {};
    for (const linea of texto.split("\n")) {
      const [suma, archivo] = linea.trim().split(/\s+/);
      if (!suma || !archivo) continue;
      for (const arch of ["darwin-arm64", "darwin-x64"]) {
        if (archivo === `node-${version}-${arch}.tar.gz`) archivos[arch] = suma;
      }
    }
    return { version, archivos };
  });
}

export type ManifiestoOpciones = {
  arch: Arquitectura;
  mayorMacos: number;
  version: string;
};

/**
 * Manifiesto de texto para el instalador. Formato (campos separados por espacio):
 *   version <version-agente>
 *   etiqueta <bottle-tag-elegido>
 *   node <version> <url> <sha256>
 *   herramienta <formula> <version> <repo-ghcr> <url> <sha256>
 */
export async function manifiestoTexto(opts: ManifiestoOpciones): Promise<string> {
  const etiquetas = cascadaEtiquetas(opts.arch, opts.mayorMacos);
  const [node, ...formulas] = await Promise.all([
    traerNode(),
    ...FORMULAS.map((f) => traerFormula(f)),
  ]);

  const archNode = opts.arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  const sumaNode = node.archivos[archNode];
  if (!sumaNode) throw new Error(`Node no tiene tarball para ${archNode}`);

  const lineas: string[] = [
    `version ${opts.version}`,
    `node ${node.version} https://nodejs.org/dist/${node.version}/node-${node.version}-${archNode}.tar.gz ${sumaNode}`,
  ];

  let etiquetaUsada: string | null = null;
  for (const f of formulas as Formula[]) {
    const etiqueta = etiquetas.find((e) => f.archivos[e]);
    if (!etiqueta) {
      throw new Error(`La fórmula ${f.nombre} no tiene paquete para ${opts.arch}/${opts.mayorMacos}`);
    }
    const archivo = f.archivos[etiqueta]!;
    const repo = repoDesdeUrl(archivo.url);
    if (!repo) throw new Error(`URL inesperada en ${f.nombre}: ${archivo.url}`);
    etiquetaUsada ??= etiqueta;
    lineas.push(`herramienta ${f.nombre} ${f.version} ${repo} ${archivo.url} ${archivo.sha256}`);
  }

  lineas.splice(1, 0, `etiqueta ${etiquetaUsada ?? "?"}`);
  return `${lineas.join("\n")}\n`;
}
