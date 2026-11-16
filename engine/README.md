# engine/ — motor de render

Scripts que el panel ejecuta para convertir un plan (JSON) en un MP4 vertical.
El panel **no reimplementa** el montaje: lo orquesta.

## Contrato con el panel

`lib/render.ts` lanza los scripts con **cwd = `WORKSPACE_DIR`** y rutas relativas:

```powershell
# render completo
powershell -File <ENGINE_DIR>/reel.ps1 -Config 01-guiones/<fecha>/<id>.json

# normalizacion final (el panel ya normaliza dentro de reel.ps1, esto es refuerzo)
powershell -File <ENGINE_DIR>/fix-loudness.ps1 -Entrada 06-salida/<fecha>/panel/<id>.mp4

# material nuevo cuando la biblioteca no alcanza
powershell -File <ENGINE_DIR>/buscar-unsplash.ps1 -Query "hospital corridor" -Cantidad 2 -Orientacion vertical -Salida 03-visual/panel/<busqueda>
```

Por eso los scripts:

- resuelven sus propios helpers con `$PSScriptRoot` (no asumen `./scripts`);
- escriben voz y temporales en `02-voz/` y `logs/` del workspace;
- aceptan `salida: "panel/<id>.mp4"` y crean la subcarpeta.

## Requisitos

- **FFmpeg** en el PATH (con `ffprobe` y `libass`).
- **Python 3.10+** con `edge-tts` (`pip install edge-tts`).
- Windows + PowerShell 5.1 o superior.

## Scripts

| Archivo | Qué hace |
|---|---|
| `reel.ps1` | Voz (edge-tts), subtítulos palabra por palabra, Ken Burns, música, mezcla y loudness |
| `fix-loudness.ps1` | Normaliza a −14 LUFS con true peak −1.5 dBTP |
| `tts-palabras.py` | Genera MP3 + SRT con una palabra por línea |
| `gemini-tts.py` | Voz por Gemini TTS (opcional; requiere `GOOGLE_AI_KEY`) |
| `alinear-srt.py` | Alinea el SRT con Whisper cuando se usa Gemini TTS |
| `detectar-audio.py` | Detecta música dentro de un clip de "motor" |
| `buscar-unsplash.ps1` | Descarga fotos de Unsplash (45–50 req/hora) |
| `buscar-fotos.ps1` | Descarga fotos de Pixabay (respaldo) |

## Claves de las fuentes

Orden de búsqueda:

1. Parámetro `-Key`
2. Variables de entorno `UNSPLASH_KEY` / `UNSPLASH_ACCESS_KEY` (o `PIXABAY_KEY` / `PIXABAY_API_KEY`)
3. `engine/.unsplash.key` y `engine/.pixabay.key`

Los archivos `.key` están en `.gitignore`: nunca se versionan.

## Probar sin el panel

```powershell
cd ..\workspace
..\engine\reel.ps1 -Config 01-guiones\<fecha>\<id>.json -DryRun   # valida y calcula tiempos
..\engine\reel.ps1 -Config 01-guiones\<fecha>\<id>.json            # render real
```

La salida queda en `06-salida/<fecha>/panel/<id>.mp4`.
