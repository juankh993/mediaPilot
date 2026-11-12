import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/session";
import { agregar, borrar, listar } from "@/lib/schedule";

export async function GET() {
  const sessionId = await getSessionId();
  if (!sessionId) return NextResponse.json({ requiresAuth: true, items: [] });
  return NextResponse.json({ items: listar(sessionId) });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      videoId?: string;
      url?: string;
      canal?: string;
      titulo?: string;
      publishAt?: string;
    };

    if (!body.publishAt) {
      return NextResponse.json({ error: "Falta la fecha de publicación." }, { status: 400 });
    }

    const sessionId = await getSessionId();
    if (!sessionId) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });
    const item = agregar({
      sessionId,
      videoId: body.videoId ?? "",
      url: body.url ?? "",
      canal: body.canal ?? "",
      titulo: body.titulo ?? "",
      publishAt: new Date(body.publishAt).toISOString(),
    });

    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

  const sessionId = await getSessionId();
  if (!sessionId) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });
  const ok = borrar(id, sessionId);
  return NextResponse.json({ ok, items: listar(sessionId) });
}
