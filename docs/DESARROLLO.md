# DESARROLLO — bitácora del panel MediaPilot

> Documento vivo. Se actualiza en cada sesión de trabajo.
> Repo: `proyectoReelsVariado` · Rama del panel: `feature/panel-web`

---

## 1. Qué es

**MediaPilot** es un panel web para **crear y publicar video corto con IA**, sin depender
de una temática. Sirve para autos, ciencia, historia, comida o lo que el usuario quiera.

La idea no es subir videos hechos a mano: es **pedirle un reel al asistente y que el panel lo
produzca** (guion → voz → visuales → subtítulos → render → publicación).

---

## 2. Estado actual

| Módulo | Estado | Nota |
|---|---|---|
| Panel responsive (Estudio / Proyectos / Calendario / Cuentas) | ✅ | |
| **Login de usuarios (registro + sesión firmada)** | ✅ | |
| Carga de video + preview con scrubber | ✅ | También recibe el render del panel |
| Formatos 9:16 · 16:9 · 1:1 | ✅ | |
| Biblioteca de activos del proyecto | ✅ | Solo nombres y tamaños por ahora |
| Chat con IA | ✅ | DeepSeek V4.1 Flash 1017 |
| Conexión de YouTube multi-usuario | ✅ | Una cuenta por sesión, varios canales |
| Estado del canal en vivo | ✅ | subs, videos, vistas, avatar |
| Subida real a YouTube + miniatura | ✅ | Endpoint resumible |
| **Generación del reel desde el panel** | ✅ | Plan del chat → eel.ps1 → MP4 en la preview |
| Conectores Instagram / TikTok / Facebook | ⏳ | Siguiente |
| Calendario + publicación programada (YouTube publishAt) | ✅ | |
| Exportación CapCut | ⏳ | Último, a pedido del usuario |

---

## 3. Arquitectura

```text
web/
├── app/
│   ├── page.tsx                  panel completo (client component)
│   ├── globals.css               estilos
│   └── api/
│       ├── chat/route.ts         DeepSeek → Gemini → local
│       └── youtube/
│           ├── status/           lista de canales de la sesión
│           ├── upload/           subida resumible + miniatura
│           └── oauth/
│               ├── start/        redirige a Google
│               └── callback/     canjea código y guarda el canal
├── lib/
│   ├── config.ts                 rutas y lectura de entorno
│   ├── session.ts                cookie mp_sid
│   ├── accounts.ts               canales por sesión (JSON)
│   ├── oauth.ts                  redirect URI
│   └── youtube.ts                refresh, canal, subida, miniatura
└── data/                         accounts.json y subidas (gitignored)
```

### Modelo de datos de un canal

```json
{
  "id": "79800274c9ff6b44",
  "sessionId": "abc123...",
  "channelId": "UC_MqXv0irkUqYphEU8LXuOA",
  "title": "Datoneta",
  "thumbnail": "https://yt3.ggpht.com/...",
  "subscribers": "15",
  "videos": "4",
  "views": "1246",
  "refresh_token": "1//0g...",
  "access_token": "ya29...",
  "expires_at": 1760000000000,
  "createdAt": "2026-11-11T03:09:55.205Z",
  "shared": false
}
```

`sessionId: "*"` = canal del servidor, visible para todos (se usa para migrar el token viejo).

---

## 4. Decisiones técnicas y por qué

| Decisión | Motivo |
|---|---|
| **Next.js 16 (App Router)** | Front y backend en un solo proyecto, un solo `npm run dev`, deploy simple |
| **`cacheComponents: false`** | Las rutas leen/escriben archivos en cada request; Next 16 no permite `runtime` ni `dynamic` con cacheComponents activo |
| **Cookie `mp_sid` por navegador** | Cada usuario conecta su YouTube sin pisar el de otro |
| **Tokens en `web/data/`** | Nunca viajan al navegador; `data/` está en `.gitignore` |
| **DeepSeek V4.1 Flash 1017** vía OpenRouter | Es el modelo que se usa en la sesión; rápido y barato |
| **Cadena de respaldo** DeepSeek → Gemini → local | El chat nunca se queda mudo |
| **Subida resumible** (`uploadType=resumable`) | Permite archivos grandes y reintentos |
| **Migración automática del token viejo** | `data/tokens.json` se convierte en cuenta compartida la primera vez |

