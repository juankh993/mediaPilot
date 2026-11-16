import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { ENGINE_DIR, WORKSPACE_DIR, WS, ensureWorkspace } from "./config";
import {
  elegirGenerico,
  elegirMaterial,
  escanear,
  musicaDisponible,
  palabrasClave,
  type Material,
} from "./material";


export type Escena = {
  n?: number;
  descripcion?: string;
  busqueda?: string;
  dur?: number;
  movimiento?: string;
};

export type Plan = {
  titulo?: string;
  gancho?: string;
  vozTexto?: string;
  duracion?: number;
  escenas?: Escena[];
  musica?: string;
  cierre?: string;
};

export type EstadoTrabajo = {
  id: string;
  estado: "encolado" | "renderizando" | "listo" | "error";
  progreso: number;
  mensaje: string;
  video?: string;
  config?: string;
  log: string[];
  iniciado: number;
  estimadoSegundos: number;
  terminado?: number;
};

const trabajos = new Map<string, EstadoTrabajo>();

export function obtenerTrabajo(id: string): EstadoTrabajo | undefined {
  return trabajos.get(id);
}

function slug(texto: string): string {
  return (
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "reel"
  );
}

function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ejecutar(
  comando: string,
  args: string[],
  cwd: string,
  onLinea: (linea: string) => void,
): Promise<number> {
  return new Promise((resolve) => {
    const hijo = spawn(comando, args, { cwd, windowsHide: true });

    const leer = (buffer: Buffer) => {
      for (const linea of buffer.toString("utf8").split(/\r?\n/)) {
        const limpia = linea.trim();
        if (limpia) onLinea(limpia);
      }
    };

    hijo.stdout?.on("data", leer);
    hijo.stderr?.on("data", leer);
    hijo.on("error", (e) => {
      onLinea(`ERROR al lanzar el proceso: ${e.message}`);
      resolve(-1);
    });
    hijo.on("close", (codigo) => resolve(codigo ?? -1));
  });
}

