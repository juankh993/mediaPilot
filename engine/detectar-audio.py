# detectar-audio.py - Distingue MOTOR de MUSICA/AMBIENTE en un audio de motor
#
# Uso:
#   python scripts/detectar-audio.py <archivo.mp3|mp4>
#   python scripts/detectar-audio.py <archivo> --verbose
#
# Salida: veredicto por linea + exit code (0 = motor, 1 = sospechoso)
#
# Metricas (sin dependencias externas, PCM 8 kHz mono via ffmpeg):
#   f0_cv        variacion de la frecuencia fundamental (motor sube/baja -> alta)
#   estabilidad  % de frames cuya F0 esta a +-6% de la mediana (musica -> alta)
#   pulso        pico de autocorrelacion del envolvente de ataques 0.3-2 s
#                (musica con ritmo -> alto; motor/ambiente -> bajo)
#   armonia      fuerza media del pico de autocorrelacion (notas claras -> alta)
import os
import re
import struct
import subprocess
import sys
import tempfile

SR = 8000
FLEN = int(SR * 0.040)
HOP = int(SR * 0.020)


def extraer_pcm(ruta):
    tmp = os.path.join(tempfile.gettempdir(), "da_%d.raw" % os.getpid())
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", ruta,
           "-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", tmp]
    subprocess.run(cmd, check=True)
    with open(tmp, "rb") as f:
        datos = f.read()
    os.remove(tmp)
    n = len(datos) // 2
    return struct.unpack("<%dh" % n, datos)


def analizar(ruta):
    s = extraer_pcm(ruta)
    n = len(s)
    if n < FLEN * 4:
        return None

    energias = []
    f0s = []
    armonias = []

    i = 0
    while i + FLEN <= n:
        fr = s[i:i + FLEN]
        m = sum(fr) / FLEN
        fr2 = [x - m for x in fr]
        e = sum(x * x for x in fr2)
        energias.append(e)
        if e > 0:
            mejor_lag, mejor_val = 0, 0.0
            for lag in range(int(SR / 400), int(SR / 45)):
                v = 0.0
                k = 0
                while k < FLEN - lag:
                    v += fr2[k] * fr2[k + lag]
                    k += 2
                v /= (e + 1e-9)
                if v > mejor_val:
                    mejor_val, mejor_lag = v, lag
            if mejor_lag and mejor_val > 0.2:
                f0s.append(SR / mejor_lag)
                armonias.append(mejor_val)
        i += HOP

    if len(f0s) < 20:
        return None

    # percentil robusto de F0
    orden = sorted(f0s)
    mediana = orden[len(orden) // 2]
    cerca = sum(1 for f in f0s if abs(f - mediana) <= 0.06 * mediana) / len(f0s)
    media = sum(f0s) / len(f0s)
    var = sum((f - media) ** 2 for f in f0s) / len(f0s)
    cv = (var ** 0.5) / media if media else 0

    # envolvente de ataques -> autocorrelacion (ritmo)
    env = []
    prev = 0.0
    for e in energias:
        r = e ** 0.5
        env.append(max(0.0, r - prev))
        prev = r
    if env:
        mean_env = sum(env) / len(env)
        env = [x - mean_env for x in env]
        denom = sum(x * x for x in env) or 1.0
        min_lag = int(0.30 * SR / HOP)
        max_lag = int(2.00 * SR / HOP)
        pulso = 0.0
        for lag in range(min_lag, min(max_lag, len(env) - 1)):
            acc = 0.0
            for j in range(0, len(env) - lag):
                acc += env[j] * env[j + lag]
            if acc / denom > pulso:
                pulso = acc / denom
        pulso = max(0.0, pulso)
    else:
        pulso = 0.0

    # --- detector de VOZ: la voz modula la energia a ritmo de silaba (2-8 Hz)
    #     y deja pausas; un motor es continuo.
    modulacion = 0.0
    if len(energias) > 40:
        env2 = [e ** 0.5 for e in energias]
        media = (sum(env2) / len(env2)) or 1.0
        env2 = [(x / media) - 1.0 for x in env2]
        den = sum(x * x for x in env2) or 1.0
        mejor = 0.0
        minl = int(0.12 * SR / HOP)
        maxl = int(0.45 * SR / HOP)
        for lag in range(minl, max(maxl, len(env2) // 2)):
            acc = 0.0
            for j in range(0, len(env2) - lag):
                acc += env2[j] * env2[j + lag]
            v = acc / den
            if v > mejor:
                mejor = v
        modulacion = max(0.0, mejor)

    huecos = 0.0
    if energias:
        vals = sorted(energias)
        ref = vals[len(vals) // 2] or 1.0
        huecos = sum(1 for e in energias if e < ref * 0.08) / len(energias)

    armonia = sum(armonias) / len(armonias)

    # --- brillo (ZCR): un motor de verdad tiene armonicos que suben de 1-2 kHz.
    #     Un audio "sordo" (todo el peso abajo, ej. auto lejos en el pit lane,
    #     viento o rodadura) suena a ruido y no se reconoce el auto.
    cruces = 0
    for k in range(1, n):
        if (s[k - 1] < 0) != (s[k] < 0):
            cruces += 1
    zcr = cruces / (n - 1) if n > 1 else 0.0

    return {
        "f0_mediana": mediana,
        "f0_cv": cv,
        "estabilidad": cerca,
        "pulso": pulso,
        "armonia": armonia,
        "frames": len(f0s),
        "zcr": zcr,
    }


def veredicto(m):
    # Reglas calibradas con casos conocidos (STI, Mach1, EvoX-musica...):
    #   pulso = ritmo. Musica siempre tiene pulso marcado (>0.26) salvo casos muy
    #   ambientales; el motor nunca pasa de ~0.25.
    p = m["pulso"]
    est = m["estabilidad"]
    if p > 0.40:
        return "MUSICA"
    if p > 0.26 and est > 0.45:
        return "MUSICA"
    if p <= 0.25:
        return "MOTOR"
    if p <= 0.28 and est <= 0.45:
        return "MOTOR"
    return "SOSPECHOSO"


def main():
    if len(sys.argv) < 2:
        print("Uso: python scripts/detectar-audio.py <archivo> [--verbose]")
        sys.exit(2)
    ruta = sys.argv[1]
    verbose = "--verbose" in sys.argv
    m = analizar(ruta)
    if not m:
        print("VEREDICTO: SIN_DATOS (audio muy corto o silencioso)")
        sys.exit(1)
    v = veredicto(m)
    zcr = m.get("zcr", 1.0)
    # motor "sordo": la energia vive por debajo de ~1.5 kHz -> no se reconoce el auto
    if v == "MOTOR" and zcr < 0.050:
        v = "MOTOR (sordo)"
    print("VEREDICTO: %s" % v)
    if verbose or v != "MOTOR":
        print("  f0 mediana ....... %.1f Hz" % m["f0_mediana"])
        print("  variacion f0 ..... %.2f  (motor >0.30 | musica <0.25)" % m["f0_cv"])
        print("  estabilidad f0 ... %.2f  (musica >0.30)" % m["estabilidad"])
        print("  pulso ritmico .... %.2f  (musica >0.30)" % m["pulso"])
        print("  fuerza armonica .. %.2f" % m["armonia"])
        print("  brillo (ZCR) ..... %.4f  (con caracter >0.050 | sordo <0.050)" % zcr)
    sys.exit(0 if v.startswith("MOTOR") else 1)


if __name__ == "__main__":
    main()
