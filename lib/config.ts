import fs from "node:fs";
import path from "node:path";

/** Raíz de la app (donde vive package.json). */
export const ROOT = process.cwd();

/** Datos privados del panel: usuarios, canales, agenda. */
export const DATA_DIR = path.join(ROOT, "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const TOKENS_FILE = path.join(DATA_DIR, "tokens.json");

export function env(name: string): string {
  return (process.env[name] || "").trim();
}

export function envOr(name: string, fallback: string): string {
  const v = env(name);
  return v || fallback;
}

/**
 * Carpeta de trabajo: donde viven los guiones, el material, la música y los renders.
 * Es lo único que cambia entre un cliente y otro.
 *
 *   WORKSPACE_DIR=./workspace                    (por defecto)
 *   WORKSPACE_DIR=D:\mis-videos\canal-de-autos   (un canal concreto)
 */
export const WORKSPACE_DIR = path.resolve(ROOT, envOr("WORKSPACE_DIR", "./workspace"));

/**
 * Carpeta del motor de render (reel.ps1, tts-palabras.py, fix-loudness.ps1…).
 * Orden de búsqueda: ENGINE_DIR → ./engine → ../scripts (compatibilidad).
 */
export const ENGINE_DIR = (() => {
  const configurado = env("ENGINE_DIR");
  if (configurado) return path.resolve(ROOT, configurado);

  const local = path.join(ROOT, "engine");
  if (fs.existsSync(local)) return local;

  const hermano = path.resolve(ROOT, "..", "scripts");
  if (fs.existsSync(hermano)) return hermano;

  return local;
})();

/** Subcarpetas del workspace que usa el panel. */
export const WS = {
  guiones: "01-guiones",
  voz: "02-voz",
  visual: "03-visual",
  musica: "05-musica",
  salida: "06-salida",
  logs: "logs",
};

export function ensureDirs() {
  for (const dir of [DATA_DIR, UPLOAD_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

/** Crea la estructura mínima del workspace si no existe. */
export function ensureWorkspace() {
  for (const sub of Object.values(WS)) {
    const dir = path.join(WORKSPACE_DIR, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

export function isConfigured(): boolean {
  return Boolean(env("YOUTUBE_CLIENT_ID") && env("YOUTUBE_CLIENT_SECRET"));
}
