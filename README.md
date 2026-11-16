# MediaPilot

Panel web para **producir y publicar video corto con IA**, sin depender de una temática.
Funciona para autos, ciencia, historia, comida o lo que el cliente quiera.

El flujo completo:

```text
Chat: "quiero un reel de 30 segundos sobre X"
  → la IA devuelve un plan de producción (gancho, guion, escenas)
  → el panel busca el material, genera la voz y monta el video
  → preview listo para revisar
  → publicación en YouTube (ahora o programada)
```

---

## Arrancar

```powershell
npm install
npm run dev
```

Abrir `http://localhost:3000` y crear una cuenta.

---

## Configuración

Copiar la plantilla y completar lo que se use:

```powershell
Copy-Item .env.example .env.local
```

Lo mínimo:

```ini
APP_SECRET=...                 # firma de las sesiones

WORKSPACE_DIR=./workspace      # dónde viven guiones, material y renders
ENGINE_DIR=./engine            # dónde están los scripts de render

YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...

OPENROUTER_KEY=...
DEEPSEEK_MODELO=deepseek/deepseek-v4.1-flash-1017
```

### Workspace y motor

El panel separa dos cosas:

| Variable | Qué contiene |
|---|---|
| `WORKSPACE_DIR` | Guiones, material visual, música y videos renderizados. **Un workspace por canal/cliente.** |
| `ENGINE_DIR` | Los scripts de render (`reel.ps1`, `tts-palabras.py`, `fix-loudness.ps1`…). Vienen incluidos en `engine/`. |

Así el mismo panel sirve para varios canales sin tocar el código: solo cambia el workspace.
El detalle del motor y su contrato con el panel están en `engine/README.md`.

Estructura del workspace:

```text
workspace/
├── 01-guiones/     configuraciones de cada reel (JSON)
├── 02-voz/         audio de la voz y subtítulos (.mp3 / .srt)
├── 03-visual/      fotos y clips
├── 05-musica/      pistas de fondo
├── 06-salida/      videos finales (los del panel van a panel/)
└── logs/           temporales del render
```

---

## Qué hace hoy

| Módulo | Estado |
|---|---|
| Registro y login (scrypt + cookie firmada) | ✅ |
| Datos separados por usuario | ✅ |
| Chat con IA (DeepSeek V4.1 Flash, respaldo Gemini) | ✅ |
| Plan de producción a partir de una idea | ✅ |
| Editor de guion (gancho, guion, escenas) | ✅ |
| Render automático con voz, subtítulos y música | ✅ |
| Resolvedor de material (biblioteca local + Unsplash/Pixabay) | ✅ |
| Preview y estimado de tiempo | ✅ |
| Conexión de YouTube multi-usuario (OAuth) | ✅ |
| Subida con título, descripción, tags y miniatura | ✅ |
| Publicación programada (`publishAt`) y calendario | ✅ |
| Instagram / TikTok / Facebook | ⏳ |
| Exportación CapCut | ⏳ |

---

## Endpoints

| Ruta | Método | Qué hace |
|---|---|---|
| `/api/auth/registro` · `/api/auth/login` · `/api/auth/logout` · `/api/auth/me` | POST/GET | Cuentas y sesión |
| `/api/chat` | POST | DeepSeek → Gemini → modo local |
| `/api/render` | POST / GET | Inicia un render / consulta estado |
| `/api/render/file` | GET | Entrega el MP4 |
| `/api/youtube/status` | GET/POST | Canales del usuario / desconectar |
| `/api/youtube/upload` | POST | Sube el video (y programa si se pide) |
| `/api/youtube/oauth/{start,callback}` | GET | Conexión con Google |
| `/api/schedule` | GET/POST/DELETE | Agenda de publicaciones |

---

## Seguridad

- Contraseñas con **scrypt**, nunca en texto plano.
- Sesión en cookie firmada con HMAC-SHA256 (`APP_SECRET`).
- Tokens de YouTube en `data/`, **jamás** en el navegador.
- Cada usuario ve solo sus canales, su agenda y sus proyectos.
- Las rutas de datos responden 401 sin sesión.

Para producción: activar `secure: true` en la cookie (HTTPS), límite de intentos de login,
recuperación de contraseña y base de datos real en vez de archivos JSON.

---

## Documentación

- `docs/DESARROLLO.md` — arquitectura, decisiones, bitácora y pendientes
- `docs/GOOGLE-CLOUD-PRODUCCION.md` — cómo configurar la API para producción
- `docs/IA-MODELOS.md` — qué modelos hay, qué cuesta cada uno y qué está habilitado
- `engine/README.md` — motor de render: contrato con el panel, requisitos y scripts

---

## Requisitos

- **Node.js 20+**
- **FFmpeg** en el PATH
- **Python 3.10+** con `edge-tts` (voz) — solo si se usa el motor de render incluido
- Windows para el motor en PowerShell (los scripts son `.ps1`)
