import { Skia, SkCanvas, SkColor, SkImage, SkPaint } from "@shopify/react-native-skia";

import type { RigLook, WorldPalette } from "@/src/config/catalog";

import { TUNING } from "./constants";
import type { GameEngine } from "./engine";
import { depthScale, groundY, laneX, metrePx, Viewport } from "./projection";
import { crashPose, jumpPose, landPose, Pose, runFrameRate, runPoseAt, slidePose, solve } from "./rig";
import { RigPainter } from "./rigDraw";
import type { PowerUpKind } from "./types";

export interface Sprites {
  board: SkImage;
  coin: SkImage;
  low: SkImage;
  high: SkImage;
  train: SkImage;
  bg: SkImage;
  pickups: Record<PowerUpKind, SkImage>;
}

export interface FrameFx {
  shake: number;
  flash: number;
  crashT: number; // 0..1 crash tumble progress
}

export type Graphics = "low" | "medium" | "high";

const FIXED = {
  curb: "#EEF2F8",
  dash: "#F4F7FF",
  trainSide: "#21508F",
  trainRoof: "#7CA4DA",
  trainEdge: "#0F2F5C",
  trainGlass: "#9CC9EE",
  trainStripe: "#FF8A1F",
  ramp: "#C7CCD8",
  rampStripe: "#F2B705",
  shadow: "#000000",
  pole: "#2B3247",
  lamp: "#FFE08A",
  flash: "#FF2D3D",
  warn: "#FF2D3D",
  shield: "#4FD8FF",
  speedLine: "#FFFFFF",
};

const ROAD_EDGE = 1.62;
const WALK_EDGE = 2.15;
const TRAIN_CUT = -1.1; // trains are clipped just behind the runner (cut face shows the carriage height)

type Drawable = { dz: number; kind: 0 | 1 | 2 | 3; idx: number }; // obstacle, coin, player, pickup

export class Renderer {
  private fill: SkPaint;
  private img: SkPaint;
  private c: Record<string, SkColor>;
  private list: Drawable[] = [];
  private rig: RigPainter;
  private runFrame = 0;
  private lastT = 0;
  private camLift = 0;

  constructor(
    private readonly s: Sprites,
    palette: WorldPalette,
    private readonly gfx: Graphics = "high",
    look: RigLook,
  ) {
    this.rig = new RigPainter(look);
    this.fill = Skia.Paint();
    this.fill.setAntiAlias(true);
    this.img = Skia.Paint();
    this.img.setAntiAlias(true);
    this.c = Object.fromEntries(Object.entries({ ...FIXED, ...palette }).map(([k, v]) => [k, Skia.Color(v)]));
  }

  private paint(color: SkColor, alpha = 1): SkPaint {
    this.fill.setColor(color);
    this.fill.setAlphaf(alpha);
    return this.fill;
  }

  private quad(canvas: SkCanvas, pts: number[], paint: SkPaint) {
    const path = Skia.PathBuilder.Make()
      .moveTo(pts[0], pts[1])
      .lineTo(pts[2], pts[3])
      .lineTo(pts[4], pts[5])
      .lineTo(pts[6], pts[7])
      .close()
      .build();
    canvas.drawPath(path, paint);
  }

  /** World point (lane units, depth, height m) → screen. */
  private at(vp: Viewport, x: number, z: number, h: number): [number, number] {
    return [laneX(vp, x, z), groundY(vp, z) - h * metrePx(vp) * depthScale(vp, z)];
  }

  private box(canvas: SkCanvas, vp: Viewport, x0: number, x1: number, z0: number, z1: number, h0: number, h1: number, color: SkColor, a = 1) {
    this.quad(canvas, [...this.at(vp, x0, z0, h0), ...this.at(vp, x1, z0, h1), ...this.at(vp, x1, z1, h1), ...this.at(vp, x0, z1, h0)], this.paint(color, a));
  }

  private image(canvas: SkCanvas, im: SkImage, x: number, y: number, w: number, h: number, alpha = 1) {
    this.img.setAlphaf(alpha);
    canvas.drawImageRect(im, Skia.XYWHRect(0, 0, im.width(), im.height()), Skia.XYWHRect(x, y, w, h), this.img);
  }