### Errores que ya nos costaron tiempo

1. **Next 16 + `cacheComponents`** → `export const runtime` y `export const dynamic` **no compilan**.
   Se desactivó `cacheComponents` en `next.config.ts`.
2. **`gemini-flash-latest` devuelve 503** con frecuencia y **`gemini-2.5-flash` ya no está
   disponible para cuentas nuevas** → modelo por defecto `gemini-3.5-flash`, con cadena de fallback.
3. **El endpoint de OpenCode Go exige `x-opencode-session`** y la clave de `auth.json` no sirve
   para consumo directo desde una app; **OpenRouter sí** con el modelo `deepseek/deepseek-v4.1-flash-1017`.

---

## 5. Cómo correr el panel

```powershell
cd web
npm install          # solo la primera vez
npm run dev
```

Abrir `http://localhost:3000`.

### Variables de entorno (`web/.env.local`)

```ini
APP_SECRET=...                              # firma de sesiones

YOUTUBE_CLIENT_ID=...                       # Google Cloud
YOUTUBE_CLIENT_SECRET=...
# YOUTUBE_REDIRECT_URI=http://localhost:3000/api/youtube/oauth/callback

OPENROUTER_KEY=sk-or-v1-...                 # chat principal
DEEPSEEK_MODELO=deepseek/deepseek-v4.1-flash-1017

GOOGLE_AI_KEY=...                           # respaldo del chat + TTS/Veo
GEMINI_MODELO=gemini-3.5-flash
```

`.env.local` y `data/` están en `.gitignore`. La plantilla pública es `.env.example`.

---

## 6. Conexión de YouTube (flujo actual)

```text
Usuario → "Conectar canal"
   → GET /api/youtube/oauth/start
   → Google (consent + select_account)
   → GET /api/youtube/oauth/callback
   → canjea código por refresh_token
   → lee el canal (channels?mine=true)
   → guarda la cuenta asociada a la cookie mp_sid
   → vuelve al panel con ?conectado=1
```

- El cliente OAuth debe ser de tipo **Aplicación de escritorio** para que `localhost` funcione
  en cualquier puerto sin registrar cada URI.
- `prompt=consent select_account` garantiza refresh token **y** que el usuario pueda elegir cuenta.
- Al publicar se elige el canal cuando hay más de uno.

---

## 7. Diseño del render (lo que sigue)

El panel **no reemplaza** el pipeline existente: lo **orquesta**.

```text
Chat: "quiero un reel sobre un creepypasta nocturno"
   ↓
La IA devuelve un PLAN estructurado (no solo prosa):
   {
     "titulo": "...",
     "gancho": "NO MIRES\nEL PORTERO",
     "vozTexto": "...",
     "escenas": [
       { "tipo": "foto", "archivo": "...", "dur": 6, "zoom": "in", "modo": "blurfill" },
       { "tipo": "video", "archivo": "...", "desde": 0, "dur": 8, "zoom": "out" }
     ],
     "musica": { "archivo": "05-musica/....mp3", "vol": 0.15 }
   }
   ↓
El panel escribe 01-guiones/<fecha>/<id>.json
   ↓
Ejecuta  scripts/reel.ps1 -Config <json>
   ↓
Ejecuta  scripts/fix-loudness.ps1 -Entrada <mp4>
   ↓
Preview muestra el MP4 generado
   ↓
"Publicar" → sube el render (no un archivo que subió el usuario)
```

### De dónde salen los visuales (lo que el proyecto ya tiene)

| Fuente | Script | Uso |
|---|---|---|
| NASA / ESA | `scripts/buscar-nasa.ps1` | Espacio, ciencia |
| Unsplash | `scripts/buscar-unsplash.ps1` | Fotos genéricas |
| Pixabay | `scripts/buscar-fotos.ps1`, `buscar-clips.ps1` | Fotos y clips |
| Propios | `03-visual/` | Material del usuario |
| Música | `05-musica/` | Pistas libres de reclamos |

**No hay generación de video con IA todavía** (falta modelo de video). Cuando se agregue,
se suma como una escena más: `{ "tipo": "ia", "prompt": "...", "dur": 5 }`.

