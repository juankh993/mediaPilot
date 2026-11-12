import { NextResponse } from "next/server";
import { verificar } from "@/lib/users";
import { cookieCruda, iniciarSesion } from "@/lib/session";
import { migrarCuentas } from "@/lib/accounts";
import { migrarAgenda } from "@/lib/schedule";

export async function POST(request: Request) {
  try {
    const { email, password } = (await request.json()) as { email?: string; password?: string };
    if (!email || !password) {
      return NextResponse.json({ error: "Faltan email o contraseña." }, { status: 400 });
    }

    const usuario = verificar(email, password);
    if (!usuario) {
      return NextResponse.json({ error: "Email o contraseña incorrectos." }, { status: 401 });
    }

    const legado = await cookieCruda();
    await iniciarSesion(usuario.id);

    if (legado && legado !== usuario.id) {
      migrarCuentas(legado, usuario.id);
      migrarAgenda(legado, usuario.id);
    }

    return NextResponse.json({
      ok: true,
      usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 },
    );
  }
}