  draw(canvas: SkCanvas, e: GameEngine, vp: Viewport, fx: FrameFx) {
    const { width: W, height: H } = vp;
    canvas.save();
    if (fx.shake > 0) canvas.translate((Math.random() - 0.5) * fx.shake * 2, (Math.random() - 0.5) * fx.shake * 2);
    canvas.drawRect(Skia.XYWHRect(-20, -20, W + 40, H + 40), this.paint(this.c.sky));
    // Camera rises/tilts up slightly while the runner is on a roof (more sky, scene shifts down).
    this.camLift += (e.player.support * 0.16 - this.camLift) * 0.08;
    if (this.camLift > 0.001) canvas.translate(0, this.camLift * metrePx(vp));
    this.drawBackground(canvas, vp);
    this.drawTrack(canvas, vp, e.distance);
    if (this.gfx !== "low") this.drawLamps(canvas, vp, e.distance);
    this.drawObjects(canvas, vp, e, fx);
    if (e.timers.speed > 0) this.drawSpeedLines(canvas, vp, e.time);
    canvas.restore();
    if (fx.flash > 0) canvas.drawRect(Skia.XYWHRect(0, 0, W, H), this.paint(this.c.flash, fx.flash));
  }

  private drawBackground(canvas: SkCanvas, vp: Viewport) {
    const bg = this.s.bg;
    const iw = bg.width();
    const ih = bg.height();
    const vanish = 0.42;
    const scale = Math.max(vp.width / iw, vp.horizonY / (vanish * ih));
    const w = iw * scale;
    const h = ih * scale;
    canvas.drawRect(Skia.XYWHRect(0, vp.horizonY, vp.width, vp.height), this.paint(this.c.plaza));
    this.image(canvas, bg, (vp.width - w) / 2, vp.horizonY - vanish * h, w, h);
  }

  private drawTrack(canvas: SkCanvas, vp: Viewport, distance: number) {
    const near = vp.nearDz;
    const far = 700;
    this.box(canvas, vp, -7, -WALK_EDGE, near, far, 0, 0, this.c.plaza);
    this.box(canvas, vp, WALK_EDGE, 7, near, far, 0, 0, this.c.plaza);
    this.box(canvas, vp, -WALK_EDGE, -ROAD_EDGE, near, far, 0, 0, this.c.sidewalk);
    this.box(canvas, vp, ROAD_EDGE, WALK_EDGE, near, far, 0, 0, this.c.sidewalk);
    this.box(canvas, vp, -ROAD_EDGE, ROAD_EDGE, near, far, 0, 0, this.c.asphalt);

    // Sleepers (scrolling) + two rails per lane give real track depth.
    if (this.gfx !== "low") {
      const step = 2.2;
      const base = Math.floor(distance / step) * step;
      for (let k = 0; k < 46; k++) {
        const z0 = base + k * step - distance;
        if (z0 + 0.6 < near) continue;
        const fade = Math.max(0, Math.min(1, (100 - z0) / 30));
        if (fade <= 0) break;
        for (const l of [-1, 0, 1]) this.box(canvas, vp, l - 0.4, l + 0.4, z0, z0 + 0.55, 0, 0, this.c.sleeper, 0.9 * fade);
      }
    } else {
      const base = Math.floor(distance / 6) * 6;
      for (let k = 0; k < 30; k++) {
        const z0 = base + k * 6 - distance;
        if (z0 + 3 < near) continue;
        this.box(canvas, vp, -0.53, -0.47, z0, z0 + 3, 0, 0, this.c.dash, 0.8);
        this.box(canvas, vp, 0.47, 0.53, z0, z0 + 3, 0, 0, this.c.dash, 0.8);
      }
    }
    for (const l of [-1, 0, 1]) {
      this.box(canvas, vp, l - 0.3, l - 0.25, near, far, 0, 0, this.c.rail);
      this.box(canvas, vp, l + 0.25, l + 0.3, near, far, 0, 0, this.c.rail);
    }
    this.box(canvas, vp, -ROAD_EDGE - 0.06, -ROAD_EDGE, near, far, 0, 0, this.c.curb);
    this.box(canvas, vp, ROAD_EDGE, ROAD_EDGE + 0.06, near, far, 0, 0, this.c.curb);
  }

