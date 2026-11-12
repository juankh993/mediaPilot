"use client";

import { useState } from "react";

type Props = {
  onEntrar: (usuario: { id: string; email: string; nombre: string }) => void;
  hayUsuarios: boolean;
};

export default function Entrar({ onEntrar, hayUsuarios }: Props) {
  const [modo, setModo] = useState<"login" | "registro">(hayUsuarios ? "login" : "registro");
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    try {
      const url = modo === "login" ? "/api/auth/login" : "/api/auth/registro";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, nombre }),
      });
      const data = (await res.json()) as {
        usuario?: { id: string; email: string; nombre: string };
        error?: string;
      };

      if (!res.ok || !data.usuario) {
        setError(data.error || "No se pudo entrar.");
        return;
      }
      onEntrar(data.usuario);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand" style={{ padding: "0 0 6px", justifyContent: "center" }}>
          <span className="brand-mark">✦</span>
          <span>MediaPilot</span>
        </div>
        <p className="auth-sub">Tu panel de producción y publicación de video.</p>

        <div className="auth-tabs">
          <button
            className={modo === "login" ? "active" : ""}
            onClick={() => {
              setModo("login");
              setError(null);
            }}
            type="button"
          >
            Entrar
          </button>
          <button
            className={modo === "registro" ? "active" : ""}
            onClick={() => {
              setModo("registro");
              setError(null);
            }}
            type="button"
          >
            Crear cuenta
          </button>
        </div>

        <form onSubmit={enviar}>
          <div className="field">
            <label>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vos@ejemplo.com"
              autoComplete="email"
              required
            />
          </div>

          {modo === "registro" && (
            <div className="field">
              <label>NOMBRE</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Cómo te llamamos"
                autoComplete="name"
              />
            </div>
          )}

          <div className="field">
            <label>CONTRASEÑA</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={modo === "registro" ? "Mínimo 8 caracteres" : "Tu contraseña"}
              autoComplete={modo === "login" ? "current-password" : "new-password"}
              required
            />
          </div>

          {error && <div className="alert err">{error}</div>}

          <button className="button primary auth-submit" type="submit" disabled={cargando}>
            {cargando ? (
              <>
                <span className="spinner" />
                Entrando…
              </>
            ) : modo === "login" ? (
              "Entrar"
            ) : (
              "Crear mi cuenta"
            )}
          </button>
        </form>

        <p className="auth-pie">
          Cada cuenta ve solo sus canales, sus proyectos y su agenda.
          <br />
          El panel guarda todo en este equipo.
        </p>
      </div>
    </div>
  );
}