/** Descarga fotos nuevas para una búsqueda concreta (Unsplash → Pixabay). */
async function descargarFotos(consulta: string, anotar: (l: string) => void): Promise<boolean> {
  const palabras = palabrasClave(consulta);
  if (palabras.length === 0) return false;

  const query = palabras.slice(0, 4).join(" ");
  // Una carpeta por búsqueda: así "otra toma del mismo tema" encuentra material del tema.
  const salida = `${WS.visual}/panel/${slug(query)}`;

  const intentos: Array<[string, string[]]> = [
    [
      "buscar-unsplash.ps1",
      ["-Query", query, "-Cantidad", "2", "-Orientacion", "vertical", "-Salida", salida, "-TrackDownload"],
    ],
    [
      "buscar-fotos.ps1",
      ["-Query", query, "-Cantidad", "2", "-Orientacion", "vertical", "-Salida", salida],
    ],
  ];

  for (const [script, args] of intentos) {
    const ruta = path.join(ENGINE_DIR, script);
    if (!fs.existsSync(ruta)) continue;

    anotar(`  buscando material nuevo: "${query}" con ${script}`);
    const codigo = await ejecutar("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ruta, ...args], WORKSPACE_DIR, anotar);
    if (codigo === 0) return true;
  }
  return false;
}

type Resuelta = { material: Material; dur: number; movimiento: string };

/** Máximo de escenas extra que se agregan para repartir el tiempo sobrante. */
const EXTRA_MAX = 8;
/** Si la última escena quedaría más larga que esto, se agregan extras. */
const SOBRANTE_MAX = 6;
/** Duración de cada escena extra. */
const DUR_EXTRA = 4;

/** El texto que realmente narra la voz (guion + cierre si no estaba incluido). */
function textoDeVoz(plan: Plan): string {
  const voz = (plan.vozTexto ?? "").trim();
  const cierre = (plan.cierre ?? "").trim();
  return cierre && !voz.includes(cierre) ? `${voz} ${cierre}` : voz;
}

/**
 * Velocidad de lectura medida con edge-tts en español: 15,8 caracteres/segundo.
 * Se usa 15,5 para que el error quede a favor (si la voz sale más larga, la última
 * escena absorbe un poco; si sale más corta, no queda un plano de medio segundo).
 */
const CHARS_POR_SEGUNDO = 15.5;

/** Duración total estimada del reel: gancho + entrada + voz + cola (valores de reel.ps1). */
export function duracionEstimada(plan: Plan): number {
  const texto = textoDeVoz(plan);
  const voz = Math.max(4, texto.length / CHARS_POR_SEGUNDO);
  return 1.8 + 0.3 + voz + 0.8;
}

/**
 * Resuelve el material de cada escena:
 *  1) material local que coincida de verdad
 *  2) si no hay, descarga fotos nuevas para esa búsqueda
 *  3) si tampoco, una foto genérica (nunca un clip o infografía de otro tema)
 *
 * Después reparte el tiempo: si la última escena absorbería demasiado sobrante,
 * agrega escenas extra para que el último plano no quede quieto 8-10 segundos.
 */
async function resolverEscenas(
  plan: Plan,
  anotar: (linea: string) => void,
): Promise<Resuelta[]> {
  const escenas = (plan.escenas ?? []).filter(Boolean);
  if (escenas.length === 0) throw new Error("El plan no tiene escenas.");

  let material = escanear(WORKSPACE_DIR);
  const usados = new Set<string>();
  const resueltas: Resuelta[] = [];

  let carpetaPrevia = "";
  let descargas = 0;

  const resolverUna = async (
    consulta: string,
    movimiento: string | undefined,
    dur: number,
    soloCarpeta?: string,
  ): Promise<Resuelta | null> => {
    let elegido = elegirMaterial(material, consulta, usados, {
      minimo: soloCarpeta ? 0 : 2,
      evitarCarpeta: soloCarpeta ? "" : carpetaPrevia,
      soloCarpeta,
    });

    if (!elegido && consulta && descargas < 10) {
      descargas++;
      const ok = await descargarFotos(consulta, anotar);
      if (ok) {
        material = escanear(WORKSPACE_DIR);
        elegido = elegirMaterial(material, consulta, usados, {
          minimo: soloCarpeta ? 0 : 1,
          soloCarpeta,
        });
      }
    }

    // Si pedí "otra foto del mismo tema", mejor gastar más descargas que meter otra cosa.
    if (!elegido && soloCarpeta && consulta && descargas < 12) {
      descargas++;
      const ok = await descargarFotos(consulta, anotar);
      if (ok) {
        material = escanear(WORKSPACE_DIR);
        elegido = elegirMaterial(material, consulta, usados, { minimo: 0, soloCarpeta });
      }
    }

    if (!elegido) {
      elegido = elegirGenerico(material, usados, carpetaPrevia);
      if (elegido) anotar(`  escena "${consulta}": sin coincidencia, se usa material genérico`);
    }

    if (!elegido) return null;

    usados.add(elegido.ruta);
    carpetaPrevia = elegido.carpeta;

    return {
      material: elegido,
      dur,
      movimiento: movimiento === "out" ? "out" : movimiento === "none" ? "" : "in",
    };
  };

  const porConsulta = new Map<string, string>();

  for (const e of escenas) {
    const consulta = `${e.busqueda ?? ""} ${e.descripcion ?? ""}`.trim();
    const dur = Math.min(8, Math.max(2.5, Number(e.dur) || 5));
    const r = await resolverUna(consulta, e.movimiento, dur);
    if (r) {
      resueltas.push(r);
      if (consulta) porConsulta.set(consulta, r.material.carpeta);
    }
  }

  if (resueltas.length === 0) throw new Error("No se pudo resolver ningún visual.");

  // --- reparto del tiempo sobrante -----------------------------------------
  const total = duracionEstimada(plan);
  const durFijas = resueltas.slice(0, -1).reduce((acc, r) => acc + r.dur, 0);
  let sobrante = total - durFijas;

  const consultas = escenas
    .map((e) => `${e.busqueda ?? ""} ${e.descripcion ?? ""}`.trim())
    .filter(Boolean);

  let extras = 0;
  while (sobrante > SOBRANTE_MAX && extras < EXTRA_MAX && consultas.length > 0) {
    const consulta = consultas[extras % consultas.length];
    // La escena extra vuelve sobre el MISMO tema (misma carpeta), no sobre material cualquiera.
    const carpeta = porConsulta.get(consulta);
    const r = await resolverUna(consulta, extras % 2 ? "out" : "in", DUR_EXTRA, carpeta);

    if (!r) break;

    // Se inserta ANTES de la última: la última sigue siendo la que absorbe.
    resueltas.splice(resueltas.length - 1, 0, r);
    sobrante -= r.dur;
    extras++;
    anotar(`  escena extra ${extras}: otra toma de "${consulta}" (${DUR_EXTRA}s)`);
  }

  if (extras > 0) {
    anotar(`  reparto: ${extras} escenas extra · sobrante final ≈ ${Math.max(0, sobrante).toFixed(1)}s`);
  }

  return resueltas;
}

/** Arma la config que entiende scripts/reel.ps1. */
export function construirConfig(
  plan: Plan,
  resueltas: Resuelta[],
  factor = 1,
): Record<string, unknown> {
  const visual: Array<Record<string, unknown>> = resueltas.map((r) => ({
    tipo: r.material.tipo,
    archivo: r.material.ruta,
    ...(r.material.tipo === "video" ? { desde: 0 } : {}),
    dur: r.dur,
    zoom: r.movimiento,
    modo: r.material.tipo === "foto" ? "blurfill" : "fill",
  }));

  // La última escena absorbe la diferencia de tiempo.
  visual[visual.length - 1].dur = null;

  const cierre = (plan.cierre ?? "").trim();
  const voz = (plan.vozTexto ?? "").trim();
  const vozTexto = cierre && !voz.includes(cierre) ? `${voz} ${cierre}` : voz;
  if (!vozTexto) throw new Error("El plan no tiene texto de voz.");

  // Los planos fijos no pueden sumar más que el bloque completo (gancho + voz + cola).
  // Se deja margen para que la última escena absorba unos 5s como máximo.
  const totalEstimado = duracionEstimada(plan);
  const objetivoFijos = Math.max(2.5, (totalEstimado - 5.5) * factor);
  const fijos = visual.slice(0, -1);

  if (fijos.length > 0) {
    const suma = fijos.reduce((acc, v) => acc + Number(v.dur ?? 0), 0);
    if (suma > objetivoFijos) {
      const escala = objetivoFijos / suma;
      for (const v of fijos) {
        v.dur = Math.max(2, Number(((Number(v.dur) || 3) * escala).toFixed(2)));
      }
    }
  }

  const musica = musicaDisponible(WORKSPACE_DIR);
  const pista = musica.length ? musica[Math.floor(Math.random() * musica.length)] : null;

  return {
    tipo: "footage",
    fecha: hoy(),
    salida: "reel.mp4",
    sinMotor: true,
    subtitulos: true,
    gancho: (plan.gancho ?? "").replace(/\|/g, "\n"),
    ganchoDur: 1.8,
    vozEn: 0.3,
    cola: 0.8,
    limiteDuracion: Math.max(60, Math.round(Number(plan.duracion) || 45) + 15),
    a: { vozTexto, visual },
    ...(pista ? { musica: { archivo: pista, vol: 0.14 } } : {}),
  };
}

/** Estimación de cuánto va a tardar el render (medida con reels reales). */
function estimarSegundos(plan: Plan): number {
  const audio = duracionEstimada(plan);
  // Las escenas extra se agregan solas, así que se estiman por duración.
  const escenas = Math.max((plan.escenas ?? []).length, Math.ceil(audio / DUR_EXTRA));
  // Calibrado con dos renders reales (i3-7100U):
  //   13s / 4 escenas -> ~180s · 30s / 6 escenas -> ~548s
  return Math.round(45 + audio * 12 + escenas * 20);
}

/** Lanza el render en segundo plano y devuelve el id del trabajo. */
export function iniciarRender(plan: Plan): EstadoTrabajo {
  const fecha = hoy();
  const id = `${fecha}-${slug(String(plan.titulo ?? "reel"))}-${Math.random().toString(36).slice(2, 6)}`;

  const trabajo: EstadoTrabajo = {
    id,
    estado: "encolado",
    progreso: 0,
    mensaje: "Encolado",
    log: [],
    iniciado: Date.now(),
    estimadoSegundos: estimarSegundos(plan),
  };
  trabajos.set(id, trabajo);

  const anotar = (linea: string) => {
    trabajo.log.push(linea);
    if (trabajo.log.length > 400) trabajo.log.shift();
    if (linea.startsWith("TOTAL") || linea.includes("FINAL:")) trabajo.progreso = 75;
    if (linea.includes("OK audio")) trabajo.progreso = 60;
  };

  void (async () => {
    try {
      trabajo.estado = "renderizando";
      trabajo.progreso = 5;
      trabajo.mensaje = "Eligiendo material para cada escena…";

      ensureWorkspace();

      const dirGuiones = path.join(WORKSPACE_DIR, WS.guiones, fecha);
      fs.mkdirSync(dirGuiones, { recursive: true });

      // Los renders del panel van a su propia subcarpeta: así NUNCA pisan los videos
      // que produce el pipeline a mano en 06-salida/<fecha>/.
      fs.mkdirSync(path.join(WORKSPACE_DIR, WS.salida, fecha, "panel"), { recursive: true });
      const configRel = `${WS.guiones}/${fecha}/${id}.json`;
      const configAbs = path.join(WORKSPACE_DIR, configRel);

      const resueltas = await resolverEscenas(plan, anotar);

      let factor = 1;
      let codigo = -1;
      let salidaRel = "";

      for (let intento = 0; intento < 3; intento++) {
        const cfg = construirConfig(plan, resueltas, factor);
        cfg.id = id;
        cfg.fecha = fecha;
        cfg.salida = `panel/${id}.mp4`;
        salidaRel = `${WS.salida}/${fecha}/${String(cfg.salida)}`;

        fs.writeFileSync(configAbs, JSON.stringify(cfg, null, 2), "utf8");
        trabajo.config = configRel;
        trabajo.mensaje =
          intento === 0 ? "Generando voz y montando el video…" : `Reintento ${intento}…`;
        trabajo.progreso = 20;

        codigo = await ejecutar(
          "powershell.exe",
          [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            path.join(ENGINE_DIR, "reel.ps1"),
            "-Config",
            configRel,
          ],
          WORKSPACE_DIR,
          anotar,
        );

        if (codigo === 0) break;

        const planosLargos = trabajo.log.some((l) => l.includes("planos fijos"));
        if (!planosLargos) break;

        factor *= 0.55;
        anotar("→ Los planos no entraban en la voz: reintento con planos más cortos.");
        trabajo.progreso = 20;
      }

      if (codigo !== 0) {
        trabajo.estado = "error";
        trabajo.mensaje = `El render falló (código ${codigo}). Revisá el log.`;
        trabajo.terminado = Date.now();
        return;
      }

      trabajo.progreso = 85;
      trabajo.mensaje = "Normalizando volumen…";

      const salidaAbs = path.join(WORKSPACE_DIR, salidaRel);

      if (fs.existsSync(salidaAbs)) {
        await ejecutar(
          "powershell.exe",
          [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            path.join(ENGINE_DIR, "fix-loudness.ps1"),
            "-Entrada",
            salidaRel,
          ],
          WORKSPACE_DIR,
          anotar,
        );
      }

      if (!fs.existsSync(salidaAbs)) {
        trabajo.estado = "error";
        trabajo.mensaje = "El render terminó pero no se encontró el MP4.";
        trabajo.terminado = Date.now();
        return;
      }

      trabajo.estado = "listo";
      trabajo.progreso = 100;
      trabajo.mensaje = "Video listo";
      trabajo.video = salidaRel;
      trabajo.terminado = Date.now();
    } catch (error) {
      trabajo.estado = "error";
      trabajo.mensaje = error instanceof Error ? error.message : "Error inesperado";
      trabajo.terminado = Date.now();
    }
  })();

  return trabajo;
}

export function resolverVideo(rel: string): string | null {
  const abs = path.resolve(WORKSPACE_DIR, rel);
  if (!abs.startsWith(WORKSPACE_DIR)) return null;
  if (!fs.existsSync(abs)) return null;
  return abs;
}