  private drawLamps(canvas: SkCanvas, vp: Viewport, distance: number) {
    const mpx = metrePx(vp);
    const spacing = 24;
    const base = Math.floor(distance / spacing) * spacing;
    for (let k = 8; k >= 0; k--) {
      const dz = base + k * spacing - distance;
      if (dz < vp.nearDz + 1) continue;
      const s = depthScale(vp, dz);
      const fade = Math.max(0, Math.min(1, (200 - dz) / 60));
      for (const side of [-1, 1]) {
        const x = laneX(vp, side * 1.95, dz);
        const gy = groundY(vp, dz);
        const top = gy - 4.4 * mpx * s;
        const pw = Math.max(1.5, 0.12 * mpx * s);
        canvas.drawRect(Skia.XYWHRect(x - pw / 2, top, pw, gy - top), this.paint(this.c.pole, fade));
        canvas.drawRect(Skia.XYWHRect(side > 0 ? x - 0.7 * mpx * s : x, top, 0.7 * mpx * s, pw), this.paint(this.c.pole, fade));
        canvas.drawCircle(side > 0 ? x - 0.7 * mpx * s : x + 0.7 * mpx * s, top + pw * 1.5, Math.max(1.5, 0.22 * mpx * s), this.paint(this.c.lamp, fade));
      }
    }
  }

  private drawSpeedLines(canvas: SkCanvas, vp: Viewport, t: number) {
    for (let i = 0; i < 14; i++) {
      const a = (i * 2.399 + t * 0.7) % (Math.PI * 2);
      const r0 = 80 + ((t * 900 + i * 97) % 300);
      const cx = vp.width / 2;
      const cy = vp.horizonY;
      const x = cx + Math.cos(a) * r0;
      const y = cy + Math.sin(a) * r0 * 1.4;
      canvas.drawRect(Skia.XYWHRect(x, y, 2, 26), this.paint(this.c.speedLine, 0.35));
    }
  }

  private drawObjects(canvas: SkCanvas, vp: Viewport, e: GameEngine, fx: FrameFx) {
    const list = this.list;
    list.length = 0;
    e.obstacles.items.forEach((o, i) => {
      if (!o.active) return;
      const dz = o.z - e.distance;
      const front = o.ramp ? dz - TUNING.rampLength : dz;
      if (front > 190 || dz + o.depth < vp.nearDz) return;
      list.push({ dz: o.kind === "train" ? Math.max(dz, 0.01) : dz, kind: 0, idx: i });
    });
    e.coins.items.forEach((c, i) => {
      if (!c.active) return;
      const dz = c.z - e.distance;
      if (dz <= 150 && dz >= vp.nearDz + 1) list.push({ dz, kind: 1, idx: i });
    });
    e.pickups.items.forEach((u, i) => {
      if (!u.active) return;
      const dz = u.z - e.distance;
      if (dz <= 150 && dz >= vp.nearDz + 1) list.push({ dz, kind: 3, idx: i });
    });
    list.push({ dz: 0, kind: 2, idx: 0 });
    list.sort((a, b) => b.dz - a.dz);
    for (const d of list) {
      if (d.kind === 0) this.drawObstacle(canvas, vp, e, d.idx);
      else if (d.kind === 1) this.drawCoin(canvas, vp, e, d.idx);
      else if (d.kind === 3) this.drawPickup(canvas, vp, e, d.idx);
      else this.drawPlayer(canvas, vp, e, fx);
    }
  }

  private drawObstacle(canvas: SkCanvas, vp: Viewport, e: GameEngine, idx: number) {
    const o = e.obstacles.items[idx];
    const dz = o.z - e.distance;
    const fade = Math.max(0, Math.min(1, (190 - dz) / 50));
    if (o.kind === "train") {
      this.drawTrain(canvas, vp, e, idx, fade);
      return;
    }
    const im = o.kind === "low" ? this.s.low : this.s.high;
    const s = depthScale(vp, dz);
    const w = (o.kind === "low" ? 0.95 : 1.0) * vp.lanePx * s;
    const h = (w * im.height()) / im.width();
    const x = laneX(vp, o.lane, dz);
    const gy = groundY(vp, dz);
    canvas.drawOval(Skia.XYWHRect(x - w * 0.48, gy - w * 0.05, w * 0.96, w * 0.1), this.paint(this.c.shadow, 0.25 * fade));
    this.image(canvas, im, x - w / 2, gy - h + h * 0.02, w, h, fade);
  }

