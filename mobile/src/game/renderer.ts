import { Skia, SkCanvas, SkColor, SkImage, SkPaint } from "@shopify/react-native-skia";

import { TUNING } from "./constants";
import type { GameEngine } from "./engine";
import { depthScale, groundY, laneX, metrePx, Viewport } from "./projection";

export interface Sprites {
  rushRun: SkImage;
  rushJump: SkImage;
  rushSlide: SkImage;
  coin: SkImage;
  low: SkImage;
  high: SkImage;
  train: SkImage;
  bg: SkImage;
}

export interface FrameFx {
  shake: number;
  flash: number;
}

// World art palette: painted scenery, identical regardless of UI theme.
const WORLD = {
  sky: "#8ED3F7",
  ground: "#5A6377",
  asphalt: "#394158",
  stripe: "#2E354A",
  sidewalk: "#A3ACC1",
  plaza: "#C9B79C",
  curb: "#EEF2F8",
  dash: "#F4F7FF",
  trainSide: "#21508F",
  trainRoof: "#7CA4DA",
  trainEdge: "#0F2F5C",
  trainGlass: "#9CC9EE",
  trainStripe: "#FF8A1F",
  shadow: "#000000",
  pole: "#2B3247",
  lamp: "#FFE08A",
  flash: "#FF2D3D",
};

const ROAD_EDGE = 1.62;
const WALK_EDGE = 2.15;

type Drawable = { dz: number; kind: 0 | 1 | 2; idx: number }; // 0 obstacle, 1 coin, 2 player

export class Renderer {
  private fill: SkPaint;
  private img: SkPaint;
  private c: Record<keyof typeof WORLD, SkColor>;
  private list: Drawable[] = [];

