import { NextResponse } from "next/server";
import { crear } from "@/lib/users";
import { cookieCruda, iniciarSesion } from "@/lib/session";
import { migrarCuentas } from "@/lib/accounts";
import { migrarAgenda } from "@/lib/schedule";

export async function POST(request: Request) {
  try {
    const { email, nombre, password } = (await request.json()) as {
      email?: string;
      nombre?: string;
      password?: string;
    };

    if (!email || !password) {
      return NextResponse.json({ error: "Faltan email o contraseña." }, { status: 400 });
    }

    const legado = await cookieCruda();
    const res = crear(email, nombre ?? "", password);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

    await iniciarSesion(res.usuario.id);

    // Si venía usando el panel sin cuenta, sus canales y su agenda pasan a la cuenta nueva.
    if (legado) {
      migrarCuentas(legado, res.usuario.id);
      migrarAgenda(legado, res.usuario.id);
    }

    return NextResponse.json({
      ok: true,
      usuario: { id: res.usuario.id, email: res.usuario.email, nombre: res.usuario.nombre },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 },
    );
  }
}