  private drawTrain(canvas: SkCanvas, vp: Viewport, e: GameEngine, idx: number, fade: number) {
    const o = e.obstacles.items[idx];
    const lane = o.lane;
    const dz = o.z - e.distance;
    const im = this.s.train;
    const aspect = im.height() / im.width();
    const H = TUNING.trainHeight;
    const half = H / (TUNING.laneWidthM * aspect) / 2;
    const zf = Math.max(dz, TRAIN_CUT);
    const zb = Math.min(dz + o.depth, 260);
    const C = this.c;

    // Side walls (outer side first for side lanes; both for the centre lane so the body never reads flat).
    const sides = lane === 0 ? [-half, half] : [lane < 0 ? lane + half : lane - half];
    for (const xs of sides) {
      this.quad(canvas, [...this.at(vp, xs, zf, 0), ...this.at(vp, xs, zf, H), ...this.at(vp, xs, zb, H), ...this.at(vp, xs, zb, 0)], this.paint(C.trainSide, fade));
      for (let z = dz + 1; z < zb - 1; z += 3.2) {
        const z0 = Math.max(z, zf);
        const z1 = Math.min(z + 2.2, zb);
        if (z1 > z0) this.quad(canvas, [...this.at(vp, xs, z0, H * 0.5), ...this.at(vp, xs, z0, H * 0.82), ...this.at(vp, xs, z1, H * 0.82), ...this.at(vp, xs, z1, H * 0.5)], this.paint(C.trainGlass, fade));
      }
      this.quad(canvas, [...this.at(vp, xs, zf, H * 0.34), ...this.at(vp, xs, zf, H * 0.42), ...this.at(vp, xs, zb, H * 0.42), ...this.at(vp, xs, zb, H * 0.34)], this.paint(C.trainStripe, fade));
    }
    if (dz < zf) {
      // Front already passed: draw the carriage's cut section just behind the runner so the roof clearly
      // sits on a tall solid body (strong height cue when running on roofs).
      const face = (h0: number, h1: number, x0: number, x1: number, col: SkColor, a = fade) =>
        this.quad(canvas, [...this.at(vp, x0, zf, h0), ...this.at(vp, x0, zf, h1), ...this.at(vp, x1, zf, h1), ...this.at(vp, x1, zf, h0)], this.paint(col, a));
      face(0, H, lane - half, lane + half, C.trainSide);
      face(H * 0.5, H * 0.82, lane - half * 0.8, lane - half * 0.1, C.trainGlass);
      face(H * 0.5, H * 0.82, lane + half * 0.1, lane + half * 0.8, C.trainGlass);
      face(H * 0.34, H * 0.42, lane - half, lane + half, C.trainStripe);
      face(H * 0.93, H, lane - half, lane + half, C.trainEdge);
      face(0, H * 0.08, lane - half, lane + half, C.shadow, 0.35 * fade);
    }
    this.box(canvas, vp, lane - half, lane + half, zf, zb, H, H, C.trainRoof, fade);
    this.box(canvas, vp, lane - half, lane - half + 0.07, zf, zb, H, H, C.trainEdge, fade);
    this.box(canvas, vp, lane + half - 0.07, lane + half, zf, zb, H, H, C.trainEdge, fade);
    for (let z = dz + 2; z < zb - 1; z += 4.5) if (z + 1.4 > zf) this.box(canvas, vp, lane - 0.16, lane + 0.16, Math.max(z, zf), z + 1.4, H, H, C.trainEdge, fade * 0.6);

    if (dz >= TRAIN_CUT) {
      const s = depthScale(vp, dz);
      const w = 2 * half * vp.lanePx * s;
      const h = w * aspect;
      const gy = groundY(vp, dz);
      const x = laneX(vp, lane, dz);
      this.image(canvas, im, x - w / 2, gy - h, w, h, fade);
      if (o.moving && dz > 0) {
        // Oncoming warning: blinking headlights + red marker above the roof.
        const blink = Math.sin(e.time * 14) > 0 ? 1 : 0.35;
        canvas.drawCircle(x - w * 0.27, gy - h * 0.3, w * 0.12, this.paint(C.lamp, 0.8 * blink * fade));
        canvas.drawCircle(x + w * 0.27, gy - h * 0.3, w * 0.12, this.paint(C.lamp, 0.8 * blink * fade));
        const r = Math.max(6, w * 0.18);
        const ty = gy - h - r * 1.6;
        this.quad(canvas, [x, ty - r, x + r, ty + r * 0.8, x - r, ty + r * 0.8, x, ty - r], this.paint(C.warn, blink * fade));
      }
    }
    if (o.ramp) {
      const z0 = dz - TUNING.rampLength;
      const z1 = Math.max(dz, vp.nearDz);
      if (z1 > Math.max(z0, vp.nearDz)) {
        const za = Math.max(z0, vp.nearDz);
        const ha = (H * (za - z0)) / TUNING.rampLength;
        const hb = (H * (z1 - z0)) / TUNING.rampLength;
        this.quad(canvas, [...this.at(vp, lane - half, za, ha), ...this.at(vp, lane + half, za, ha), ...this.at(vp, lane + half, z1, hb), ...this.at(vp, lane - half, z1, hb)], this.paint(C.ramp, fade));
        for (let k = 1; k < 6; k++) {
          const zz = z0 + (k * TUNING.rampLength) / 6;
          if (zz < za || zz + 0.35 > z1) continue;
          const hh = (H * (zz - z0)) / TUNING.rampLength;
          this.quad(canvas, [...this.at(vp, lane - half, zz, hh), ...this.at(vp, lane + half, zz, hh), ...this.at(vp, lane + half, zz + 0.35, hh + 0.13), ...this.at(vp, lane - half, zz + 0.35, hh + 0.13)], this.paint(C.rampStripe, fade));
        }
      }
    }
  }

