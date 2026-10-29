"""Original chiptune loop (16 bars, 120 bpm) — no third-party material."""
import math, struct, wave
SR = 22050
BPM = 120
beat = 60 / BPM
mel = [72, 76, 79, 76, 74, 77, 81, 77, 72, 76, 79, 84, 83, 79, 76, 74]
bass = [48, 48, 53, 53, 55, 55, 48, 48]
f = lambda n: 440 * 2 ** ((n - 69) / 12)
total = int(SR * beat * 32)
out = [0.0] * total
def add(note, start, dur, vol, sq=True):
    s0 = int(start * SR); n = int(dur * SR)
    for i in range(n):
        if s0 + i >= total: break
        ph = 2 * math.pi * f(note) * i / SR
        v = (1 if math.sin(ph) > 0 else -1) * 0.5 if sq else math.sin(ph)
        env = min(1, i / 200) * max(0, 1 - i / n) ** 0.6
        out[s0 + i] += v * env * vol
for bar in range(2):
    for i, n in enumerate(mel):
        add(n, (bar * 16 + i) * beat, beat * 0.9, 0.18)
    for i, n in enumerate(bass):
        add(n, (bar * 16 + i * 2) * beat, beat * 1.8, 0.28, sq=False)
    for i in range(16):
        s0 = int((bar * 16 + i) * beat * SR)
        for k in range(600):
            if s0 + k < total: out[s0 + k] += (((k * 7919) % 97) / 48 - 1) * 0.05 * (1 - k / 600)
with wave.open("/app/mobile/assets/sfx/music.wav", "w") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 30000)) for s in out))
print("ok")
