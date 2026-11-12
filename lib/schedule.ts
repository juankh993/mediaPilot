import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR, ensureDirs } from "./config";

export type Programado = {
  id: string;
  sessionId: string;
  videoId: string;
  url: string;
  canal: string;
  titulo: string;
  publishAt: string; // ISO UTC
  creado: string;
};

const ARCHIVO = path.join(DATA_DIR, "schedule.json");

function leer(): Programado[] {
  try {
    ensureDirs();
    if (!fs.existsSync(ARCHIVO)) return [];
    const data = JSON.parse(fs.readFileSync(ARCHIVO, "utf8"));
    return Array.isArray(data) ? (data as Programado[]) : [];
  } catch {
    return [];
  }
}

function guardar(items: Programado[]) {
  ensureDirs();
  fs.writeFileSync(ARCHIVO, JSON.stringify(items, null, 2), "utf8");
}

export function listar(sessionId: string): Programado[] {
  return leer()
    .filter((p) => p.sessionId === sessionId)
    .sort((a, b) => a.publishAt.localeCompare(b.publishAt));
}

export function agregar(
  datos: Omit<Programado, "id" | "creado">,
): Programado {
  const items = leer();
  const nuevo: Programado = {
    ...datos,
    id: crypto.randomBytes(6).toString("hex"),
    creado: new Date().toISOString(),
  };
  items.push(nuevo);
  guardar(items);
  return nuevo;
}

export function borrar(id: string, sessionId: string): boolean {
  const items = leer();
  const filtrados = items.filter((p) => !(p.id === id && p.sessionId === sessionId));
  if (filtrados.length === items.length) return false;
  guardar(filtrados);
  return true;
}

/** Pasa la agenda de una sesión anónima vieja a la cuenta de usuario. */
export function migrarAgenda(desde: string, hacia: string): number {
  const items = leer();
  let n = 0;
  for (const p of items) {
    if (p.sessionId === desde) {
      p.sessionId = hacia;
      n++;
    }
  }
  if (n > 0) guardar(items);
  return n;
}
