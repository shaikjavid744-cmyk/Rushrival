import type { GameEngine } from "./engine";
import type { Action } from "./player";

/** One guided tutorial step: objects are placed ahead, the run freezes at `trigger` until `action` is performed. */
export interface TutorialStep {
  id: "left" | "right" | "jump" | "slide" | "coins" | "avoid" | "powerup";
  action: Action;
  text: string;
  /** Places objects relative to the current distance d; returns the distance at which the hint appears. */
  setup: (e: GameEngine, d: number) => number;
}

const coinLine = (e: GameEngine, lane: -1 | 0 | 1, from: number, n: number) => {
  for (let i = 0; i < n; i++) e.addCoin(lane, from + i * 1.8);
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: "left", action: "left", text: "Swipe LEFT to change lanes", setup: (e, d) => (coinLine(e, -1, d + 14, 5), d + 7) },
  { id: "right", action: "right", text: "Swipe RIGHT to move back", setup: (e, d) => (coinLine(e, 0, d + 12, 4), d + 6) },
  { id: "jump", action: "up", text: "Swipe UP to jump over the barrier", setup: (e, d) => (e.addObstacle("low", 0, d + 16), d + 11.5) },
  { id: "slide", action: "down", text: "Swipe DOWN to slide under", setup: (e, d) => (e.addObstacle("high", 0, d + 16), d + 12.5) },
  { id: "coins", action: "right", text: "Swipe RIGHT to grab the coins", setup: (e, d) => (coinLine(e, 1, d + 11, 8), d + 5) },
  { id: "avoid", action: "left", text: "Train ahead! Swipe LEFT to dodge it", setup: (e, d) => (e.addObstacle("train", 1, d + 22), d + 11) },
  { id: "powerup", action: "right", text: "Swipe RIGHT to pick up the magnet power-up", setup: (e, d) => (e.addPickup("magnet", 1, d + 15), d + 8) },
];

/** Pure tutorial state machine (no rendering). The host stops calling engine.update() while `waiting`. */
export class TutorialController {
  index = -1;
  waiting = false;
  done = false;
  private triggerAt = 0;
  private nextAt: number | null = null;
  private finishAt: number | null = null;

  constructor(readonly steps: TutorialStep[] = TUTORIAL_STEPS) {}

  get step(): TutorialStep | null {
    return this.steps[this.index] ?? null;
  }

  start(e: GameEngine) {
    e.godMode = true; // the tutorial can never end in a crash
    this.nextAt = e.distance + 4;
  }

  /** Call once per frame (after engine.update when not waiting). */
  tick(e: GameEngine) {
    if (this.done) return;
    if (this.nextAt !== null && e.distance >= this.nextAt) {
      this.nextAt = null;
      this.index += 1;
      if (this.index >= this.steps.length) this.finishAt = e.distance + 10;
      else this.triggerAt = this.steps[this.index].setup(e, e.distance);
    }
    if (this.finishAt !== null && e.distance >= this.finishAt) this.done = true;
    if (!this.waiting && this.nextAt === null && this.finishAt === null && this.step && e.distance >= this.triggerAt) this.waiting = true;
  }

  /** Returns true when the action completes the active step (the host then forwards it to the engine). */
  accept(a: Action, e: GameEngine): boolean {
    if (!this.waiting || !this.step || a !== this.step.action) return false;
    this.waiting = false;
    this.nextAt = e.distance + 14;
    return true;
  }
}
