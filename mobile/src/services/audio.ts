import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { Platform } from "react-native";

// Original procedurally generated SFX (see /app/art_src/sfx.py).
const SOURCES = {
  lane: require("../../assets/sfx/lane.wav"),
  jump: require("../../assets/sfx/jump.wav"),
  slide: require("../../assets/sfx/slide.wav"),
  coin: require("../../assets/sfx/coin.wav"),
  crash: require("../../assets/sfx/crash.wav"),
  tick: require("../../assets/sfx/tick.wav"),
  go: require("../../assets/sfx/go.wav"),
  best: require("../../assets/sfx/best.wav"),
};

export type Sfx = keyof typeof SOURCES;
export const SFX_SOURCES = Object.values(SOURCES);

const VOICES: Partial<Record<Sfx, number>> = { coin: 3, lane: 2 };

class AudioService {
  available = false;
  enabled = true;
  private players: Partial<Record<Sfx, AudioPlayer[]>> = {};
  private cursor: Partial<Record<Sfx, number>> = {};
  private initialized = false;

  /** Never throws: failure leaves the game silent (REQ-38). */
  async init(): Promise<boolean> {
    if (this.initialized) return this.available;
    this.initialized = true;
    try {
      if (__DEV__ && Platform.OS === "web" && typeof window !== "undefined" && window.location.search.includes("devNoAudio=1")) {
        throw new Error("Simulated audio failure (dev)");
      }
      await setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
      (Object.keys(SOURCES) as Sfx[]).forEach((k) => {
        const n = VOICES[k] ?? 1;
        this.players[k] = Array.from({ length: n }, () => {
          const p = createAudioPlayer(SOURCES[k]);
          p.volume = 0.6;
          return p;
        });
      });
      this.available = true;
    } catch (e) {
      console.warn("[audio] unavailable, continuing silently", e);
      this.available = false;
    }
    return this.available;
  }

  play(name: Sfx) {
    if (!this.available || !this.enabled) return;
    try {
      const list = this.players[name];
      if (!list?.length) return;
      const i = (this.cursor[name] ?? 0) % list.length;
      this.cursor[name] = i + 1;
      const p = list[i];
      p.seekTo(0)?.catch?.(() => undefined);
      p.play();
    } catch {
      // ignore: audio is optional
    }
  }
}

export const audio = new AudioService();