  constructor(private readonly s: Sprites) {
    this.fill = Skia.Paint();
    this.fill.setAntiAlias(true);
    this.img = Skia.Paint();
    this.img.setAntiAlias(true);
    this.c = Object.fromEntries(Object.entries(WORLD).map(([k, v]) => [k, Skia.Color(v)])) as Record<
      keyof typeof WORLD,
      SkColor
    >;
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

  /** Ground-plane quad spanning lanes [x0,x1] and depth [z0,z1]. */
  private groundQuad(canvas: SkCanvas, vp: Viewport, x0: number, x1: number, z0: number, z1: number, paint: SkPaint) {
    this.quad(
      canvas,
      [
        laneX(vp, x0, z0), groundY(vp, z0),
        laneX(vp, x1, z0), groundY(vp, z0),
        laneX(vp, x1, z1), groundY(vp, z1),
        laneX(vp, x0, z1), groundY(vp, z1),
      ],
      paint,
    );
  }

  private image(canvas: SkCanvas, im: SkImage, x: number, y: number, w: number, h: number, alpha = 1, flip = false) {
    this.img.setAlphaf(alpha);
    const src = Skia.XYWHRect(0, 0, im.width(), im.height());
    if (flip) {
      canvas.save();
      canvas.translate(x + w / 2, 0);
      canvas.scale(-1, 1);
      canvas.drawImageRect(im, src, Skia.XYWHRect(-w / 2, y, w, h), this.img);
      canvas.restore();
    } else {
      canvas.drawImageRect(im, src, Skia.XYWHRect(x, y, w, h), this.img);
    }
  }

  draw(canvas: SkCanvas, e: GameEngine, vp: Viewport, fx: FrameFx) {
    const { width: W, height: H } = vp;
    canvas.save();
    if (fx.shake > 0) canvas.translate((Math.random() - 0.5) * fx.shake * 2, (Math.random() - 0.5) * fx.shake * 2);

    canvas.drawRect(Skia.XYWHRect(-20, -20, W + 40, H + 40), this.paint(this.c.sky));
    this.drawBackground(canvas, vp);
    this.drawRoad(canvas, vp, e.distance);
    this.drawLamps(canvas, vp, e.distance);
    this.drawObjects(canvas, vp, e);

    canvas.restore();
    if (fx.flash > 0) canvas.drawRect(Skia.XYWHRect(0, 0, W, H), this.paint(this.c.flash, fx.flash));
  }

  private drawBackground(canvas: SkCanvas, vp: Viewport) {
    const bg = this.s.bg;
    const iw = bg.width();
    const ih = bg.height();
    const vanish = 0.42; // vanishing point height fraction inside the art
    const scale = Math.max(vp.width / iw, vp.horizonY / (vanish * ih));
    const w = iw * scale;
    const h = ih * scale;
    const y = vp.horizonY - vanish * h;
    canvas.drawRect(Skia.XYWHRect(0, vp.horizonY, vp.width, vp.height), this.paint(this.c.ground));
    this.image(canvas, bg, (vp.width - w) / 2, y, w, h);
  }

  private drawRoad(canvas: SkCanvas, vp: Viewport, distance: number) {
    const near = vp.nearDz;
    const far = 700;
    // Wide plaza covers the background art's own street so only our 3-lane track reads as road.
    this.groundQuad(canvas, vp, -7, -WALK_EDGE, near, far, this.paint(this.c.plaza));
    this.groundQuad(canvas, vp, WALK_EDGE, 7, near, far, this.paint(this.c.plaza));
    this.groundQuad(canvas, vp, -WALK_EDGE, -ROAD_EDGE, near, far, this.paint(this.c.sidewalk));
    this.groundQuad(canvas, vp, ROAD_EDGE, WALK_EDGE, near, far, this.paint(this.c.sidewalk));
    this.groundQuad(canvas, vp, -ROAD_EDGE, ROAD_EDGE, near, far, this.paint(this.c.asphalt));

    // Cross stripes + lane dashes scroll with distance for a sense of speed.
    const base = Math.floor(distance / 6) * 6;
    for (let k = 0; k < 30; k++) {
      const z0 = base + k * 6 - distance;
      if (z0 + 3 < near) continue;
      const fade = Math.max(0, Math.min(1, (170 - z0) / 60));
      this.groundQuad(canvas, vp, -ROAD_EDGE, ROAD_EDGE, z0, z0 + 0.7, this.paint(this.c.stripe, 0.6 * fade));
      this.groundQuad(canvas, vp, -0.53, -0.47, z0, z0 + 3, this.paint(this.c.dash, 0.85 * fade));
      this.groundQuad(canvas, vp, 0.47, 0.53, z0, z0 + 3, this.paint(this.c.dash, 0.85 * fade));
    }
    this.groundQuad(canvas, vp, -ROAD_EDGE - 0.06, -ROAD_EDGE, near, far, this.paint(this.c.curb));
    this.groundQuad(canvas, vp, ROAD_EDGE, ROAD_EDGE + 0.06, near, far, this.paint(this.c.curb));
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

  private drawObjects(canvas: SkCanvas, vp: Viewport, e: GameEngine) {
    const list = this.list;
    list.length = 0;
    const obs = e.obstacles.items;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (!o.active) continue;
      const dz = o.z - e.distance;
      if (dz > 190 || dz + o.depth < vp.nearDz) continue;
      list.push({ dz: o.kind === "train" ? Math.max(dz, 0.01) : dz, kind: 0, idx: i });
    }
    const coins = e.coins.items;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.active) continue;
      const dz = c.z - e.distance;
      if (dz > 150 || dz < vp.nearDz + 1) continue;
      list.push({ dz, kind: 1, idx: i });
    }
    list.push({ dz: 0, kind: 2, idx: 0 });
    list.sort((a, b) => b.dz - a.dz);

