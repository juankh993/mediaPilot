# IA disponible — 2026-11-11

## Llave

- **Se volvió a la key anterior** (2026-11-11): la nueva se probó y **no desbloquea imagen ni video**.
  Verificado con la key nueva: `gemini-3.1-flash-lite-image` y `gemini-2.5-flash-image` devuelven
  `RESOURCE_EXHAUSTED` (cuota 0) y `veo-*` devuelve **404** (no existe para esa llave).
- **Una suscripción Gemini Plus / cuenta de estudiante NO da cuota de API.** El plan del consumidor
  y la API de AI Studio son productos distintos: la cuota gratis de la API (texto/TTS) es aparte y
  la de imagen/video es 0 hasta activar facturación en el proyecto.
- La key nueva quedó guardada en `.google-ai.key.bak` por si se activa facturación más adelante.
- La key restaurada se volvió a probar con TTS: **OK** (2,5 s de audio en 3,7 s).
- El proyecto está en **free tier**: texto y TTS funcionan; **imagen y video tienen límite 0**.
- Gasto actual: **US$ 0** (las pruebas de imagen/video fueron rechazadas, no se facturó).

## Matriz de acceso

| Capacidad | Modelo | Acceso hoy | Contexto | Precio (paid) |
|---|---|---|---|---|
| Texto | `gemini-3.5-flash` | Sí (free) | 1M / 65k | US$0,75 / 3,75 por 1M tokens |
| Texto | `gemini-3.8-flash` | Sí (free) | 1M / 65k | US$0,75 / 3,75 por 1M tokens |
| Texto | `gemini-3.1-pro-preview` | No (paid) | 1M / 65k | US$2 / 12 por 1M tokens |
| Imagen | `gemini-nano-banana-2.1` | No (free limit 0) | 65k | 1K US$0,0336 · 2K US$0,0504 · 4K US$0,113 |
| Imagen | `gemini-3.1-flash-image` | No | 65k | 1K US$0,067 · 2K US$0,101 · 4K US$0,151 |
| Imagen | `gemini-3.1-flash-lite-image` | No | 65k | 1K US$0,0336 |
| Imagen | `gemini-3-pro-image` | No | 131k | 1K/2K US$0,134 · 4K US$0,24 |
| Imagen | `gemini-2.5-flash-image` | No | 32k | US$0,039 (se apaga en mar-2027) |
| Video | `gemini-omni-1.2-flash` | **No (solo paid)** | — | ~US$0,07/s 720p · US$0,104/s 1080p · US$0,209/s 4K |
| Video | `veo-*` | **404** (no existe para esta llave) | — | — |
| Voz | `gemini-2.5-flash-preview-tts` | **Sí (free)** | 8k / 16k | ~US$0,00016/s (Pro); Flash más barato |
| Voz | `gemini-3.8-flash-tts` | Verificar free | 8k / 16k | — |

> "Free limit 0" salió del 429 de Google: `generate_content_free_tier_requests, limit: 0`.
> Para usar imagen/video hay que **activar facturación** en el proyecto de AI Studio.

## Costo por reel

| Configuración | Costo |
|---|---|
| Stock + simulación propia + TTS free | **US$0** |
| 4 imágenes IA (Nano Banana 2 Lite 1K) | 4 × 0,0336 = **US$0,13** |
| 1 clip de 10 s (Omni 720p) | **US$0,70** |
| Reel con 4 imágenes + 10 s de video | **US$0,83** |
| 30 reels/mes con imágenes IA | ~US$4 |
| 30 reels/mes con video IA | ~US$25 |

## Capacidad

- **Free:** TTS ~10 pedidos/día (el límite real se ve en `ai.dev/rate-limit`), texto libre. Como
  imagen y video están en 0, el techo es **10 reels/día** usando stock/simulación.
- **Pago:** 20-30 reels/día; el cuello de botella pasa a ser el render local (~5 min por reel)
  y la escritura/verificación de guiones, no la API.
- **Contexto:** 1M tokens ≈ 700.000 palabras. Un guion de 120 palabras usa <1.000 tokens:
  el contexto no es límite para este canal.

## Decisión

1. **Quedarse en free** para texto y TTS; no pagar imagen/video todavía.
2. Si se activa facturación, empezar por **Nano Banana 2 Lite** para miniaturas e insertos
   (US$0,03 por imagen), no por video.
3. **Omni/video solo para el gancho** (5-8 s), nunca para todo el reel: 10 s cuestan US$0,70.
4. El formato que mejor retiene (espacio + simulación) no necesita IA de imagen: se hace con
   NASA + `scripts/sim-*.py`.

## Panel web

- La salida del panel ahora va a `06-salida/panel/<fecha>/` (antes pisaba `06-salida/<fecha>`).
- `reel.ps1` acepta `-OutDir` para separar la salida.
- Probado con `prueba.json`: `06-salida/panel/_test/prueba-sin-motor.mp4`.
