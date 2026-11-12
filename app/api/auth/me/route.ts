import { NextResponse } from "next/server";
import { usuarioActual } from "@/lib/session";
import { cuantos, publico } from "@/lib/users";

export async function GET() {
  const usuario = await usuarioActual();
  return NextResponse.json({
    usuario: usuario ? publico(usuario) : null,
    hayUsuarios: cuantos() > 0,
  });
}
