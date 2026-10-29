import { clampLane, Lane, TUNING } from "./constants";

export type Action = "left" | "right" | "up" | "down";
export type PlayerEvent = "lane" | "jump" | "slide";

export interface PlayerState {
  lane: Lane; // target lane
  x: number; // visual/physical lateral position in lane units
  y: number; // height above ground (m)
  support: number; // height of surface under the runner
  landTimer: number;
  vy: number;
  airborne: boolean;
  fastFall: boolean;
  slideOnLand: boolean;
  sliding: boolean;
  slideTimer: number;
  cooldown: number;
  buffered: Action | null;
  bufferAge: number;
}

export function createPlayer(): PlayerState {
  return {
    lane: 0,
    x: 0,
    y: 0,
    support: 0,
    landTimer: 0,
    vy: 0,
    airborne: false,
    fastFall: false,
    slideOnLand: false,
    sliding: false,
    slideTimer: 0,
    cooldown: 0,
    buffered: null,
    bufferAge: 0,
  };
}

export function resetPlayer(p: PlayerState) {
  Object.assign(p, createPlayer());
}

function startSlide(p: PlayerState, events: PlayerEvent[]) {
  p.sliding = true;
  p.slideTimer = TUNING.slideTime;
  events.push("slide");
}

/** Applies an action now. Returns false when it cannot run yet (jump while airborne). */
function tryApply(p: PlayerState, a: Action, events: PlayerEvent[]): boolean {
  switch (a) {
    case "left":
    case "right": {
      const target = clampLane(p.lane + (a === "left" ? -1 : 1));
      if (target !== p.lane) {
        p.lane = target;
        events.push("lane");
      }
      return true;
    }
    case "up":
      if (p.airborne) return false;
      p.sliding = false;
      p.slideTimer = 0;
      p.vy = TUNING.jumpVelocity;
      p.airborne = true;
      p.fastFall = false;
      p.slideOnLand = false;
      events.push("jump");
      return true;
    case "down":
      if (p.airborne) {
        p.fastFall = true;
        p.slideOnLand = true;
        return true;
      }
      startSlide(p, events);
      return true;
  }
}

/** Input entry point: applies immediately, or buffers at most ONE next action during cooldown. */
export function queueAction(p: PlayerState, a: Action, events: PlayerEvent[]): "applied" | "buffered" | "dropped" {
  if (p.cooldown <= 0 && p.buffered === null && tryApply(p, a, events)) {
    p.cooldown = TUNING.actionCooldown;
    return "applied";
  }
  if (p.buffered === null) {
    p.buffered = a;
    p.bufferAge = 0;
    return "buffered";
  }
  return "dropped";
}

export function stepPlayer(p: PlayerState, dt: number, events: PlayerEvent[]) {
  p.cooldown = Math.max(0, p.cooldown - dt);

  // Lateral move toward the target lane.
  const maxMove = dt / TUNING.laneChangeTime;
  const diff = p.lane - p.x;
  p.x += Math.max(-maxMove, Math.min(maxMove, diff));

  // Vertical physics. `support` = height of whatever is under the runner (ground 0, ramp, train roof).
  const support = p.support;
  if (!p.airborne && p.y > support + 0.02) {
    p.airborne = true; // ran off a roof edge
    p.vy = 0;
  }
  if (!p.airborne && p.y < support) p.y = support; // climbing a ramp
  if (p.airborne) {
    p.vy -= (p.fastFall ? TUNING.fastFallGravity : TUNING.gravity) * dt;
    p.y += p.vy * dt;
    if (p.y <= support) {
      p.y = support;
      p.vy = 0;
      p.airborne = false;
      p.fastFall = false;
      p.landTimer = 0.18;
      if (p.slideOnLand) {
        p.slideOnLand = false;
        startSlide(p, events);
      }
    }
  }
  p.landTimer = Math.max(0, p.landTimer - dt);

  if (p.sliding) {
    p.slideTimer -= dt;
    if (p.slideTimer <= 0) {
      p.sliding = false;
      p.slideTimer = 0;
    }
  }

  // Buffered action.
  if (p.buffered !== null) {
    p.bufferAge += dt;
    if (p.bufferAge > TUNING.bufferTtl) {
      p.buffered = null;
    } else if (p.cooldown <= 0 && tryApply(p, p.buffered, events)) {
      p.buffered = null;
      p.cooldown = TUNING.actionCooldown;
    }
  }
}
