"""Generates original procedural SFX (no third-party audio). Output: 16-bit mono WAV."""
import math
import random
import struct
import wave

SR = 22050
OUT = "/app/mobile/assets/sfx/"
random.seed(7)


def write(name, samples):
    peak = max(1e-6, max(abs(s) for s in samples))
    gain = 0.8 / peak
    with wave.open(OUT + name + ".wav", "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s * gain)) * 32767)) for s in samples))


def env(i, n, attack=0.01, release=0.6):
    t = i / n
    a = min(1.0, t / attack) if attack > 0 else 1.0
    r = 1.0 if t < 1 - release else max(0.0, (1 - t) / release)
    return a * r


def tone(f0, f1, dur, wave_type="sine", vol=1.0):
    n = int(SR * dur)
    out, ph = [], 0.0
    for i in range(n):
        f = f0 + (f1 - f0) * (i / n)
        ph += 2 * math.pi * f / SR
        s = math.sin(ph)
        if wave_type == "square":
            s = 0.6 if s > 0 else -0.6
        elif wave_type == "tri":
            s = 2 / math.pi * math.asin(math.sin(ph))
        out.append(s * env(i, n) * vol)
    return out


def noise(dur, lp_start=0.6, lp_end=0.1, vol=1.0):
    n = int(SR * dur)
    out, y = [], 0.0
    for i in range(n):
        a = lp_start + (lp_end - lp_start) * (i / n)
        y += a * (random.uniform(-1, 1) - y)
        out.append(y * env(i, n, 0.05, 0.7) * vol)
    return out


def mix(*tracks):
    n = max(len(t) for t in tracks)
    return [sum(t[i] if i < len(t) else 0 for t in tracks) for i in range(n)]


def concat(*tracks):
    out = []
    for t in tracks:
        out += t
    return out


write("lane", noise(0.12, 0.15, 0.55, 0.9))
write("jump", tone(320, 760, 0.18, "tri"))
write("slide", noise(0.26, 0.5, 0.08))
write("coin", concat(tone(988, 988, 0.05, "square", 0.7), tone(1319, 1319, 0.12, "square", 0.7)))
write("crash", mix(noise(0.45, 0.9, 0.05), tone(140, 40, 0.4, "sine", 1.2)))
write("tick", tone(660, 660, 0.12, "square", 0.6))
write("go", mix(tone(880, 880, 0.3, "square", 0.5), tone(1320, 1320, 0.3, "tri", 0.4)))
write("best", concat(tone(784, 784, 0.1, "square", 0.6), tone(988, 988, 0.1, "square", 0.6), tone(1319, 1319, 0.25, "square", 0.6)))
print("ok")