### Lo que falta para cerrarlo

1. `POST /api/render` → recibe el plan, escribe el JSON y lanza `reel.ps1`.
2. Streaming del progreso (Server-Sent Events o polling de estado).
3. `GET /api/render/:id` → estado y ruta del MP4.
4. Botón "Generar reel" en el Estudio que use el plan que devolvió el chat.
5. Que el chat emita el plan en un bloque reconocible (` ```plan `) para parsearlo.

---

## 8. Bitácora

### 2026-11-10 — miniaturas y Kokoro (repo de Furia)

- Miniatura de Shorts: YouTube recorta las tarjetas al centro → **se genera vertical 1080x1920**.
- `scripts/miniatura.ps1` con formatos `vertical` (defecto), `cuadrado` y `horizontal`.
- Kokoro TTS medido: RTF 3,2-5,7 en el i3 (2-3 min por reel). Viable para 1 reel/día,
  no para lotes. Muestras en `06-salida/_muestras-voz/`.

### 2026-11-11 — panel: YouTube multi-usuario + DeepSeek

- Se creó `web/` (Next.js 16 + React 19).
- Chat con DeepSeek V4.1 Flash 1017 (OpenRouter), con respaldo Gemini y local.
- Conexión de YouTube por sesión, varios canales, desconectar, guía in-app.
- Verificado: OAuth genera la URL correcta de Google; el canal Datoneta se lee en vivo
  (15 subs · 4 videos · 1.246 vistas).
- **Pendiente de ajuste:** el chat respondía con un guion "listo para copiar" cuando el panel
  debe producir el reel. Se cambió el prompt para que entregue un **plan de producción** y
  explique que el render viene después.

---

## 9. Riesgos y pendientes

| Riesgo | Estado |
|---|---|
| Cuota de YouTube: **10.000 unidades/día**, y un `videos.insert` cuesta **1.600** → ~6 subidas/día | Documentar y avisar en la UI |
| App de Google en modo **Prueba**: máximo 100 usuarios de prueba | Ver `GOOGLE-CLOUD-PRODUCCION.md` |
| `web/data/` sin cifrar | Aceptable en local; en producción usar DB + cifrado |
| Sin autenticación de usuarios | Cualquiera con la URL crea su sesión. Hace falta login antes de exponerlo a internet |
| Render en Windows (PowerShell + FFmpeg) | El server tiene que correr en la máquina del usuario |
| Sin generación de video IA | Se resuelve cuando haya modelo de video |

---

## 10. Próximos pasos (orden acordado con el usuario)

1. **Conectores**: Instagram (ya probado en el repo de Furia), luego Facebook y TikTok.
2. **Render desde el panel**: plan del chat → `reel.ps1` → preview.
3. **Calendario**: programar publicaciones.
4. **Exportación CapCut**: al final.

### 2026-11-11 (cont.) — el chat pasa a producir PLANES, no guiones

- El usuario detecto que el chat devolvia un guion "listo para copiar" con marcas de tiempo,
  cuando el panel tiene que **producir el reel**, no entregar texto.
- Se reescribio el prompt del sistema: ahora conoce el producto (guion -> voz -> visuales ->
  subtitulos -> render -> publicacion), sabe que **no hay modelo de video IA** y que los visuales
  salen de NASA/Unsplash/Pixabay/Pexels + archivo propio.
- Cuando piden un reel, devuelve **un bloque ```plan con JSON**: titulo, gancho, vozTexto,
  duracion, escenas[{n,descripcion,busqueda,dur,movimiento}], musica y cierre.
- `extraerPlan()` lo detecta en el backend y lo devuelve en `plan`; la UI lo muestra como
  "PLAN DE PRODUCCION LISTO" con boton **Generar reel** (apagado hasta la fase de render).
- ⚠️ **max_tokens**: con 700 el JSON se cortaba a la mitad y no se detectaba el plan.
  Subido a **2000** en DeepSeek y Gemini.
- Flujo de trabajo elegido: **el plan usa `busqueda` en ingles**, no rutas de archivo: el renderer
  resuelve el material despues (asi el modelo no inventa archivos que no existen).

### 2026-11-11 (cont. 2) — RENDER IMPLEMENTADO

El chat ya no entrega solo el plan: el panel **produce el MP4**.

Flujo completo:

```text
Chat "quiero un reel sobre X"
  → DeepSeek devuelve ```plan (JSON)
  → tarjeta "PLAN DE PRODUCCION LISTO" + boton Generar reel
  → POST /api/render
      → escanea 03-visual/ y elige material por palabras clave (lib/material.ts)
      → escribe 01-guiones/<fecha>/<id>.json en el formato de reel.ps1
      → ejecuta scripts/reel.ps1 -Config ...   (voz edge + Ken Burns + subtitulos)
      → ejecuta scripts/fix-loudness.ps1       (-14 LUFS)
  → GET /api/render?id=... (polling cada 2,5s)
  → GET /api/render/file?id=... sirve el MP4
  → la preview lo muestra y "Publicar" lo sube a YouTube
```

Archivos nuevos:
- `web/lib/material.ts` — escanea `03-visual/`, puntua nombres contra la busqueda de cada escena.
- `web/lib/render.ts` — arma la config, lanza los scripts, guarda el estado del trabajo.
- `web/app/api/render/route.ts` — POST inicia / GET consulta estado.
- `web/app/api/render/file/route.ts` — entrega el MP4.

Decisiones:
- **El plan declara `busqueda`, no archivos.** El resolver elige material real; si no hay match,
  usa el primero libre (nunca queda una escena vacia).
- **Fix de duracion:** `reel.ps1` aborta si los planos fijos suman mas que la voz.
  Se estima la voz (13 caracteres/segundo) y se escalan los planos fijos al 62% de esa duracion;
  si igual falla, **se reintenta hasta 2 veces** con planos mas cortos (factor 0,55).
- **La salida usa el id del trabajo** (`<fecha>-<slug>-<random>.mp4`), asi no se pisan los renders.
- La musica se toma al azar de `05-musica/` al 14%.

Prueba real (2026-11-10):
- Plan de 4 escenas, 18s pedidos → **12,9s** (la voz manda).
- Salida 1080x1920, h264+aac, 7,7 MB, **-14,5 LUFS / -1,5 dBTP**.
- Gancho, subtitulos palabra por palabra y musica: OK.

Limitacion conocida: el resolver puede elegir capturas de infografias (con texto ya impreso)
porque solo mira nombres de archivo. Mejora pendiente: puntuar por contenido o por carpeta.

### 2026-11-11 — fix del resolvedor, editor de guion y estimado de tiempo

**BUG reportado por el usuario:** el reel sobre un creepypasta nocturno arrancaba con
**dos agujeros negros**. Causa exacta: en `elegirMaterial`, si ninguna palabra de la busqueda
coincidia con el nombre de un archivo, el codigo hacia
`candidatos.find(m => !usados.has(m.ruta))` -> **el primer archivo del recorrido**, que era
`03-visual/clips/bh-2d.mp4` (el clip de agujeros negros del reel anterior).
Ademas el umbral era 0, asi que "old" hacia match con `old-battery-1.jpg` (una pila para "ascensor").

**Correcciones:**
1. **Puntaje minimo 2**: ya no se acepta cualquier coincidencia debil.
2. **Si no hay material local -> se DESCARGA** para esa busqueda con `buscar-unsplash.ps1`
   (respaldo `buscar-fotos.ps1`), orientacion vertical, cantidad 2, en `03-visual/panel/`.
   Maximo 6 descargas por render.
3. **Reserva segura**: si tampoco hay descarga, solo se usan fotos de `03-visual/fotos/`
   (nunca clips ni infografias de la NASA con texto quemado).
4. **Variedad**: se penaliza repetir la carpeta de la escena anterior y nunca se repite archivo.
5. **Palabras vacias** (the, night, dark, close...) fuera del puntaje: generaban falsos positivos.

Medido en el mismo caso: antes 1 clip de agujero negro + 1 pila + la misma cara 3 veces;
ahora pasillo de hospital, reloj de pared, pasillo con luz al fondo y ojo por la rendija
(los ultimos descargados de Unsplash).

**Editor de guion:** boton **Editar guion** en la tarjeta del plan. Permite cambiar titulo,
gancho, guion, cierre, duracion y, por escena, la descripcion, la busqueda y los segundos.
Al guardar se actualiza el plan y se vuelve a generar.

**Estimado de tiempo:** el trabajo expone `estimadoSegundos`. Calibrado con dos renders reales
(i3-7100U): 13s/4 escenas ~= 180s; 30s/6 escenas ~= **548s** (el montaje con `zoompan` es lo que
mas tarda). Formula: `45 + audio*12 + escenas*20`. La barra ahora avanza por tiempo entre hitos
para no quedarse clavada en 75%.

Límite conocido: la **última escena absorbe todo el tiempo restante**, asi que si la voz es
mucho mas larga que las escenas, el ultimo plano puede quedar de 8-10s quieto. Mejora pendiente:
repartir el sobrante en escenas extra.

---

## ⏭️ PENDIENTES PARA MAÑANA (cierre del 11-nov-2026)

### 1. ✅ RESUELTO: la última escena absorbe todo el tiempo sobrante

**Síntoma:** si el guion es más largo que la suma de las escenas, la última queda quieta
8-10 segundos (en el reel del creepypasta, la cara del chico al final).

**Causa:** en `construirConfig` (web/lib/render.ts) la última escena se marca con `dur: null`
y `reel.ps1` le da todo el resto.

**Arreglo propuesto:**
1. Estimar la duración real de la voz (ya se hace: `vozTexto.length / 13`).
2. Al construir el visual, calcular el sobrante = `estimadoVoz - suma(fijas)`.
3. Si el sobrante > 6s, **insertar escenas extra** con material genérico o repetir búsquedas
   de la misma escena con otra foto, hasta cubrir el sobrante en tramos de 3-5s.
4. Solo entonces la última queda con `dur: null` y un sobrante pequeño.

**Alternativa:** modificar `scripts/reel.ps1` para que reparta el sobrante entre las escenas
en vez de dárselo todo a la última.

### 2. Orden acordado con el usuario

| # | Tarea | Estado |
|---|---|---|
| 1 | ~~Límite de la última escena~~ | ✅ **resuelto** (ver entrada del 11-nov) |
| 2 | Conectores: Instagram (ya probado en el repo de Furia), Facebook, TikTok | pendiente |
| 3 | Calendario de publicaciones | pendiente |
| 4 | Exportación CapCut | último |

### 3. Detalles sueltos

- El **estimado de tiempo** quedó calibrado (45 + audio*12 + escenas*20). Con 6 escenas y 30s
  el render tarda ~9 min en el i3. Si se nota lento, la opción es bajar la resolución de trabajo
  del `zoompan` o generar los planos en paralelo.
- **Unsplash**: 50 peticiones/hora. El render hace como máximo 6 descargas; si se hacen muchos
  renders seguidos puede toparse con el límite y caer al respaldo de Pixabay.
- `03-visual/panel/` acumula todo lo descargado por el panel. Conviene una limpieza periódica
  (los archivos `_fuentes-*.txt` son la atribución obligatoria de Unsplash: no borrarlos si el
  material se usa en un video publicado).
- El editor de guion todavía no permite **agregar o quitar** escenas, solo editarlas.
- `panel-web/` (el prototipo estático) sigue en la rama; se puede borrar cuando el panel Next
  esté completo.

### 4. Estado de los repos al cerrar

- `proyectoReels` (Furia Nation) → rama `main`, limpio, pusheado.
- `proyectoReelsVariado` (canal nuevo + panel) → rama `feature/panel-web`, limpio.
- El panel se levanta con `cd web ; npm run dev` → http://localhost:3000

### 2026-11-11 — reparto del tiempo: la última escena ya no se queda con todo

**Problema:** la última escena absorbía todo el sobrante (8-10s quietos). En el reel del
creepypasta, la cara del chico al final duraba ~9s.

**Solución implementada (web/lib/render.ts):**
1. `duracionEstimada(plan)` = gancho (1,8) + entrada de voz (0,3) + voz + cola (0,8).
2. **Velocidad de voz calibrada**: medido con edge-tts en español, **15,8 caracteres/segundo**
   (antes se usaban 13 -> se sobreestimaba la voz en ~5s y la última escena quedaba de 0,6s).
   Se usa `CHARS_POR_SEGUNDO = 15.5`.
3. Si el sobrante para la última escena supera **6s**, se **insertan escenas extra** de 4s
   ANTES de la última, ciclando por las búsquedas del plan.
4. Las escenas extra vuelven sobre **el mismo tema**: `soloCarpeta` obliga a usar material de
   la misma carpeta. Si no queda, se descarga otra tanda de la misma búsqueda.
   (Sin esto, la escena extra metió **un hipopótamo** en una historia de hospital.)
5. Cada descarga va a **su propia carpeta** `03-visual/panel/<busqueda>/`, así "otra toma del
   mismo tema" encuentra material coherente.

**Resultado medido (mismo guion, 355 caracteres, 25,3s de voz):**
| | Antes | Ahora |
|---|---|---|
| Escenas | 6 | 6 |
| Planos fijos | 21,2s | 20,3s |
| **Última escena** | **~9s** | **~5s** |
| Escena extra | hipopótamo 🦛 | no hizo falta |

Si el guion crece, se agregan extras de 4s hasta que el sobrante quede ≤ 6s.

**Nota:** la estimación es estática (no se conoce la duración real de la voz hasta que corre el TTS).
Si la voz sale más larga, la última absorbe un poco; si sale más corta, el script de render
reintenta solo con planos más cortos (factor 0,55).

### 2026-11-11 — Calendario + publicación programada en YouTube

**Funciona:**
- Checkbox **«Publicar más tarde»** en el modal de publicación + selector de fecha y hora.
- El video se sube con `privacyStatus: private` y `publishAt` (ISO UTC): **YouTube lo hace
  público solo a esa hora**, sin que el panel tenga que estar encendido.
- El calendario lista lo programado (fecha, hora, canal, título, enlace) y permite quitarlo.
- Validaciones: la fecha tiene que ser al menos 1 minuto en el futuro; se rechaza antes de
  tocar la API de YouTube.
- Guardado en `web/data/schedule.json` por sesión (igual que las cuentas).

**Endpoints nuevos:** `GET/POST/DELETE /api/schedule`.

**Probado:** alta, listado, borrado y rechazo de fecha pasada (sin llegar a subir nada).

Nota: la API de YouTube no deja *editar* la hora de un video programado después de subirlo;
para cambiarla hay que borrar y volver a subir.

### 2026-11-11 — FIX: los renders del panel pisaban archivos

**Reporte del usuario:** "la creacion de videos a traves del panel web nos esta pisando algunos videos".

**Causas encontradas (tres):**

1. **Los renders del panel caian en la MISMA carpeta que los videos del canal.**
   `salida` era `<id>.mp4` dentro de `06-salida/<fecha>/`, mezclado con `galan.mp4`, `parker.mp4`, etc.
   → Ahora van a **`06-salida/<fecha>/panel/<id>.mp4`** (subcarpeta propia). Nunca chocan.

2. **`buscar-fotos.ps1` borraba lo descargado antes.**
   Tenia `Get-ChildItem $Salida -Filter "$slug-*.jpg" | Remove-Item -Force` en cada corrida:
   cada busqueda nueva **eliminaba las imagenes anteriores de esa misma busqueda**.
   → Ahora solo borra con el switch **`-Limpiar`** (por defecto acumula material).

3. **`buscar-unsplash.ps1` sobrescribia los archivos.**
   Numeraba desde 1 en cada corrida (`unsplash-<slug>-1.jpg`, `-2.jpg`...) y **machacaba los anteriores**.
   → Ahora cuenta los que ya existen y **sigue numerando** desde ahi.

**Verificado (2026-11-11):** se corrio un render completo desde el panel y se compararon
las 24 peliculas de `06-salida/` antes y despues:
- **Ningun video existente fue modificado** ✅
- Un solo archivo nuevo: `06-salida/2026-11-11/panel/2026-11-11-prueba-de-render-7fti.mp4`
- Material descargado: de 9 a 15 archivos, **sin perder ninguno** ✅

**Regla nueva:** lo que genera el panel vive en `panel/` (videos) y en `03-visual/panel/<busqueda>/`
(material). El resto del repo queda intacto.

### 2026-11-11 — Login de usuarios (base para el multiusuario)

**Que se agrego:**
- Registro y login con email + contrasena. Hash con **scrypt** (nativo de Node, sin dependencias).
- Sesion = cookie `mp_sid` firmada con HMAC-SHA256 usando `APP_SECRET` (`userId.firma`).
  Si alguien manipula la cookie, la firma no valida y queda sin sesion.
- **Todas las rutas de datos exigen login**: `youtube/status`, `youtube/upload`, `schedule`,
  `youtube/oauth/callback`. Sin sesion devuelven `401` o `requiresAuth: true`.
- Cada usuario ve **solo sus canales, su agenda y sus proyectos** (los datos se indexan por `userId`).
- Pantalla de entrada (`app/entrar.tsx`) con pestanas Entrar / Crear cuenta; si no hay usuarios
  todavia, abre directamente en "Crear cuenta".
- En la barra lateral se ve el nombre, el email y el boton de salir.

**Migracion automatica:** quien ya venia usando el panel con la cookie anonima vieja, al registrarse
o entrar **conserva sus canales y su agenda** (`migrarCuentas` / `migrarAgenda` reasignan los datos
de la sesion anonima al usuario nuevo).

**Endpoints nuevos:** `POST /api/auth/registro`, `POST /api/auth/login`, `POST /api/auth/logout`,
`GET /api/auth/me`.

**Probado:** sin sesion los datos dan 401 · registro · login con clave incorrecta (401) ·
cookie manipulada (rechazada) · logout · y al entrar se ven los canales del usuario.

**Pendiente para produccion:**
- Activar `secure: true` en la cookie (requiere HTTPS) — esta marcado en `lib/session.ts`.
- Recuperacion de contrasena (hoy no existe).
- Limite de intentos de login (hoy no hay).
- En produccion conviene mover `users.json`, `accounts.json` y `schedule.json` a una base real.

### 2026-11-16 — motor de render portado a `engine/`

**Problema:** el panel llamaba a `reel.ps1`, `fix-loudness.ps1`, `tts-palabras.py` y los
buscadores en `ENGINE_DIR`, pero esos scripts **no estaban en el repo**. En un clon limpio
"Generar reel" fallaba: no había voz, ni montaje, ni material.

**Qué se hizo:**

- Se copiaron los scripts del repo anterior (rama `feature/panel-web`) a `engine/`:
  `reel.ps1`, `fix-loudness.ps1`, `tts-palabras.py`, `gemini-tts.py`, `alinear-srt.py`,
  `detectar-audio.py`, `buscar-unsplash.ps1`, `buscar-fotos.ps1`.
- **`reel.ps1` ahora resuelve rutas por `$PSScriptRoot`** en vez de asumir `./scripts`,
  porque el panel lo ejecuta con `cwd = WORKSPACE_DIR`. También crea `02-voz/` y `logs/`
  si faltan y la subcarpeta de `salida` (`panel/<id>.mp4`).
- **Claves por variable de entorno o archivo:** `UNSPLASH_KEY` / `PIXABAY_KEY` o
  `engine/.unsplash.key` / `engine/.pixabay.key` (gitignored).
- **`buscar-unsplash.ps1` acepta `-Orientacion vertical`** (la API lo llama `portrait`).
  El panel ya pedía "vertical", así que antes la descarga fallaba en la validación de parámetros.
- **Búsquedas que acumulan:** `buscar-fotos.ps1` ya no borra lo descargado antes (solo con
  `-Limpiar`) y ambos buscadores siguen numerando en vez de pisar archivos.
- `WS` incluye `02-voz` y `logs`, y `iniciarRender` llama a `ensureWorkspace()`.

**Verificado (2026-11-16):** render real de 3 escenas → 9,1s, 1080x1920, h264+aac,
subtítulos y gancho OK, `fix-loudness` deja **−14,4 LUFS / −1,5 dBTP**; descarga de Unsplash
con `-Orientacion vertical` OK. Los scripts de prueba se borraron del workspace.

**Nota de encoding:** los `.ps1` se guardan con **UTF-8 BOM**. Sin BOM, PowerShell 5.1 los lee
como ANSI y rompe los acentos (por ejemplo el CTA o los mensajes).