  private drawCoin(canvas: SkCanvas, vp: Viewport, e: GameEngine, idx: number) {
    const c = e.coins.items[idx];
    const dz = c.z - e.distance;
    const s = depthScale(vp, dz);
    const size = 0.36 * vp.lanePx * s;
    const w = size * Math.max(0.22, Math.abs(Math.cos(e.time * 5 + c.z * 0.3)));
    const [x, y] = this.at(vp, c.x, dz, c.y);
    this.image(canvas, this.s.coin, x - w / 2, y - size / 2, w, size, Math.max(0, Math.min(1, (150 - dz) / 40)));
  }

  private drawPickup(canvas: SkCanvas, vp: Viewport, e: GameEngine, idx: number) {
    const u = e.pickups.items[idx];
    const dz = u.z - e.distance;
    const s = depthScale(vp, dz);
    const size = 0.5 * vp.lanePx * s;
    const [x, y] = this.at(vp, u.lane, dz, u.y + Math.sin(e.time * 4) * 0.15);
    canvas.drawCircle(x, y, size * 0.62, this.paint(this.c.shield, 0.25));
    const im = this.s.pickups[u.kind];
    const h = (size * im.height()) / im.width();
    this.image(canvas, im, x - size / 2, y - h / 2, size, h);
  }

  private drawPlayer(canvas: SkCanvas, vp: Viewport, e: GameEngine, fx: FrameFx) {
    const p = e.player;
    const x = laneX(vp, p.x, 0);
    const gy = groundY(vp, 0);
    const mpx = metrePx(vp);
    const board = e.timers.hoverboard > 0;
    const lift = board ? 0.35 : 0;
    const supportY = gy - p.support * mpx;

    // Ground/roof contact shadow: stays on the surface and shrinks/fades as the runner rises above it.
    const air = Math.max(0, p.y - p.support);
    const sh = 1 - Math.min(0.6, air / 3);
    canvas.drawOval(Skia.XYWHRect(x - 0.32 * vp.lanePx * sh, supportY - 0.06 * vp.lanePx * sh, 0.64 * vp.lanePx * sh, 0.12 * vp.lanePx * sh), this.paint(this.c.shadow, 0.45 * sh));

    // Advance the run-cycle keyframe clock (12–15 keyframes/s, scaled by speed).
    const dt = Math.max(0, Math.min(0.1, e.time - this.lastT));
    this.lastT = e.time;
    this.runFrame += dt * runFrameRate(e.speed);

    let pose: Pose;
    if (p.sliding) pose = slidePose(e.time);
    else if (p.airborne) pose = jumpPose(p.vy);
    else {
      pose = runPoseAt(this.runFrame);
      if (p.landTimer > 0) pose = landPose(pose, p.landTimer / 0.18);
    }
    if (fx.crashT > 0) pose = crashPose(pose, fx.crashT);
    pose.roll += (p.lane - p.x) * 18; // lane-change lean into the turn

    const scale = mpx * 1.55;
    const footY = gy - (p.y + lift) * mpx;
    if (board) {
      const bw = 0.85 * vp.lanePx;
      const bh = (bw * this.s.board.height()) / this.s.board.width();
      this.image(canvas, this.s.board, x - bw / 2, footY - bh * 0.35, bw, bh);
    }
    canvas.save();
    canvas.translate(x, footY);
    canvas.rotate(pose.roll + (fx.crashT > 0 ? fx.crashT * 20 : 0), 0, -pose.hipY * scale);
    this.rig.draw(canvas, solve(pose), scale);
    canvas.restore();
    if (e.timers.shield > 0) canvas.drawCircle(x, footY - 0.95 * scale, 1.1 * scale, this.paint(this.c.shield, 0.22 + 0.08 * Math.sin(e.time * 8)));
  }
}