    for (const d of list) {
      if (d.kind === 0) this.drawObstacle(canvas, vp, e, d.idx);
      else if (d.kind === 1) this.drawCoin(canvas, vp, e, d.idx);
      else this.drawPlayer(canvas, vp, e);
    }
  }

  private drawObstacle(canvas: SkCanvas, vp: Viewport, e: GameEngine, idx: number) {
    const o = e.obstacles.items[idx];
    const dz = o.z - e.distance;
    const fade = Math.max(0, Math.min(1, (190 - dz) / 50));
    if (o.kind === "train") {
      this.drawTrain(canvas, vp, o.lane, dz, o.depth, fade);
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

  private drawTrain(canvas: SkCanvas, vp: Viewport, lane: number, dz: number, depth: number, fade: number) {
    const im = this.s.train;
    const mpx = metrePx(vp);
    const half = 0.47;
    const aspect = im.height() / im.width();
    const heightM = 2 * half * TUNING.laneWidthM * aspect * 0.97;
    const zf = Math.max(dz, -1.5);
    const zb = Math.min(dz + depth, 260);
    const top = (z: number) => groundY(vp, z) - heightM * mpx * depthScale(vp, z);

    const at = (x: number, z: number, hFrac: number) => [laneX(vp, x, z), groundY(vp, z) - heightM * hFrac * mpx * depthScale(vp, z)];
    const quadAt = (x0: number, x1: number, z0: number, z1: number, h0: number, h1: number, color: SkColor, a: number) =>
      this.quad(canvas, [...at(x0, z0, h0), ...at(x1, z0, h1), ...at(x1, z1, h1), ...at(x0, z1, h0)], this.paint(color, a));

    if (lane !== 0) {
      const xs = lane < 0 ? lane + half : lane - half;
      this.quad(
        canvas,
        [laneX(vp, xs, zf), groundY(vp, zf), laneX(vp, xs, zf), top(zf), laneX(vp, xs, zb), top(zb), laneX(vp, xs, zb), groundY(vp, zb)],
        this.paint(this.c.trainSide, fade),
      );
      // Window band + orange stripe on the visible side.
      for (let z = dz + 1; z < zb - 1; z += 3.2) {
        const z0 = Math.max(z, zf);
        const z1 = Math.min(z + 2.2, zb);
        if (z1 > z0) {
          this.quad(canvas, [...at(xs, z0, 0.5), ...at(xs, z0, 0.82), ...at(xs, z1, 0.82), ...at(xs, z1, 0.5)], this.paint(this.c.trainGlass, fade));
        }
      }
      this.quad(canvas, [...at(xs, zf, 0.34), ...at(xs, zf, 0.42), ...at(xs, zb, 0.42), ...at(xs, zb, 0.34)], this.paint(this.c.trainStripe, fade));
    }
    this.quad(
      canvas,
      [laneX(vp, lane - half, zf), top(zf), laneX(vp, lane + half, zf), top(zf), laneX(vp, lane + half, zb), top(zb), laneX(vp, lane - half, zb), top(zb)],
      this.paint(this.c.trainRoof, fade),
    );
    // Roof rails + vents break up the flat roof.
    quadAt(lane - half, lane - half + 0.08, zf, zb, 1, 1, this.c.trainEdge, fade);
    quadAt(lane + half - 0.08, lane + half, zf, zb, 1, 1, this.c.trainEdge, fade);
    for (let z = dz + 2; z < zb - 1; z += 4.5) {
      if (z + 1.4 > zf) quadAt(lane - 0.18, lane + 0.18, Math.max(z, zf), z + 1.4, 1, 1, this.c.trainEdge, fade * 0.6);
    }
    if (dz >= -1.5) {
      const s = depthScale(vp, dz);
      const w = 2 * half * vp.lanePx * s;
      const h = w * aspect;
      const gy = groundY(vp, dz);
      this.image(canvas, im, laneX(vp, lane, dz) - w / 2, gy - h + h * 0.02, w, h, fade);
    }
  }

  private drawCoin(canvas: SkCanvas, vp: Viewport, e: GameEngine, idx: number) {
    const c = e.coins.items[idx];
    const dz = c.z - e.distance;
    const s = depthScale(vp, dz);
    const size = 0.36 * vp.lanePx * s;
    const spin = Math.abs(Math.cos(e.time * 5 + c.z * 0.3));
    const w = size * Math.max(0.22, spin);
    const cy = groundY(vp, dz) - c.y * metrePx(vp) * s;
    const fade = Math.max(0, Math.min(1, (150 - dz) / 40));
    this.image(canvas, this.s.coin, laneX(vp, c.lane, dz) - w / 2, cy - size / 2, w, size, fade);
  }

  private drawPlayer(canvas: SkCanvas, vp: Viewport, e: GameEngine) {
    const p = e.player;
    const x = laneX(vp, p.x, 0);
    const gy = groundY(vp, 0);
    const mpx = metrePx(vp);

    const sh = 1 - Math.min(0.5, p.y / 3.5);
    canvas.drawOval(
      Skia.XYWHRect(x - 0.3 * vp.lanePx * sh, gy - 0.06 * vp.lanePx, 0.6 * vp.lanePx * sh, 0.12 * vp.lanePx),
      this.paint(this.c.shadow, 0.35),
    );

    let im = this.s.rushRun;
    let wFrac = 0.6;
    if (p.sliding) {
      im = this.s.rushSlide;
      wFrac = 0.92;
    } else if (p.airborne) {
      im = this.s.rushJump;
      wFrac = 0.74;
    }
    const w = wFrac * vp.lanePx;
    const h = (w * im.height()) / im.width();
    const running = !p.sliding && !p.airborne && !e.crashed;
    const bob = running ? Math.abs(Math.sin(e.distance * 1.9)) * 0.035 * vp.lanePx : 0;
    const flip = running && Math.floor(e.distance / 1.65) % 2 === 1;
    const lean = (p.lane - p.x) * 0.0; // reserved for future tilt
    this.image(canvas, im, x - w / 2 + lean, gy - p.y * mpx - h + h * 0.03 - bob, w, h, 1, flip);
  }
}
