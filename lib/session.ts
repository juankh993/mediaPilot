import { cookies } from "next/headers";
import crypto from "node:crypto";
import { env } from "./config";
import { buscarPorId, type Usuario } from "./users";

export const SESSION_COOKIE = "mp_sid";
const UN_ANIO = 60 * 60 * 24 * 365;

function secreto(): string {
  return env("APP_SECRET") || "mediapilot-dev-secret-cambiar-en-produccion";
}

function firmar(valor: string): string {
  return crypto.createHmac("sha256", secreto()).update(valor).digest("hex").slice(0, 32);
}

/** Cookie con el id de usuario firmado: "userId.firma". */
export async function iniciarSesion(usuarioId: string): Promise<void> {
  const valor = `${usuarioId}.${firmar(usuarioId)}`;
  const store = await cookies();
  store.set(SESSION_COOKIE, valor, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: UN_ANIO,
    // secure: true,  // activar cuando el panel esté detrás de HTTPS
  });
}

export async function cerrarSesion(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Id del usuario logueado, o null si no hay sesión válida. */
export async function usuarioId(): Promise<string | null> {
  const store = await cookies();
  const valor = store.get(SESSION_COOKIE)?.value;
  if (!valor || !valor.includes(".")) return null;

  const [id, firma] = valor.split(".");
  if (!id || !firma) return null;
  if (firmar(id) !== firma) return null;

  return id;
}

export async function usuarioActual(): Promise<Usuario | null> {
  const id = await usuarioId();
  if (!id) return null;
  return buscarPorId(id) ?? null;
}

/**
 * Identificador para separar los datos de cada usuario.
 * Ya NO es una cookie anónima: es el id del usuario logueado.
 * Devuelve null si no hay sesión (las rutas de datos responden 401).
 */
export async function getSessionId(): Promise<string | null> {
  return usuarioId();
}

/** Valor "crudo" de la cookie vieja (anónima), para migrar datos al primer login. */
export async function cookieCruda(): Promise<string | null> {
  const store = await cookies();
  const valor = store.get(SESSION_COOKIE)?.value;
  return valor && !valor.includes(".") ? valor : null;
}
