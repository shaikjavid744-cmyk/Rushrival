import { createAudioPlayer, type AudioPlayer } from "expo-audio";

// Original procedurally generated loop (see /app/art_src/music.py). Failure → silent.
class MusicService {
  private player: AudioPlayer | null = null;
  private enabled = false;

  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      if (on) {
        if (!this.player) {
          this.player = createAudioPlayer(require("../../assets/sfx/music.wav"));
          this.player.loop = true;
          this.player.volume = 0.35;
        }
        this.player.play();
      } else this.player?.pause();
    } catch {
      this.player = null;
    }
  }

  get on() {
    return this.enabled;
  }
}

export const music = new MusicService();
