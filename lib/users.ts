import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR, ensureDirs } from "./config";

export type Usuario = {
  id: string;
  email: string;
  nombre: string;
  hash: string;
  salt: string;
  creado: string;
};

export type UsuarioPublico = { id: string; email: string; nombre: string; creado: string };

const ARCHIVO = path.join(DATA_DIR, "users.json");

function leer(): Usuario[] {
  try {
    ensureDirs();
    if (!fs.existsSync(ARCHIVO)) return [];
    const data = JSON.parse(fs.readFileSync(ARCHIVO, "utf8"));
    return Array.isArray(data) ? (data as Usuario[]) : [];
  } catch {
    return [];
  }
}

function guardar(usuarios: Usuario[]) {
  ensureDirs();
  fs.writeFileSync(ARCHIVO, JSON.stringify(usuarios, null, 2), "utf8");
}

function hashear(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export function publico(u: Usuario): UsuarioPublico {
  return { id: u.id, email: u.email, nombre: u.nombre, creado: u.creado };
}

export function buscarPorEmail(email: string): Usuario | undefined {
  const normal = email.trim().toLowerCase();
  return leer().find((u) => u.email === normal);
}

export function buscarPorId(id: string): Usuario | undefined {
  return leer().find((u) => u.id === id);
}

export function cuantos(): number {
  return leer().length;
}

export function crear(
  email: string,
  nombre: string,
  password: string,
): { ok: true; usuario: Usuario } | { ok: false; error: string } {
  const normal = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normal)) return { ok: false, error: "El email no es válido." };
  if (password.length < 8) return { ok: false, error: "La contraseña necesita al menos 8 caracteres." };
  if (buscarPorEmail(normal)) return { ok: false, error: "Ya existe una cuenta con ese email." };

  const salt = crypto.randomBytes(16).toString("hex");
  const usuario: Usuario = {
    id: crypto.randomBytes(8).toString("hex"),
    email: normal,
    nombre: nombre.trim().slice(0, 60) || normal.split("@")[0],
    hash: hashear(password, salt),
    salt,
    creado: new Date().toISOString(),
  };

  const usuarios = leer();
  usuarios.push(usuario);
  guardar(usuarios);

  return { ok: true, usuario };
}

export function verificar(email: string, password: string): Usuario | null {
  const u = buscarPorEmail(email);
  if (!u) return null;

  const intento = Buffer.from(hashear(password, u.salt), "hex");
  const real = Buffer.from(u.hash, "hex");
  if (intento.length !== real.length) return null;

  return crypto.timingSafeEqual(intento, real) ? u : null;
}
